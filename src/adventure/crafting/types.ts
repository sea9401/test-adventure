// 제작(POST /api/craft) 의 클라↔서버 공유 타입. 서버 lib(lib/server/craft)도, 클라(page.tsx)도
// import 하므로 서버 전용 의존이 없는 이 파일에 둔다. (storage.ts 는 localStorage 라 클라 전용.)

import type { ItemId } from "../data/items";
import type { CraftTier } from "../data/craftQuality";
import type { PotionId } from "../data/potions";

// 한 번에 제작 가능한 최대 수량. 클라(입력 클램프) / 서버(검증) 양쪽이 같은 값을 봐야 한다.
// 포션 보유 한도(타입당 ~10) 보다 훨씬 크지만, 단일 트랜잭션 한 번에 너무 많은 등급 추첨/feed
// 삽입이 폭주하지 않도록 50 으로 막아 둔다.
export const CRAFT_BATCH_MAX = 50;

// "고급 재료 사용" opt-in — equip 재료의 등급별 소비량을 클라가 명시.
// 키는 recipe.ingredients[].itemId. 명시된 itemId 는 정확히 picks 대로 차감(자동 fallback 비활성),
// 비-기본 등급은 결과 등급 bias 적용. 명시 안 한 itemId 는 기존 동작(낮은 등급부터 자동).
export type EquipPicks = Record<
  string,
  {
    /** equipment[itemId] 에서 가져갈 갯수 — bias 영향 없음(0 등급). */
    base?: number;
    /** craftedEquipment[itemId][tierKey] — 키는 "-2"/"-1"/"1"/"2". */
    crafted?: Record<string, number>;
    /** droppedEquipment[itemId][qualityKey] — 키는 "1"/"2". */
    dropped?: Record<string, number>;
  }
>;

// 서버가 실제로 적용한 제작 결과 — 한 회분.
export type CraftResult =
  | { kind: "equipment"; itemId: ItemId; tier: CraftTier }
  | { kind: "potion"; potionId: PotionId; quantity: number };

// POST /api/craft 의 성공 응답 본체(ok 제외). 배치 제작 시 results 는 호출 수량만큼 채워지고,
// 단일 제작이면 길이 1. 등급 추첨은 회마다 독립이므로 같은 장비 레시피라도 results 안 각 원소의
// tier 가 다를 수 있다.
export type CraftOutcome = {
  inventory: Record<string, unknown>; // 새 inventory.v2 값
  crafting: Record<string, unknown>; // 새 crafting.v2 값
  /** 골드 차감 반영된 character.v2 — 클라가 잔액 갱신. 골드 비용 0 이면 변경 전과 동일. */
  character: Record<string, unknown>;
  results: CraftResult[];
  /** 차감된 총 골드 (= recipeGoldCost × quantity). */
  goldSpent: number;
};

const CRAFT_ERROR_MESSAGES: Record<string, string> = {
  unknown_recipe: "그런 제작서가 없다.",
  not_learned: "아직 익히지 않은 제작서다.",
  missing_material: "재료가 부족하다.",
  missing_ingredient: "필요한 장비가 부족하다.",
  potion_full: "포션을 더 들 수 없다.",
  insufficient_gold: "골드가 부족하다.",
  invalid_quantity: "제작 수량이 잘못됐다.",
  invalid_picks: "재료 선택이 잘못됐다.",
};

export function craftErrorMessage(code: string): string {
  return CRAFT_ERROR_MESSAGES[code] ?? "제작할 수 없다.";
}
