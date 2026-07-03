// v2 타일 전쟁 Phase 1 — 타일 정착지의 점령행 생성/정리 (서버 전용).
//
// 자유 타일 정착지를 합성 거점 id `tile:col,row` 점령행으로 전쟁 자산화한다.
//   - createTileOccupation: 창립자가 속한 길드 소유 점령행 생성. 무길드는 더 이상 솔로 점령행을 만들지 않는다.
//   - removeTileWarfare: 철거/함락 시 그 타일의 전쟁 행(점령/금고/수비큐/영주) 전부 정리.
//
// ⚠️ 누수 방지: occupations·war/overview GET 은 플래그 비게이트라, tile 점령행이 생기면
//   즉시 그 API 들에 노출된다. 그래서 "쓰기"(생성)는 호출부에서 V2_TILE_WARFARE 게이트 뒤에서만
//   호출한다(라이브 flag off → tile 행 0 → 무노출). 정리(remove)는 항상 안전(무행이면 no-op).

import { and, eq, inArray, isNull, like, or } from "drizzle-orm";
import { db } from "@/db";
import {
  guildMembers,
  outpostDefenders,
  outpostLords,
  outpostOccupations,
  outpostTreasury,
  outpostVillages,
  tileSettlements,
} from "@/db/schema";
import {
  buildTileOccupationValues,
  parseTileOutpostId,
  tileOutpostId,
  TILE_OUTPOST_PREFIX,
} from "@/adventure/data/v2/tileWarfare";
import type {
  TileCoord,
  TileSettlementTier,
} from "@/adventure/data/v2/tileConfig";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 창립자 소속 길드 점령행 생성 — 무길드는 솔로 영토 폐기 정책에 따라 no-op.
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
  const guildId = member?.guildId ?? null;
  if (guildId == null) {
    return { created: false, guildId: null };
  }

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

// 타일의 전쟁/정착 행 전부 정리(점령/금고/수비큐/영주 + 생산 마을). 무행이면 no-op — 항상 호출해도 안전.
//   ⚠️ outpost_villages(생산 보드: tier/슬롯/생산직/이름)도 지운다 — 빼면 철거 후 같은 (col,row)
//   재개척 시 옛 마을 생산 데이터가 부활한다(데모리시→재개척 잔류 버그). 솔로 막타 raze 경로와 동일.
//   소유자별 자원 풀(settlement resources)은 타일별이 아니라 공유라 여기서 건드리지 않는다.
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
  await tx.delete(outpostVillages).where(eq(outpostVillages.outpostId, id));
}

// === 멤버십 훅: 영토=길드 소유 모델 ====================================================
// 점령행 occupiedByGuildId 가 "영토 소유 길드"의 권위(me/state 지도도 이걸로 파생). founder 가
//   떠나도 길드가 정착지를 유지한다(소프트링크 폐기). 가입/창단=그 유저의 잔존 솔로 타일을 길드로
//   편입(convertSoloTilesToGuild). 탈퇴/추방=떠난 멤버만 분리(타일은 길드 잔류). 해산=중립화(빈 땅).

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

// 탈퇴/추방 — 떠난 멤버를 길드 타일에서 분리. 영토=길드 소유라 점령행(occupiedByGuildId)·정착지·
//   거점 금고는 그대로 둔다(길드가 정착지·세수 유지). 떠난 멤버의 영주/수비 등록만 정리(더는
//   길드원 아님 → 스테일 방지). tile id 한정. 무대상이면 no-op(항상 호출 안전).
export async function releaseMemberFromGuildTiles(
  tx: Tx,
  guildId: number,
  userId: string,
): Promise<void> {
  const rows = await tx
    .select({ outpostId: outpostOccupations.outpostId })
    .from(outpostOccupations)
    .where(
      and(
        eq(outpostOccupations.occupiedByGuildId, guildId),
        like(outpostOccupations.outpostId, `${TILE_OUTPOST_PREFIX}%`),
      ),
    );
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.outpostId);
  await tx
    .delete(outpostLords)
    .where(
      and(inArray(outpostLords.outpostId, ids), eq(outpostLords.userId, userId)),
    );
  await tx
    .delete(outpostDefenders)
    .where(
      and(
        inArray(outpostDefenders.outpostId, ids),
        eq(outpostDefenders.userId, userId),
      ),
    );
}

// 해산 — 그 길드의 전 타일 영토를 중립화(빈 땅). 영토=길드 소유라 길드가 사라지면 영토도 소멸:
//   점령행/거점 금고/수비큐/영주 + 생산 마을(outpost_villages) + 정착지(tile_settlements)
//   행까지 제거 → 그 칸은 다시 개척 가능. 점령행이 먼저 사라진 스테일 상태라도
//   outpost_villages.guildId 로 남은 건물 보드는 반드시 지운다.
//   (옛 "솔로 복귀"는 솔로 소유 폐기로 무의미.) 무대상이면 no-op.
export async function neutralizeGuildTiles(
  tx: Tx,
  guildId: number,
): Promise<void> {
  const occupationRows = await tx
    .select({ outpostId: outpostOccupations.outpostId })
    .from(outpostOccupations)
    .where(
      and(
        eq(outpostOccupations.occupiedByGuildId, guildId),
        like(outpostOccupations.outpostId, `${TILE_OUTPOST_PREFIX}%`),
      ),
    );
  const villageRows = await tx
    .select({ outpostId: outpostVillages.outpostId })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  const ids = Array.from(
    new Set([
      ...occupationRows.map((r) => r.outpostId),
      ...villageRows.map((r) => r.outpostId),
    ]),
  );
  if (ids.length === 0) return;
  await tx.delete(outpostTreasury).where(inArray(outpostTreasury.outpostId, ids));
  await tx
    .delete(outpostDefenders)
    .where(inArray(outpostDefenders.outpostId, ids));
  await tx.delete(outpostLords).where(inArray(outpostLords.outpostId, ids));
  await tx.delete(outpostVillages).where(inArray(outpostVillages.outpostId, ids));
  await tx
    .delete(outpostOccupations)
    .where(inArray(outpostOccupations.outpostId, ids));
  // 정착지(물리) 행도 제거 — guild FK 가 없어 크론 캐스케이드가 못 지움(직접 정리).
  const coords = ids
    .map((id) => parseTileOutpostId(id))
    .filter((c): c is TileCoord => c != null);
  if (coords.length > 0) {
    await tx.delete(tileSettlements).where(
      or(
        ...coords.map((c) =>
          and(eq(tileSettlements.col, c.col), eq(tileSettlements.row, c.row)),
        ),
      ),
    );
  }
}
