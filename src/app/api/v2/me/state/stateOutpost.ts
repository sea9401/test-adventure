// /api/v2/me/state 의 DB 접촉 섹션 — 현 거점 카드(currentOutpost)와 자유 타일 정착지 목록.
// 순수 섹션(stateSections.ts)과 달리 조회가 필요해 분리. 응답 shape 는 추출 전과 동일.
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  guilds,
  outpostLords,
  outpostOccupations,
  outpostTreasury,
  tileSettlements,
} from "@/db/schema";
import { resolveUserDisplayName } from "@/lib/server/serverFeed";
import {
  resolveOutpostMeta,
  tileOutpostId,
} from "@/adventure/data/v2/tileWarfare";

// V2TopBar 좌측 표시 + V2AdventureHome 거점 카드용 occupation(보유 길드/세율/정책/다음 공격).
// row 없으면 occupation=null (NPC 운영). 점령 길드 name 별도 select.
export type OccupationInfo = {
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedByGuildName: string | null;
  occupiedAt: string;
  policy: string;
  taxRate: string;
  nextAttackAt: string;
  // 거점 영주 표시명 — 점령 길드가 임명한 영주(없으면 null). 거점 카드 "영주" 행.
  lordName: string | null;
};
export type CurrentOutpost = {
  id: string;
  name: string;
  occupation: OccupationInfo | null;
  // 거점 금고 — 점령 길드원이 회수 가능한 누적 세금. 미점령 거점도 누적될 수 있어 별도 노출.
  treasuryGold: number;
};

// character.v2.lastVisitedOutpost.outpostId → 거점 카드 데이터. null = 아직 방문 없음("이동 중").
export async function loadCurrentOutpost(
  lastVisitId: unknown,
): Promise<CurrentOutpost | null> {
  if (typeof lastVisitId !== "string") return null;
  const o = resolveOutpostMeta(lastVisitId);
  if (!o) return null;
  const occRow = (
    await db
      .select()
      .from(outpostOccupations)
      .where(eq(outpostOccupations.outpostId, o.id))
      .limit(1)
  )[0];
  let occupation: OccupationInfo | null = null;
  if (occRow) {
    let occGuildName: string | null = null;
    let lordName: string | null = null;
    if (occRow.occupiedByGuildId != null) {
      const g = (
        await db
          .select({ name: guilds.name })
          .from(guilds)
          .where(eq(guilds.id, occRow.occupiedByGuildId))
          .limit(1)
      )[0];
      occGuildName = g?.name ?? null;
      // 거점 영주 — 임명 길드가 현재 점령 길드와 같을 때만 유효(거점 양도 시 스테일 무시).
      const lordRow = (
        await db
          .select({
            userId: outpostLords.userId,
            guildId: outpostLords.guildId,
          })
          .from(outpostLords)
          .where(eq(outpostLords.outpostId, o.id))
          .limit(1)
      )[0];
      if (lordRow && lordRow.guildId === occRow.occupiedByGuildId) {
        lordName = await resolveUserDisplayName(lordRow.userId);
      }
    }
    occupation = {
      occupiedByUserId: occRow.occupiedByUserId,
      occupiedByGuildId: occRow.occupiedByGuildId,
      occupiedByGuildName: occGuildName,
      occupiedAt: occRow.occupiedAt.toISOString(),
      policy: occRow.policy,
      taxRate: occRow.taxRate,
      nextAttackAt: occRow.nextAttackAt.toISOString(),
      lordName,
    };
  }
  const treasuryRow = (
    await db
      .select({ gold: outpostTreasury.gold })
      .from(outpostTreasury)
      .where(eq(outpostTreasury.outpostId, o.id))
      .limit(1)
  )[0];
  return {
    id: o.id,
    name: o.name,
    occupation,
    treasuryGold: Math.max(0, treasuryRow?.gold ?? 0),
  };
}

