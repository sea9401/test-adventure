// v2 타일 전쟁 Phase 1 — 타일 정착지의 길드 점령행 생성/정리 (서버 전용).
//
// 자유 타일 정착지(개인 userId 소유)를 합성 거점 id `tile:col,row` 점령행으로 길드 자산화한다.
//   - createTileGuildOccupation: 창립자가 길드원이면 길드 점령행 생성(개인=비-전쟁 정착지).
//   - removeTileWarfare: 철거/함락 시 그 타일의 전쟁 행(점령/금고/수비큐/영주) 전부 정리.
//
// ⚠️ 누수 방지: occupations·war/overview GET 은 플래그 비게이트라, tile 점령행이 생기면
//   즉시 그 API 들에 노출된다. 그래서 "쓰기"(생성)는 호출부에서 V2_TILE_WARFARE 게이트 뒤에서만
//   호출한다(라이브 flag off → tile 행 0 → 무노출). 정리(remove)는 항상 안전(무행이면 no-op).

import { eq } from "drizzle-orm";
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
} from "@/adventure/data/v2/tileWarfare";
import type { TileSettlementTier } from "@/adventure/data/v2/tileConfig";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 창립자의 길드 점령행 생성. 길드 미소속이면 점령행 없이 통과(개인 정착지=전쟁 대상 아님).
//   onConflictDoNothing — 드문 고아 행과 충돌해도 tx abort 회피(insert 에러=tx 중단이라 금지).
export async function createTileGuildOccupation(
  tx: Tx,
  args: { userId: string; col: number; row: number; tier: TileSettlementTier },
): Promise<{ created: boolean; guildId: number | null }> {
  const { userId, col, row, tier } = args;
  const [member] = await tx
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!member) return { created: false, guildId: null };

  const values = buildTileOccupationValues({
    userId,
    guildId: member.guildId,
    col,
    row,
    tier,
    now: Date.now(),
  });
  await tx.insert(outpostOccupations).values(values).onConflictDoNothing();
  return { created: true, guildId: member.guildId };
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
