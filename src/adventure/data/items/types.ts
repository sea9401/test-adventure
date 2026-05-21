import type { CraftVariance } from "../craftQuality";

export type EquipSlot = "weapon" | "armor" | "accessory";

// 5단계 등급. 미지정은 common 으로 취급.
// common 은 기본 zinc 톤, 나머지는 색깔로 강조.
// unique 는 rare 위 / legendary 아래 — "특별한 한 자루" 급 보라색.
export type ItemRarity = "common" | "uncommon" | "rare" | "unique" | "legendary";

export type EquipBonus = {
  atk?: number;
  def?: number;
  str?: number;
  dex?: number;
  vit?: number;
  spd?: number;
  luk?: number;
};

// 보너스 키 ↔ 한글 라벨. EquipItem.stats 의 label 과 일치 — 제작 등급 stats 재생성·
// 인벤 비교 diff 등에서 공용으로 쓴다.
export const BONUS_LABELS: Record<keyof EquipBonus, string> = {
  atk: "공격력",
  def: "방어력",
  str: "힘",
  dex: "민첩",
  vit: "활력",
  spd: "속도",
  luk: "행운",
};

export const BONUS_KEYS = Object.keys(BONUS_LABELS) as (keyof EquipBonus)[];

// stats 표시용 — "+3" / "-2" / "+0".
export function signedBonus(n: number): string {
  return (n >= 0 ? "+" : "") + n;
}

// 진행 구간 티어 — 1 입문 / 2 정착 / 3 다리 구간 / 4 봉황·화산 / 5 엔드 / 6 별빛.
// 인벤토리·도감·대장간 UI에서 장비를 진행 구간별로 그룹화하는 용도.
// 미지정 장비는 EQUIP_TIER_FALLBACK("입문") 으로 묶임 — 신규 장비 추가 시 한 줄만 적어두면 됨.
export type EquipTier = 1 | 2 | 3 | 4 | 5 | 6;

export type EquipItem = {
  name: string;
  slot: EquipSlot;
  stats: { label: string; value: string }[];
  bonus?: EquipBonus;
  description?: string;
  // 거래소 등록 가능 여부. 미지정/true 면 거래 가능.
  // 시작 장비·서사 아이템 등에는 false 로 막는다.
  tradable?: boolean;
  // 상점(BuyTab '장비' 칸)에서 이 가격에 구매 가능. 미지정이면 상점 미취급 — 현재는 초반 발판용 싸구려 장비 한두 종.
  shopPrice?: number;
  // 상점 노출 게이트. 미지정이면 항상 노출. 지정 시 해당 crafting flag 가 true 일 때만 노출.
  // 의뢰 보상으로 받는 장비를 분실 시에만 재구매 가능하게 하면서 보상 자체는 스포일러 안 되게.
  shopGate?: "boldQuestComplete";
  rarity?: ItemRarity;
  // 드랍 품질 등급(정교한/빼어난) variance override. 미지정이면 "주력 양수 스탯 +q×1" 기본 규칙.
  // 드랍 경로(dropQuality.ts)에서만 참조 — 적용 대상이 아닌 장비(퀘 보상 등)에 둬도 무해.
  // varianceTable 을 쓰면 5칸 중 [2,3,4](일반/고급/걸작 칸)이 드랍 등급 0/1/2 로 재사용된다.
  dropVariance?: CraftVariance;
  tier?: EquipTier;
};

// 등급별 텍스트 색상. 인벤토리·장비창·드랍 모달 등 아이템 이름이 노출되는 곳에서 공용으로 쓴다.
// ITEMS의 const-narrow 타입에서는 rarity 미지정 아이템의 필드 자체가 안 보여서,
// EquipItem 으로 받아 옵셔널 접근하는 게 타입상 안전하다.
// fallback 은 common(미지정) 일 때 쓸 색상 — 보통 기본 zinc 톤이지만 보상 모달처럼 다른 톤이 어울리는 곳에서 override.
export function rarityTextClass(
  item: EquipItem | null | undefined,
  fallback = "text-zinc-900 dark:text-zinc-100",
): string {
  switch (item?.rarity) {
    case "uncommon":
      return "text-emerald-600 dark:text-emerald-400";
    case "rare":
      return "text-sky-600 dark:text-sky-400";
    case "unique":
      return "text-violet-600 dark:text-violet-400";
    case "legendary":
      return "text-amber-600 dark:text-amber-400";
    default:
      return fallback;
  }
}

// "유실된 명품" — 일부 잡몹이 아주 드물게 떨구는 unique 등급 장비(ITEMS 끝 "유실된 명품" 블록 참고).
// 드랍/원정 결과에 「✨ 굉장한 발견!」 강조 배너를 띄우는 트리거 — 현재 unique == 이 부류라 rarity 만으로 판별한다.
export function isLuckyFind(item: EquipItem | null | undefined): boolean {
  return item?.rarity === "unique";
}
