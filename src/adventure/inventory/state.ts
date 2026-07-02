// 인벤토리(save key `inventory.v2`) 상태 모양 + 초기값.
// useInventory 훅은 호출처가 없어 은퇴(2026-07) — 남은 소비자는 순수 로직뿐이라
// 타입/초기값만 여기로 분리했다: starterSaves(시작 세이브), vaultOps·disassemble(순수 엔진).
import type { ConsumableId } from "../data/consumables";
import type { ItemId } from "../data/items";
import type { SkillBookId } from "../data/skillBooks";
import type { MaterialId } from "../data/materials";
import type { PotionId } from "../data/potions";
import type { RuneGrade, RuneId } from "../data/runes";
import type { EquipmentInstance } from "./equipmentInstances";

// 제작산 품질 등급 인스턴스 — itemId → (등급 문자열 "-2"|"-1"|"1"|"2" → 개수).
// 등급 0(일반)은 베이스와 동일하므로 별도로 두지 않고 equipment[] 에 합산한다.
export type CraftedEquipmentState = Partial<
  Record<ItemId, Partial<Record<string, number>>>
>;

// 드랍산 품질 등급 인스턴스 — itemId → (등급 문자열 "1"|"2" → 개수). 등급 0(기본)은 equipment[] 에 합산.
export type DroppedEquipmentState = Partial<
  Record<ItemId, Partial<Record<string, number>>>
>;

// 도감 보관함 — itemId → 변형 키("base"|"c±1"|"c±2"|"d1"|"d2") → 개수.
// 인벤에서 도감으로 넣은 장비를 보관하고, 꺼내면 인벤으로 돌아온다. discovered 로그와는 별개.
export type VaultState = Partial<Record<ItemId, Partial<Record<string, number>>>>;

export type InventoryState = {
  potions: Partial<Record<PotionId, number>>;
  equipment: Partial<Record<ItemId, number>>;
  /** 제작 품질 등급이 0(일반)이 아닌 장비. */
  craftedEquipment: CraftedEquipmentState;
  /** 드랍 품질 등급이 0(기본)이 아닌 장비(정교한/빼어난). */
  droppedEquipment: DroppedEquipmentState;
  /** 도감 보관함. */
  vault: VaultState;
  materials: Partial<Record<MaterialId, number>>;
  consumables: Partial<Record<ConsumableId, number>>;
  /**
   * 스킬북 — 사용 시 1개 소비되어 캐릭터에 AP 스킬 학습. 학습 후엔 책 자체는 의미 X
   * (학습 1회만 효과). 미학습 책은 마켓 거래 가능 (SKILL_BOOKS[id].tradable).
   */
  skillBooks?: Partial<Record<SkillBookId, number>>;
  // 종류별 포션 최대 보유 수의 추가 보너스. 보상으로 영구 누적.
  potionCapacityBonus?: number;
  /**
   * 룬 보유 — 룬 id × 등급(1~6) → 개수. 장착은 별도(CharacterDynamicState.equippedRunes),
   * 여기는 가방. 폐기/판매 개념은 없고 합성·장착 시 소비.
   */
  runes?: Partial<Record<RuneId, Partial<Record<RuneGrade, number>>>>;
  /**
   * 인스턴스 기반 장비 풀 — 별빛 재단 무구 5종(ENHANCEABLE_ITEM_IDS) 한정.
   * 한 자루 한 자루 고유 ID + 강화 단계 보존. craftTier 도 인스턴스 단위로 같이.
   * 일반 장비는 여기 들어가지 않는다 (equipment[] 그대로).
   */
  equipmentInstances?: EquipmentInstance[];
};

export const emptyInventory = (): InventoryState => ({
  potions: { potion_heal_s: 10 },
  equipment: {},
  craftedEquipment: {},
  droppedEquipment: {},
  vault: {},
  materials: { branch: 2 },
  consumables: {},
  skillBooks: {},
  runes: {},
  equipmentInstances: [],
});
