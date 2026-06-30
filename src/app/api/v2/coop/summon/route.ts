import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { coopBossSessions } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import {
  broadcastCoopNotice,
  expireStaleCoopSessions,
  findActiveCoopSessions,
} from "@/lib/server/v2Coop";
import {
  COOP_BOSSES,
  MAX_ACTIVE_PER_KIND,
  SUMMON_SCROLL_MATERIAL_ID,
  coopBossDurationMs,
  parseCoopBossKindId,
  parseCoopVisibility,
} from "@/adventure/data/v2/coopBosses";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";

// POST /api/v2/coop/summon — 소환서를 소모해 협동 보스 소환.
//
// 본문: { kind: CoopBossKindId }
// 같은 종류 동시 다수 소환 허용(#714) — 소환서 비용이 1차 게이트, MAX_ACTIVE_PER_KIND 는
// 목록/쿼리 비대화를 막는 느슨한 안전캡(엄밀 직렬화 없음 — 동시 소환 race 로 캡을 1~2
// 초과할 수 있으나 무해). 단일 트랜잭션: character.v2 잠금(공통 첫 락) → 소환서 검증·차감
// → 만료 sweep + 캡 확인 → 세션 INSERT(소환자 표시명 스냅샷).

type CharSave = { materials?: unknown; [k: string]: unknown };

export async function POST(req: Request) {
  const maybeUserId = await ensureUser();
  if (!maybeUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId: string = maybeUserId;

  let body: { kind?: unknown; visibility?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const kindId = parseCoopBossKindId(body.kind);
  if (!kindId) {
    return Response.json({ ok: false, error: "bad_kind" }, { status: 400 });
  }
  const kind = COOP_BOSSES[kindId];
  // 코어루프 — 소환자가 공개 범위를 고른다(공개/길드원만/소환자만). off 면 항상 public(현행).
  const visibility = V2_CORE_LOOP_V2
    ? parseCoopVisibility(body.visibility)
    : "public";

  let summoned = false;
  let summonerName = "모험가";
  let result: { status: number; body: Record<string, unknown> };
  try {
    result = await db.transaction(async (tx) => {
      const now = new Date();
      // === 1. character.v2 잠금 + 소환서 검증 ===
      const charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const mats: Record<string, number> =
        typeof charSave.materials === "object" && charSave.materials !== null
          ? { ...(charSave.materials as Record<string, number>) }
          : {};
      const have = Math.max(
        0,
        Math.floor(Number(mats[SUMMON_SCROLL_MATERIAL_ID]) || 0),
      );
      if (have < kind.scrollCost) {
        return {
          status: 409,
          body: {
            ok: false,
            error: "not_enough_scrolls",
            have,
            need: kind.scrollCost,
          },
        };
      }

      // === 2. 만료 sweep + 동시 소환 캡 ===
      await expireStaleCoopSessions(tx, now);
      const active = await findActiveCoopSessions(tx, kindId);
      if (active.length >= MAX_ACTIVE_PER_KIND) {
        return {
          status: 409,
          body: {
            ok: false,
            error: "too_many_active",
            cap: MAX_ACTIVE_PER_KIND,
          },
        };
      }

      // === 3. 소환서 차감 + 세션 생성 ===
      const remaining = have - kind.scrollCost;
      if (remaining > 0) mats[SUMMON_SCROLL_MATERIAL_ID] = remaining;
      else delete mats[SUMMON_SCROLL_MATERIAL_ID];
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        materials: mats,
      });
      // 소환자 표시명 스냅샷 — 인스턴스 구분 라벨("○○님이 소환").
      const profile = await readSave<{ name?: string } | null>(
        tx,
        userId,
        "character-profile.v2",
        null,
      );
      summonerName = profile?.name?.trim() || "모험가";
      // 소환 시점 길드 — 길드원 가시성 판정 기준(나중에 길드 바뀌어도 소환 당시 기준).
      const summonerGuildId = await getGuildId(tx, userId);
      // 길드 없는데 'guild_only' 면 본인 포함 아무도 못 침(소환서 낭비) → 'summoner_only' 로 강등.
      const storedVisibility =
        visibility === "guild_only" && summonerGuildId == null
          ? "summoner_only"
          : visibility;
      const sessionId = randomUUID();
      await tx.insert(coopBossSessions).values({
        id: sessionId,
        regionId: kindId,
        bossName: kind.name,
        hp: kind.sharedMaxHp,
        maxHp: kind.sharedMaxHp,
        spawnedAt: now,
        expiresAt: new Date(now.getTime() + coopBossDurationMs(kind)),
        regenPerMin: 0,
        lastRegenAt: null,
        summonedByName: summonerName,
        summonerId: userId,
        summonerGuildId,
        visibility: storedVisibility,
      });
      summoned = true;
      return {
        status: 200,
        body: {
          ok: true,
          sessionId,
          kind: kindId,
          scrollsLeft: remaining,
          expiresAt: now.getTime() + coopBossDurationMs(kind),
        },
      };
    });
  } catch (err) {
    console.error("[coop/summon] failed", err);
    return Response.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }

  // 소환 알림 — 전체 소식 피드 + 채팅 알림 탭(둘 다 부수 효과·실패 삼킴).
  // 코어루프 — 공개(public) 소환만 전체 브로드캐스트. 길드원만/소환자만은 목록에서만 노출.
  if (summoned && visibility === "public") {
    await insertFeedEntry(userId, "coop_summon", { kind: kindId });
    await broadcastCoopNotice(
      `${summonerName} 님이 「${kind.name}」을(를) 소환했다`,
    );
  }

  return Response.json(result.body, { status: result.status });
}
