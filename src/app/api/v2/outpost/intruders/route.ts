import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, outpostOccupations, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  isIntruderActive,
  isTileIntruderPresent,
  parseLastHuntedOutpost,
  tileIntruderEnteredAt,
} from "@/adventure/data/v2/intruderTracking";
import { RAID_MIN_TILE_STAY_MS } from "@/adventure/data/v2/settlementWarfareConfig";
import {
  isKnownOutpostId,
  parseTileOutpostId,
} from "@/adventure/data/v2/tileWarfare";
import { parseWarVigor } from "@/adventure/data/v2/warVigor";

// GET /api/v2/outpost/intruders?outpostId=...
//
// 점령 길드 멤버만 호출 가능. 거점에 TTL 안에 사냥한 적대(=다른 길드) 캐릭 목록 반환.
// 토벌 버튼 UI 가 이걸로 후보 목록 채움.
//
// 응답: { ok: true, intruders: Array<{userId, name, level, huntedAt}> }
//   - 권한 없음(점령 안 함 / 다른 길드) → 403 not_owner_guild
//   - outpost 모름 → 400
//   - 빈 결과는 [] (200)

type IntruderRow = {
  userId: string;
  name: string;
  level: number;
  huntedAt: number;
  source: "tile" | "hunt";
  stayMs: number;
  raidReady: boolean;
  warVigorHp: number;
  warVigorMp: number;
};

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const outpostId = url.searchParams.get("outpostId");
  if (!outpostId || !isKnownOutpostId(outpostId)) {
    return Response.json({ ok: false, error: "bad_outpost" }, { status: 400 });
  }
  const tilePos = parseTileOutpostId(outpostId);

  // 권한 검증 + 침입자 목록 조회 — 같은 tx 로 묶어 점령 변경 직후 stale 권한
  // race 방지.
  const queryResult = await db.transaction(async (tx) => {
    const occ = (
      await tx
        .select({ guildId: outpostOccupations.occupiedByGuildId })
        .from(outpostOccupations)
        .where(eq(outpostOccupations.outpostId, outpostId))
        .limit(1)
    )[0];
    if (!occ || occ.guildId == null) {
      return { error: "not_occupied" as const };
    }
    const viewerGuildId = await getGuildId(tx, userId);
    if (viewerGuildId == null || viewerGuildId !== occ.guildId) {
      return { error: "not_owner_guild" as const };
    }

    // JSON path 쿼리 — 사냥 침입(lastHuntedOutpost) 또는 타일 위 체류(tilePos)가 이 거점인 saves.
    // 인덱스 없어 풀스캔이지만 saves_kv 의 character.v2 row 수가 작은 v2 staging
    // 부하 수준에선 충분. 부하 측정 후 별도 인덱스/테이블 분리는 후속.
    const candidateRows = await tx
      .select({ userId: savesKv.userId, value: savesKv.value })
      .from(savesKv)
      .where(
        and(
          eq(savesKv.key, "character.v2"),
          tilePos
            ? sql`(${savesKv.value} -> 'lastHuntedOutpost' ->> 'outpostId' = ${outpostId} OR ((${savesKv.value} -> 'tilePos' ->> 'col')::int = ${tilePos.col} AND (${savesKv.value} -> 'tilePos' ->> 'row')::int = ${tilePos.row}))`
            : sql`${savesKv.value} -> 'lastHuntedOutpost' ->> 'outpostId' = ${outpostId}`,
        ),
      );

    // 자기 길드 멤버 set — 자기 자신 + 같은 길드원은 침입자 아님.
    const ownGuildRows = await tx
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, viewerGuildId));
    return {
      rows: candidateRows,
      ownGuildUserIds: new Set(ownGuildRows.map((r) => r.userId)),
    };
  });

  if ("error" in queryResult) {
    return Response.json(
      { ok: false, error: queryResult.error },
      { status: 403 },
    );
  }
  const { rows, ownGuildUserIds } = queryResult;

  const now = Date.now();
  const candidateUserIds: string[] = [];
  const candidateMeta = new Map<
    string,
    {
      huntedAt: number;
      level: number;
      source: "tile" | "hunt";
      stayMs: number;
      raidReady: boolean;
      warVigorHp: number;
      warVigorMp: number;
    }
  >();
  for (const row of rows) {
    if (ownGuildUserIds.has(row.userId)) continue;
    const v = row.value as {
      lastHuntedOutpost?: unknown;
      tilePos?: { col?: unknown; row?: unknown; at?: unknown };
      level?: unknown;
      warVigor?: unknown;
    } | null;
    if (!v) continue;
    const last = parseLastHuntedOutpost(v.lastHuntedOutpost);
    const tileIntruder =
      tilePos != null &&
      isTileIntruderPresent(v.tilePos, tilePos.col, tilePos.row);
    if (!tileIntruder && !isIntruderActive(last, outpostId, now)) continue;
    const huntedAt = tileIntruder
      ? tileIntruderEnteredAt(v.tilePos, now)
      : last!.at;
    const stayMs = tileIntruder ? Math.max(0, now - huntedAt) : 0;
    const warVigor = parseWarVigor(v.warVigor);
    candidateUserIds.push(row.userId);
    candidateMeta.set(row.userId, {
      huntedAt,
      level: typeof v.level === "number" ? v.level : 1,
      source: tileIntruder ? "tile" : "hunt",
      stayMs,
      raidReady: tileIntruder && stayMs >= RAID_MIN_TILE_STAY_MS,
      warVigorHp: warVigor.hp,
      warVigorMp: warVigor.mp,
    });
  }
  if (candidateUserIds.length === 0) {
    return Response.json({ ok: true, intruders: [] });
  }

  // 이름은 character-profile.v2.name. 다중 조회.
  const profileRows = await db
    .select({ userId: savesKv.userId, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.key, "character-profile.v2"),
        sql`${savesKv.userId} = ANY(${candidateUserIds})`,
      ),
    );
  const nameByUser = new Map<string, string>();
  for (const row of profileRows) {
    const v = row.value as { name?: string } | null;
    const name = v?.name?.trim();
    if (name) nameByUser.set(row.userId, name);
  }

  const intruders: IntruderRow[] = candidateUserIds.map((uid) => {
    const meta = candidateMeta.get(uid)!;
    return {
      userId: uid,
      name: nameByUser.get(uid) ?? "모험가",
      level: meta.level,
      huntedAt: meta.huntedAt,
      source: meta.source,
      stayMs: meta.stayMs,
      raidReady: meta.raidReady,
      warVigorHp: meta.warVigorHp,
      warVigorMp: meta.warVigorMp,
    };
  });
  // 최근 사냥 순으로 정렬.
  intruders.sort((a, b) => b.huntedAt - a.huntedAt);

  return Response.json({ ok: true, intruders });
}
