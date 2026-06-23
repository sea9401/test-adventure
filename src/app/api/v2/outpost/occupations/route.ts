import { db } from "@/db";
import {
  outpostOccupations,
  outpostTreasury,
  outpostVillages,
  guilds,
} from "@/db/schema";
import { gt, inArray, isNotNull } from "drizzle-orm";
import { currentFortHp } from "@/adventure/data/v2/outpostSiege";
import { isKnownOutpostId } from "@/adventure/data/v2/tileWarfare";

// GET /api/v2/outpost/occupations — 모든 점령된 거점 상태 조회.
// 응답: { occupations: [...], treasuries: [{ outpostId, gold }] }
// row 없는 거점 = NPC 운영(비점령). 클라가 OUTPOSTS 데이터와 join 해서 표시.
// treasuries — 금고가 쌓인 거점(주로 미점령·NPC 세금). 지도/거점 화면의 점령 유인 표시용.
//
// 인증 불필요 — 점령 상태는 공개 정보 (모든 유저가 지도에서 본다).

export async function GET() {
  const [rawRows, rawTreasury, villageRows] = await Promise.all([
    db.select().from(outpostOccupations),
    db
      .select({ outpostId: outpostTreasury.outpostId, gold: outpostTreasury.gold })
      .from(outpostTreasury)
      .where(gt(outpostTreasury.gold, 0)),
    // 마을 건설 = 거점 이름 덮어쓰기. 이름 지은 마을만(name not null).
    db
      .select({
        outpostId: outpostVillages.outpostId,
        name: outpostVillages.name,
      })
      .from(outpostVillages)
      .where(isNotNull(outpostVillages.name)),
  ]);
  // 고아 행 거르기 — 현재 거점 데이터(OUTPOSTS)에 없는 outpostId(옛 지도 축소 잔재)는 제외.
  const rows = rawRows.filter((r) => isKnownOutpostId(r.outpostId));
  const treasuryRows = rawTreasury.filter((t) => isKnownOutpostId(t.outpostId));
  const now = new Date();
  const villageNameById = new Map<string, string>();
  for (const v of villageRows) {
    if (v.name != null) villageNameById.set(v.outpostId, v.name);
  }

  // 점령 길드 id → 이름 일괄 조회(N+1 회피). 지도 팝업에서 "○○ 길드 점령" 표시용.
  const guildIds = [
    ...new Set(
      rows
        .map((r) => r.occupiedByGuildId)
        .filter((id): id is number => id != null),
    ),
  ];
  const guildNameById = new Map<number, string>();
  const guildEmblemById = new Map<number, string>();
  const guildColorById = new Map<number, string>();
  if (guildIds.length > 0) {
    const gs = await db
      .select({
        id: guilds.id,
        name: guilds.name,
        emblem: guilds.emblem,
        color: guilds.color,
      })
      .from(guilds)
      .where(inArray(guilds.id, guildIds));
    for (const g of gs) {
      guildNameById.set(g.id, g.name);
      if (g.emblem != null) guildEmblemById.set(g.id, g.emblem);
      if (g.color != null) guildColorById.set(g.id, g.color);
    }
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
      occupiedByGuildEmblem:
        r.occupiedByGuildId != null
          ? (guildEmblemById.get(r.occupiedByGuildId) ?? null)
          : null,
      occupiedByGuildColor:
        r.occupiedByGuildId != null
          ? (guildColorById.get(r.occupiedByGuildId) ?? null)
          : null,
      occupiedAt: r.occupiedAt.toISOString(),
      policy: r.policy,
      taxRate: r.taxRate,
      nextAttackAt: r.nextAttackAt.toISOString(),
      // 성벽 HP — 재생 반영 현재값(lazy). 클라가 거점 화면서 공성 진행도 표시.
      fortHp: currentFortHp(r.fortHp, r.fortMaxHp, r.fortUpdatedAt, now),
      fortMaxHp: r.fortMaxHp,
      protectedUntil: r.protectedUntil.toISOString(),
      villageName: villageNameById.get(r.outpostId) ?? null,
    })),
    treasuries: treasuryRows,
  });
}
