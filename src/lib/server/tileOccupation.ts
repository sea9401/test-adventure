// v2 타일 전쟁 Phase 1 — 타일 정착지의 점령행 생성/정리 (서버 전용).
//
// 자유 타일 정착지(개인 userId 소유)를 합성 거점 id `tile:col,row` 점령행으로 전쟁 자산화한다.
//   - createTileOccupation: 창립자 소유 점령행 생성(길드원=길드 소유·무길드=솔로 소유).
//   - removeTileWarfare: 철거/함락 시 그 타일의 전쟁 행(점령/금고/수비큐/영주) 전부 정리.
//
// ⚠️ 누수 방지: occupations·war/overview GET 은 플래그 비게이트라, tile 점령행이 생기면
//   즉시 그 API 들에 노출된다. 그래서 "쓰기"(생성)는 호출부에서 V2_TILE_WARFARE 게이트 뒤에서만
//   호출한다(라이브 flag off → tile 행 0 → 무노출). 정리(remove)는 항상 안전(무행이면 no-op).

import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import {
  guildMembers,
  outpostDefenders,
  outpostLords,
  outpostOccupations,
  outpostTreasury,
} from "@/db/schema";
import {
  buildTileOccupationValues,
  tileOutpostId,
  TILE_OUTPOST_PREFIX,
} from "@/adventure/data/v2/tileWarfare";
import type { TileSettlementTier } from "@/adventure/data/v2/tileConfig";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 창립자 소유 점령행 생성 — 길드원이면 길드 소유, 무길드면 솔로 소유(occupiedByGuildId=null).
//   솔로 점령행도 전쟁 대상(정복 가능)이라 빠짐없이 생성한다(옛 "무길드=no-op" 폐기).
//   onConflictDoNothing — 드문 고아 행과 충돌해도 tx abort 회피(insert 에러=tx 중단이라 금지).
export async function createTileOccupation(
  tx: Tx,
  args: { userId: string; col: number; row: number; tier: TileSettlementTier },
): Promise<{ created: boolean; guildId: number | null }> {
  const { userId, col, row, tier } = args;
  const [member] = await tx
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  const guildId = member?.guildId ?? null; // null = 솔로(무길드) 점령행

  const values = buildTileOccupationValues({
    userId,
    guildId,
    col,
    row,
    tier,
    now: Date.now(),
  });
  await tx.insert(outpostOccupations).values(values).onConflictDoNothing();
  return { created: true, guildId };
}

// 타일의 전쟁 행 전부 정리(점령/금고/수비큐/영주). 무행이면 no-op — 항상 호출해도 안전.
export async function removeTileWarfare(
  tx: Tx,
  col: number,
  row: number,
): Promise<void> {
  const id = tileOutpostId(col, row);
  await tx.delete(outpostOccupations).where(eq(outpostOccupations.outpostId, id));
  await tx.delete(outpostTreasury).where(eq(outpostTreasury.outpostId, id));
  await tx.delete(outpostDefenders).where(eq(outpostDefenders.outpostId, id));
  await tx.delete(outpostLords).where(eq(outpostLords.outpostId, id));
}

// === 멤버십 동기화: 타일 점령행 길드 = 소유자의 현재 길드 ============================
// "타일=소유자의 현재 길드 따라감" 통일 모델. 멤버십 변경 훅(가입/탈퇴/추방/해산)에서 호출해
//   점령행 occupiedByGuildId 를 소유자 길드와 맞춘다 → 지도 소프트링크(소유자→길드)와 항상 일치.
//   가입 솔로 타일이 길드 전쟁 자산이 되고, 탈퇴 시 솔로로 복귀. tile id 한정(카탈로그 무접촉).

// 가입/길드생성 — 그 유저 소유 솔로 타일 점령행을 새 길드로 전환. 가입 시점엔 무길드라 그의
//   타일은 전부 솔로(guildId null) → guildId 로 set(isNull 가드는 스테일 방어).
export async function convertSoloTilesToGuild(
  tx: Tx,
  userId: string,
  guildId: number,
): Promise<void> {
  await tx
    .update(outpostOccupations)
    .set({ occupiedByGuildId: guildId })
    .where(
      and(
        eq(outpostOccupations.occupiedByUserId, userId),
        isNull(outpostOccupations.occupiedByGuildId),
        like(outpostOccupations.outpostId, `${TILE_OUTPOST_PREFIX}%`),
      ),
    );
}

// 탈퇴/추방/해산 — 길드 타일 점령행을 솔로로 복귀(occupiedByGuildId=null). 솔로엔 무의미한
//   수비큐/영주/금고 정리. opts.userId=그 멤버 타일만(탈퇴/추방), 생략=그 길드 전 타일(해산).
//   opts.depositTreasury=거점 금고를 길드 금고로 입금 후 정리(탈퇴/추방=골드 보존)·해산=false
//   (길드 금고가 곧 소멸이라 입금 무의미).
export async function revertGuildTilesToSolo(
  tx: Tx,
  opts: { guildId: number; userId?: string; depositTreasury: boolean },
): Promise<void> {
  const conds = [
    eq(outpostOccupations.occupiedByGuildId, opts.guildId),
    like(outpostOccupations.outpostId, `${TILE_OUTPOST_PREFIX}%`),
  ];
  if (opts.userId != null) {
    conds.push(eq(outpostOccupations.occupiedByUserId, opts.userId));
  }
  const rows = await tx
    .select({ outpostId: outpostOccupations.outpostId })
    .from(outpostOccupations)
    .where(and(...conds));
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.outpostId);
  // 거점 금고: 탈퇴/추방=길드 금고로 입금(골드 보존)·해산=소멸(입금 생략). 이후 행 제거.
  if (opts.depositTreasury) {
    const treas = await tx
      .select({ gold: outpostTreasury.gold })
      .from(outpostTreasury)
      .where(inArray(outpostTreasury.outpostId, ids));
    const total = treas.reduce((s, t) => s + Math.max(0, t.gold ?? 0), 0);
    if (total > 0) {
      const gr = await lockGuildResources(tx, opts.guildId);
      await upsertGuildResources(tx, opts.guildId, { gold: gr.gold + total });
    }
  }
  await tx.delete(outpostTreasury).where(inArray(outpostTreasury.outpostId, ids));
  await tx
    .delete(outpostDefenders)
    .where(inArray(outpostDefenders.outpostId, ids));
  await tx.delete(outpostLords).where(inArray(outpostLords.outpostId, ids));
  await tx
    .update(outpostOccupations)
    .set({ occupiedByGuildId: null })
    .where(inArray(outpostOccupations.outpostId, ids));
}
