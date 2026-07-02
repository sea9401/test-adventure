import {
  parseEquipmentSave,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";
import { EQUIPMENT_V2_KEY } from "./saveKeys";
import { lockSaveForUpdate, upsertSave, type DbExecutor } from "./savesKv";

// equipment.v2(장비 개체 SSOT) append 의 표준 쓰기 경로 — 잠금→파싱→append→업서트.
// 발급 지점이 라우트마다 흩어져 각자 키 리터럴/파싱을 복붙하던 것을 단일화
// (#1322 죽은 키 오기입 사고 클래스 예방). 개체 생성 자체는 v2EquipMint 의 mint* 사용.
//
// ⚠️ 잠금 순서: 같은 tx 에서 character.v2 도 잠근다면 character → equipment 순서를 지킬 것
//    (buy/v2-grant/inbox-claim 관례). 이 함수는 equipment.v2 한 행만 잠근다.
export async function appendEquipInstances(
  tx: DbExecutor,
  userId: string,
  instances: readonly V2EquipInstance[],
): Promise<V2EquipInstance[]> {
  const save = await lockSaveForUpdate<Record<string, unknown>>(
    tx,
    userId,
    EQUIPMENT_V2_KEY,
    {},
  );
  const { owned, equipped } = parseEquipmentSave(save);
  const nextOwned = [...owned, ...instances];
  await upsertSave(tx, userId, EQUIPMENT_V2_KEY, {
    owned: nextOwned,
    equipped,
  });
  return nextOwned;
}
