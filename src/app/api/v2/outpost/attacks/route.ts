import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { guilds, outpostClaimAttempts } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { resolveUserDisplayName } from "@/lib/server/serverFeed";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";

// GET /api/v2/outpost/attacks?outpostId=...
//
// 거점의 최근 공격 기록 — outpost_claim_attempts 를 수비측 시점으로 노출.
// 인증된 누구나 열람 가능(공격자 정찰용) — 소유 탭과 비-소유(공격자) 탭이
// 같은 컴포넌트를 공유한다. 읽기 전용이라 소유권 게이트 없음.
//
// 응답: { ok: true, attacks: Array<{id, attackerName, attackerGuildName, npc,
//         attackerWon, turns, at}> }
//   - npc=true 행은 NPC 정기 공격 — 원본 won 의미가 "점령자(수비) 승리"라
//     attackerWon 으로 정규화해서 내려보낸다 (클라가 의미 분기 안 하게).
//   - 미인증 → 401
//   - outpost 모름 → 400

const ATTACK_LOG_LIMIT = 20;

type AttackRow = {
  id: number;
  attackerName: string | null;
  attackerGuildName: string | null;
  npc: boolean;
  attackerWon: boolean;
  turns: number;
  at: string;
  // 전투 리플레이 존재 여부 — 본문은 attacks/replay GET 으로 단건 조회 (목록
  // 응답에 jsonb 통째 동봉하면 20건 × 수십 KB 비대).
  hasReplay: boolean;
};

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const outpostId = url.searchParams.get("outpostId");
  if (!outpostId || !OUTPOSTS.some((o) => o.id === outpostId)) {
    return Response.json({ ok: false, error: "bad_outpost" }, { status: 400 });
  }

  // 공격 기록은 정찰 정보 — 인증된 누구나 읽기 가능(소유권 게이트 없음).

  const rows = await db
    .select({
      id: outpostClaimAttempts.id,
      attackerUserId: outpostClaimAttempts.attackerUserId,
      attackerGuildId: outpostClaimAttempts.attackerGuildId,
      defenderName: outpostClaimAttempts.defenderName,
      won: outpostClaimAttempts.won,
      turns: outpostClaimAttempts.turns,
      createdAt: outpostClaimAttempts.createdAt,
      hasReplay: sql<boolean>`(${outpostClaimAttempts.replay} is not null)`,
    })
    .from(outpostClaimAttempts)
    .where(eq(outpostClaimAttempts.outpostId, outpostId))
    .orderBy(desc(outpostClaimAttempts.id))
    .limit(ATTACK_LOG_LIMIT);

  // 라벨 일괄 해석 — 길드명 inArray 1회 + 공격자 닉네임(중복 제거) 개별 해석.
  // 행 수가 ATTACK_LOG_LIMIT 캡이라 N+1 비용 작음 (war/overview 와 같은 패턴).
  const guildIds = [
    ...new Set(
      rows
        .map((r) => r.attackerGuildId)
        .filter((id): id is number => id != null),
    ),
  ];
  const guildNameById = new Map<number, string>();
  if (guildIds.length > 0) {
    const gs = await db
      .select({ id: guilds.id, name: guilds.name })
      .from(guilds)
      .where(inArray(guilds.id, guildIds));
    for (const g of gs) guildNameById.set(g.id, g.name);
  }
  const attackerIds = [
    ...new Set(
      rows
        .map((r) => r.attackerUserId)
        .filter((id): id is string => id != null),
    ),
  ];
  const nameByUserId = new Map<string, string>();
  for (const id of attackerIds) {
    nameByUserId.set(id, await resolveUserDisplayName(id));
  }

  const attacks: AttackRow[] = rows.map((r) => {
    const npc = r.attackerUserId == null;
    return {
      id: r.id,
      // NPC 정기 공격 행은 defenderName 에 공격해 온 NPC 챔피언 이름이 들어있다.
      attackerName: npc
        ? r.defenderName
        : (nameByUserId.get(r.attackerUserId!) ?? "모험가"),
      attackerGuildName:
        r.attackerGuildId != null
          ? (guildNameById.get(r.attackerGuildId) ?? null)
          : null,
      npc,
      attackerWon: npc ? !r.won : r.won,
      turns: r.turns,
      at: r.createdAt.toISOString(),
      hasReplay: r.hasReplay,
    };
  });

  return Response.json({ ok: true, attacks });
}