// 자유 타일 지도 개척 정착지 — 보드 ≤81칸이라 전부 조회. 정착지의 "길드 귀속"은 점령행
// occupiedByGuildId(권위)로 파생 — 영토=길드 소유 모델(founder 가 떠나도 길드가 유지).
// 모험 탭 "현 위치" 카드가 거점 카드와 동일 정보(소속/세율/정책/영주/금고)를 쓰므로
// 점령행의 정책·세율, 거점 금고, 영주까지 칸별로 동봉(전부 N+1 회피 일괄 조회).
export async function loadFreeformTileSettlements() {
  const rows = await db.select().from(tileSettlements);
  if (rows.length === 0) return [];
  // 타일 점령행 일괄 조회(N+1 회피) → 칸별 소유 길드/정책/세율.
  const tileIds = rows.map((r) => tileOutpostId(r.col, r.row));
  const occRows = await db
    .select({
      outpostId: outpostOccupations.outpostId,
      guildId: outpostOccupations.occupiedByGuildId,
      policy: outpostOccupations.policy,
      taxRate: outpostOccupations.taxRate,
    })
    .from(outpostOccupations)
    .where(inArray(outpostOccupations.outpostId, tileIds));
  const occByTileId = new Map(occRows.map((o) => [o.outpostId, o]));
  // 거점 금고(타일별 누적 세금) 일괄 조회.
  const treasuryRows = await db
    .select({
      outpostId: outpostTreasury.outpostId,
      gold: outpostTreasury.gold,
    })
    .from(outpostTreasury)
    .where(inArray(outpostTreasury.outpostId, tileIds));
  const treasuryByTileId = new Map(treasuryRows.map((t) => [t.outpostId, t.gold]));
  // 영주(임명행) 일괄 조회 — 임명 길드 == 현재 점령 길드일 때만 유효(양도 시 스테일 무시).
  const lordRows = await db
    .select({
      outpostId: outpostLords.outpostId,
      userId: outpostLords.userId,
      guildId: outpostLords.guildId,
    })
    .from(outpostLords)
    .where(inArray(outpostLords.outpostId, tileIds));
  const lordByTileId = new Map(lordRows.map((l) => [l.outpostId, l]));
  // 길드 id → 이름/색 일괄 조회(지도 길드색·길드홈 표시용).
  const gIds = [
    ...new Set(
      occRows.map((o) => o.guildId).filter((g): g is number => g != null),
    ),
  ];
  const guildNameById = new Map<number, string>();
  const guildColorById = new Map<number, string>();
  if (gIds.length > 0) {
    const gs = await db
      .select({ id: guilds.id, name: guilds.name, color: guilds.color })
      .from(guilds)
      .where(inArray(guilds.id, gIds));
    for (const g of gs) {
      guildNameById.set(g.id, g.name);
      if (g.color != null) guildColorById.set(g.id, g.color);
    }
  }
  // 유효 영주 표시명 일괄 resolve(임명 길드 == 점령 길드인 칸만).
  const lordNameById = new Map<string, string>();
  await Promise.all(
    [
      ...new Set(
        rows
          .map((r) => {
            const id = tileOutpostId(r.col, r.row);
            const occ = occByTileId.get(id);
            const lord = lordByTileId.get(id);
            return lord &&
              occ &&
              lord.guildId != null &&
              lord.guildId === occ.guildId
              ? lord.userId
              : null;
          })
          .filter((u): u is string => u != null),
      ),
    ].map(async (uid) => {
      lordNameById.set(uid, await resolveUserDisplayName(uid));
    }),
  );
  return rows.map((r) => {
    const id = tileOutpostId(r.col, r.row);
    const occ = occByTileId.get(id);
    const gid = occ?.guildId ?? null;
    const lord = lordByTileId.get(id);
    const lordValid =
      lord != null &&
      occ != null &&
      lord.guildId != null &&
      lord.guildId === occ.guildId;
    return {
      col: r.col,
      row: r.row,
      userId: r.userId,
      tier: r.tier,
      name: r.name,
      guildId: gid,
      guildName: gid != null ? (guildNameById.get(gid) ?? null) : null,
      guildColor: gid != null ? (guildColorById.get(gid) ?? null) : null,
      // 거점 카드와 동일 정보 — 점령행 없는 고아면 null/0.
      policy: occ?.policy ?? null,
      taxRate: occ?.taxRate ?? null,
      lordName: lordValid ? (lordNameById.get(lord.userId) ?? null) : null,
      treasuryGold: Math.max(0, treasuryByTileId.get(id) ?? 0),
    };
  });
}
