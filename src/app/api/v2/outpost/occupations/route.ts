import { db } from "@/db";
import { outpostOccupations, outpostTreasury, guilds } from "@/db/schema";
import { gt, inArray } from "drizzle-orm";
import { currentFortHp } from "@/adventure/data/v2/outpostSiege";

// GET /api/v2/outpost/occupations — 모든 점령된 거점 상태 조회.
// 응답: { occupations: [...], treasuries: [{ outpostId, gold }] }
// row 없는 거점 = NPC 운영(비점령). 클라가 OUTPOSTS 데이터와 join 해서 표시.
// treasuries — 금고가 쌓인 거점(주로 미점령·NPC 세금). 지도/거점 화면의 점령 유인 표시용.
//
// 인증 불필요 — 점령 상태는 공개 정보 (모든 유저가 지도에서 본다).

export async function GET() {
  const [rows, treasuryRows] = await Promise.all([
    db.select().from(outpostOccupations),
    db
      .select({ outpostId: outpostTreasury.outpostId, gold: outpostTreasury.gold })
      .from(outpostTreasury)
      .where(gt(outpostTreasury.gold, 0)),
  ]);
  const now = new Date();

  // 점령 길드 id → 이름 일괄 조회(N+1 회피). 지도 팝업에서 "○○ 길드 점령" 표시용.
  const guildIds = [
    ...new Set(
      rows
        .map((r) => r.occupiedByGuildId)
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

  return Response.json({
    occupations: rows.map((r) => ({
      outpostId: r.outpostId,
      occupiedByUserId: r.occupiedByUserId,
      occupiedByGuildId: r.occupiedByGuildId,
      occupiedByGuildName:
        r.occupiedByGuildId != null
          ? (guildNameById.get(r.occupiedByGuildId) ?? null)
          : null,
      occupiedAt: r.occupiedAt.toISOString(),
      policy: r.policy,
      taxRate: r.taxRate,
      nextAttackAt: r.nextAttackAt.toISOString(),
      // 성벽 HP — 재생 반영 현재값(lazy). 클라가 거점 화면서 공성 진행도 표시.
      fortHp: currentFortHp(r.fortHp, r.fortMaxHp, r.fortUpdatedAt, now),
      fortMaxHp: r.fortMaxHp,
      protectedUntil: r.protectedUntil.toISOString(),
    })),
    treasuries: treasuryRows,
  });
}
