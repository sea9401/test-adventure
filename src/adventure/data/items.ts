import type { CraftVariance } from "./craftQuality";

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

export const ITEMS = {
  // 시작 장비
  branch_stick: {
    name: "나무 막대",
    slot: "weapon",
    stats: [{ label: "공격력", value: "+0" }],
    bonus: { atk: 0 },
    description: "나뭇가지를 대충 다듬어 만든 평범한 막대.",
    tradable: false,
    // 시작 무기 분실/판매 시 재구매용 — 공격력 +0 이라 상징적 가격(5g).
    shopPrice: 5,
    tier: 1,
  } satisfies EquipItem,
  cloth_clothes: {
    name: "천 옷",
    slot: "armor",
    stats: [{ label: "방어력", value: "+0" }],
    bonus: { def: 0 },
    description: "평범한 천으로 만든 옷.",
    tradable: false,
    // 시작 방어구 분실/판매 시 재구매용 — 방어력 +0 이라 상징적 가격(5g). 도감 등록 길도 열어준다.
    shopPrice: 5,
    tier: 1,
  } satisfies EquipItem,
  mom_amulet: {
    name: "엄마가 준 부적",
    slot: "accessory",
    stats: [{ label: "행운", value: "+2" }],
    bonus: { luk: 2 },
    description: "어머니의 사랑이 깃든 작은 부적.",
    tradable: false,
    // 시작 액세서리 분실 시 재구매 + 도감 등록 길. 같은 +2 액세서리 활력의 반지(30g) 와
    // 일관 — 정상 진행 시엔 처음부터 갖고 있고, 분실 시에만 재구매 인센티브.
    shopPrice: 30,
    tier: 1,
  } satisfies EquipItem,

  // 초반 발판 — 상점에서 싸게 살 수 있는 입문 장비. 볼드 대장간 라인(야구방망이/낡은 가죽갑옷)을
  // 타기 전이라도 첫 골드로 살 게 생긴다. 곧 그쪽으로 덮이는 잠깐용.
  worn_dagger: {
    name: "무딘 단검",
    slot: "weapon",
    stats: [{ label: "공격력", value: "+1" }],
    bonus: { atk: 1 },
    description: "잡화점 구석에 굴러다니던 날 무딘 단검. 그래도 맨주먹보단 낫다.",
    tradable: false,
    shopPrice: 14,
    tier: 1,
  } satisfies EquipItem,
  quilted_vest: {
    name: "누빈 천 조끼",
    slot: "armor",
    stats: [{ label: "방어력", value: "+1" }],
    bonus: { def: 1 },
    description: "천을 두어 겹 누벼 만든 헐거운 조끼. 스치는 정도는 막아 준다.",
    tradable: false,
    shopPrice: 14,
    tier: 1,
  } satisfies EquipItem,

  // 제작·드랍 장비
  baseball_bat: {
    name: "야구 방망이",
    slot: "weapon",
    stats: [{ label: "공격력", value: "+3" }],
    bonus: { atk: 3 },
    description: "단단한 나무를 깎아 만든 묵직한 방망이.",
    rarity: "uncommon",
    tier: 1,
  } satisfies EquipItem,
  nailed_baseball_bat: {
    name: "못박힌 야구방망이",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+3" },
      { label: "활력", value: "+1" },
    ],
    bonus: { atk: 3, vit: 1 },
    description: "방망이 끝에 낡은 못을 잔뜩 박아 넣었다. 휘두를 때마다 묵직하다.",
    rarity: "uncommon",
    tier: 1,
  } satisfies EquipItem,
  old_leather_armor: {
    name: "낡은 가죽갑옷",
    slot: "armor",
    stats: [{ label: "방어력", value: "+2" }],
    bonus: { def: 2 },
    description: "오랜 세월 입던 흔적이 남아있지만 천 옷보단 든든하다.",
    // 볼드의 야구방망이 의뢰(bold_blacksmith_intro) 보상으로 받는 게 정상 진행.
    // 분실(판매/분해) 시 재구매할 길을 열어주되, 의뢰 완료 전엔 노출하지 않는다 —
    // 보상 스포일러 방지. 가격은 vitality_ring(+2) 30g 과 동일 룰.
    shopPrice: 30,
    shopGate: "boldQuestComplete",
    tier: 1,
  } satisfies EquipItem,
  vitality_ring: {
    name: "활력의 반지",
    slot: "accessory",
    stats: [{ label: "활력", value: "+2" }],
    bonus: { vit: 2 },
    description: "은은한 녹빛이 도는 반지. 끼고 있으면 몸이 가볍다.",
    // 스미스의 두더지 솎기 의뢰 보상이지만, 분실(판매/분해) 시 후속 '반지를 차고 와'
    // 의뢰가 영구 미완으로 묶이는 걸 막기 위해 상점에서 재구매 가능. 가격은 초반
    // 발판 +1 스탯 장비 14g 의 두 배 — '의뢰 보상으로 받을 수 있다는 가치' 보다
    // 살짝 비싼 30g 으로 두어 정상 진행 시엔 보상으로 받고, 분실 시에만 재구매 인센티브.
    shopPrice: 30,
    tier: 1,
  } satisfies EquipItem,
  squishy_armor: {
    name: "물컹물컹한 갑옷",
    slot: "armor",
    stats: [{ label: "방어력", value: "+3" }],
    bonus: { def: 3 },
    description: "슬라임 핵을 심으로 두른 갑옷. 충격을 부드럽게 흡수한다.",
    rarity: "uncommon",
    tier: 1,
  } satisfies EquipItem,
  bandit_dagger: {
    name: "산적의 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+4" },
      { label: "민첩", value: "+2" },
    ],
    bonus: { atk: 4, dex: 2 },
    description: "산적이 품에 숨기고 다니던 단검. 짧지만 손에 착 감긴다.",
    tier: 2,
  } satisfies EquipItem,
  // "유실된 명품" 1번. 같은 부류 5종은 ITEMS 끝 "유실된 명품" 블록에 모여 있다.
  mole_king_drill: {
    name: "두더지왕의 드릴",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+5" },
      { label: "속도", value: "+2" },
    ],
    bonus: { atk: 5, spd: 2 },
    description: "어느 두더지가 품에 꼭 쥐고 있던 작은 드릴. 회전시키면 묘하게 손맛이 좋다. 정말로 두더지왕이 있었는지는 아무도 모른다.",
    rarity: "unique",
    tier: 2,
  } satisfies EquipItem,
  spare_hatchet: {
    name: "예비 손도끼",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+2" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { atk: 2, dex: 1 },
    description: "나무꾼 지미가 챙겨 다니던 예비 손도끼. 손에 익으면 제법 매섭다.",
    tradable: false,
    tier: 1,
  } satisfies EquipItem,
  nymph_ring: {
    name: "님프의 반지",
    slot: "accessory",
    stats: [{ label: "속도", value: "+2" }],
    bonus: { spd: 2 },
    description: "은은하게 푸른빛이 도는 가는 반지. 호수 님프의 가호가 깃들어 있다.",
    tier: 2,
  } satisfies EquipItem,
  golem_hammer: {
    name: "골렘의 망치",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "속도", value: "-2" },
    ],
    bonus: { atk: 7, spd: -2 },
    description: "부서진 골렘의 팔에서 떼어낸 둔중한 돌망치. 휘두르려면 두 손이 필요하다.",
    tier: 2,
  } satisfies EquipItem,
  golem_armor: {
    name: "골렘갑주",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+8" },
      { label: "공격력", value: "-1" },
      { label: "속도", value: "-3" },
      { label: "행운", value: "-1" },
    ],
    bonus: { def: 8, atk: -1, spd: -3, luk: -1 },
    description: "골렘의 잔해를 덧대어 만든 두꺼운 갑주. 묵직한 만큼 휘두름과 발걸음, 운이 따라 무거워진다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  wraith_cloak: {
    name: "망령의 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+3" },
      { label: "민첩", value: "+1" },
      { label: "속도", value: "+2" },
    ],
    bonus: { def: 3, dex: 1, spd: 2 },
    description: "떠도는 망령이 두르고 있던 누더기 망토. 입으면 발걸음이 어딘가 가벼워진다.",
    tier: 2,
  } satisfies EquipItem,
  sticky_cloak: {
    name: "비단 로브",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+3" },
      { label: "행운", value: "+4" },
    ],
    bonus: { def: 3, luk: 4 },
    description: "거미줄을 비단처럼 곱게 짜낸 로브. 걸치고 있으면 묘하게 운이 따른다고 한다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  bat_hood: {
    name: "박쥐가죽 후드",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+2" },
      { label: "속도", value: "+3" },
    ],
    bonus: { def: 2, spd: 3 },
    description: "박쥐 가죽을 이어 만든 후드. 어둠 속에서도 발이 가볍다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  crystal_dagger: {
    name: "수정 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { atk: 6, dex: 1 },
    description: "단단한 수정을 깎아 만든 날카로운 단검.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  fairy_blessing: {
    name: "요정의 가호",
    slot: "accessory",
    stats: [
      { label: "활력", value: "+3" },
      { label: "행운", value: "+2" },
    ],
    bonus: { vit: 3, luk: 2 },
    description: "활력의 반지에 요정가루의 가호를 입힌 것. 끼고 있으면 몸도, 운도 따른다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,

  // 마정석 무기 4종 — 광맥의 수호자 처치 보상으로 풀리는 동굴 강화 라인.
  // 모두 weapon 슬롯, atk +6 공통(제작 `일반` 등급 기준 — 품질에 따라 ±2) + 보조 스탯이 다름.
  mana_sword: {
    name: "마정석 검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "힘", value: "+3" },
    ],
    bonus: { atk: 6, str: 3 },
    description: "마정석을 칼날에 박아 넣은 한손검. 휘두르면 묵직한 무게가 손에 실린다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  mana_shield: {
    name: "마정석 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "활력", value: "+3" },
    ],
    bonus: { atk: 6, vit: 3 },
    description: "마정석을 박은 묵직한 방패. 막아내며 받아치는 데에도 쓴다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  mana_spear: {
    name: "마정석 창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "민첩", value: "+3" },
    ],
    bonus: { atk: 8, dex: 3 },
    description: "끝에 마정석을 깎아 박은 긴 창. 가벼우면서도 묘하게 정확하다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  mana_knuckle: {
    name: "마정석 너클",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 8, luk: 5 },
    description: "마정석 조각을 손등에 박은 너클. 한 방 한 방이 묘하게 운에 맡겨지는 느낌이 든다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  mana_bracelet: {
    name: "마정석 팔찌",
    slot: "accessory",
    stats: [
      { label: "활력", value: "+3" },
      { label: "속도", value: "+2" },
    ],
    bonus: { vit: 3, spd: 2 },
    description: "마정석 조각을 엮어 만든 팔찌. 손목에 두르면 몸이 단단해지면서도 발이 가벼워진다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,

  // 운봉 무기 4종 + 액세서리 2 — 운봉의 거인 협동 처치 보상으로 풀리는 산정 강화 라인.
  // 마정석 라인의 한 단계 위. 무기 atk +8 공통(제작 `일반` 등급 기준 — 품질에 따라 ±2) + 보조 stat.
  peak_sword: {
    name: "운봉 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "힘", value: "+5" },
    ],
    bonus: { atk: 8, str: 5 },
    description: "운봉의 거인 뼛조각으로 단련한 한손 대검. 무게가 손에 그대로 실린다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  peak_shield: {
    name: "운봉 방벽",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "활력", value: "+6" },
    ],
    bonus: { atk: 8, vit: 6 },
    description: "거인의 비늘을 그대로 두른 방패형 무기. 막으며 쳐낸다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  peak_spear: {
    name: "운봉 장창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+10" },
      { label: "민첩", value: "+6" },
    ],
    bonus: { atk: 10, dex: 6 },
    description: "운봉석 끝을 깎아 박은 긴 창. 멀리서도 정확하다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  peak_claw: {
    name: "운봉 발톱",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+10" },
      { label: "행운", value: "+6" },
    ],
    bonus: { atk: 10, luk: 6 },
    description: "거인의 손가락뼈를 갈아 만든 발톱형 너클. 한 방 한 방이 운에 맡겨진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  peak_mantle: {
    name: "운봉 견갑",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+4" },
      { label: "속도", value: "+4" },
    ],
    bonus: { dex: 4, spd: 4 },
    description: "운봉의 거인 어깨 비늘을 가볍게 깎아 만든 견갑. 두르면 손이 빨라지고 발이 가벼워진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  // 운봉의 심장 — 협동 보스 처치 보상. str 중심 공격형 액세서리.
  peak_heart: {
    name: "운봉의 심장",
    slot: "accessory",
    stats: [
      { label: "힘", value: "+4" },
      { label: "활력", value: "+3" },
    ],
    bonus: { str: 4, vit: 3 },
    description: "운봉의 거인의 가슴에서 떼어낸 작은 심장. 손에 쥐면 어깨가 묵직해진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  // 운봉령 — 협동 보스 legend 티어에서 아주 낮은 확률로만 떨어지는 unique 액세서리 (물욕템).
  // 모든 스탯이 한 결로 펴진 균형형 — 거래 불가, 자랑용.
  peak_relic: {
    name: "운봉령",
    slot: "accessory",
    stats: [
      { label: "힘", value: "+3" },
      { label: "민첩", value: "+3" },
      { label: "활력", value: "+3" },
      { label: "속도", value: "+3" },
      { label: "행운", value: "+3" },
    ],
    bonus: { str: 3, dex: 3, vit: 3, spd: 3, luk: 3 },
    description: "운봉의 거인 척추 한 마디에서 떼어낸 운봉석 결정. 다섯 결이 한 결로 펴져 손에 쥔 자의 모든 발이 같이 가벼워진다.",
    rarity: "unique",
    tradable: false,
    tier: 3,
  } satisfies EquipItem,

  // 다리 구간 장비 — 운저 평원 / 잿빛 협로. 운봉 라인과 화염 라인 사이의 빈 구간을 메운다.
  bison_hide_armor: {
    name: "들소 가죽 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+9" },
      { label: "체력", value: "+2" },
      { label: "힘", value: "+2" },
      { label: "속도", value: "-1" },
    ],
    bonus: { def: 9, vit: 2, str: 2, spd: -1 },
    description: "들소 가죽을 여러 겹 다져 만든 묵직한 갑옷. 두르면 어깨가 든든해지는 만큼 발이 조금 무겁다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  ashforged_blade: {
    name: "재무쇠 검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "힘", value: "+4" },
    ],
    bonus: { atk: 8, str: 4 },
    description: "잿돌을 녹여 단단한 수정과 함께 벼려 낸 검. 베어 낼 때마다 잿가루가 흩날린다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,

  // 봉황 망토 — 불꽃 독수리 희귀 드랍. 봉황령 파밍 동기.
  flame_eagle_cape: {
    name: "봉황 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+6" },
      { label: "민첩", value: "+2" },
      { label: "속도", value: "+5" },
    ],
    bonus: { def: 6, dex: 2, spd: 5 },
    description: "불꽃 독수리의 날개깃을 이어 만든 망토. 두르면 발이 불꽃처럼 가벼워진다.",
    tier: 4,
  } satisfies EquipItem,

  // 봉황 무구 6종 — 화산의 심장 보스 보상으로 풀리는 최상위 강화 라인.
  // 봉황령에서 모은 봉황 깃털 + 보스가 떨군 용암 핵·화염 비늘로 벼린 고대 유물급 무구.
  // 무기 atk +10 공통(제작 `일반` 등급 기준 — 품질에 따라 ±2) + 보조 스탯이 다름.
  volcano_sword: {
    name: "봉황도",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+10" },
      { label: "힘", value: "+6" },
    ],
    bonus: { atk: 10, str: 6 },
    description: "봉황 깃털을 자루에 감고 용암 핵을 칼날에 녹여 벼린 한손 대검. 휘두를 때마다 붉은 열기가 일렁인다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,
  volcano_shield: {
    name: "봉황패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+10" },
      { label: "활력", value: "+7" },
    ],
    bonus: { atk: 10, vit: 7 },
    description: "화염 비늘을 겹겹이 두른 방패형 무구. 막아내는 순간 봉황의 열기가 역류한다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,
  volcano_spear: {
    name: "봉황극",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+13" },
      { label: "민첩", value: "+7" },
    ],
    bonus: { atk: 13, dex: 7 },
    description: "봉황 깃털로 균형을 잡고 끝에 용암 핵을 박은 긴 창. 가볍고 정확하며, 창끝에서 불길이 떨린다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,
  volcano_claw: {
    name: "봉황조",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+13" },
      { label: "행운", value: "+7" },
    ],
    bonus: { atk: 13, luk: 7 },
    description: "화산의 심장 파편을 발톱 형태로 깎아 손등에 채운 너클. 한 방 한 방이 불처럼 타오른다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,
  volcano_armor: {
    name: "봉황갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+11" },
      { label: "힘", value: "+4" },
      { label: "활력", value: "+5" },
    ],
    bonus: { def: 11, str: 4, vit: 5 },
    description: "화염 비늘과 용암 핵을 단련해 만든 갑주. 봉황의 불길을 두른 듯 몸 전체가 달아오른다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,
  volcano_core: {
    name: "봉황주",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+5" },
      { label: "속도", value: "+5" },
    ],
    bonus: { dex: 5, spd: 5 },
    description: "화산의 심장에서 뽑아낸 가장 순수한 결정을 봉황 깃털로 감싼 구슬. 지니면 몸이 불꽃처럼 날렵해진다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,

  // ── 별의 첨탑 무구 5종 — 별을 지키는 자 협동 처치 보상으로 풀리는 엔드 라인. ──
  // 봉황·화산 라인의 한 단계 위. 용비늘 보스 무구(Lv75)와 같은 두께의 stat 곡선 — 천공 라인 시작점.
  // 무기 atk +16(검/방패) / +18(창/너클) 공통(제작 `일반` 기준) + 보조 stat.
  star_blade: {
    name: "별검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+16" },
      { label: "힘", value: "+7" },
    ],
    bonus: { atk: 16, str: 7 },
    description: "천공 합금을 별먼지에 담갔다가 단조한 한손 대검. 칼날에 별빛이 옅게 머문다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  star_aegis: {
    name: "별의 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+16" },
      { label: "활력", value: "+8" },
    ],
    bonus: { atk: 16, vit: 8 },
    description: "천공 합금을 겹쳐 별먼지로 무늬를 새긴 방패형 무기. 막아낼 때마다 별빛이 일렁인다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  star_lance: {
    name: "별창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+18" },
      { label: "민첩", value: "+9" },
    ],
    bonus: { atk: 18, dex: 9 },
    description: "별먼지로 균형을 잡고 천공 합금 창끝을 깎아 박은 긴 창. 끝에서 별빛이 가늘게 떨린다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  star_grip: {
    name: "별의 너클",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+18" },
      { label: "행운", value: "+9" },
    ],
    bonus: { atk: 18, luk: 9 },
    description: "천공 합금을 깎아 손등에 채운 너클. 한 방 한 방이 별빛을 따라 떨어진다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  star_mantle: {
    name: "별의 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+7" },
      { label: "속도", value: "+7" },
      { label: "활력", value: "+1" },
    ],
    bonus: { dex: 7, spd: 7, vit: 1 },
    description: "별먼지를 짜낸 가느다란 실로 짠 가벼운 망토. 두르면 발걸음에 별빛이 따라 붙는다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  // 별빛 두루마기 — 별을 지키는 자 협동 legend 티어 확정 드랍 (물욕템).
  // armor 슬롯을 채우는 전스탯 균형형 — 자랑용.
  star_robe: {
    name: "별빛 두루마기",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+17" },
      { label: "힘", value: "+5" },
      { label: "민첩", value: "+5" },
      { label: "활력", value: "+7" },
      { label: "속도", value: "+5" },
    ],
    bonus: { def: 17, str: 5, dex: 5, vit: 7, spd: 5 },
    description: "별을 지키는 자가 두르고 있던 망토가 그 잠을 깨운 자의 손에 닿자 별빛으로 결정화된 두루마기. 어느 스탯에도 치우치지 않은 옛 천공인의 유물.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,

  // ── 별빛 회랑 무구 5종 (Lv75) — star 와 aether 사이 중간 tier. ──
  // 무기 atk +17(검/방패) / +19(창/너클). 별 무구 한 자루를 잡아 회랑의 별빛 + 합금으로 보강.
  // 용비늘 묘지 보스(뼈왕의 대검 atk17+str9, 영광방패 atk13+vit12+def5) 와 같은 stat 두께.
  corridor_blade: {
    name: "회랑검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+17" },
      { label: "힘", value: "+9" },
    ],
    bonus: { atk: 17, str: 9 },
    description: "별빛 회랑에 떨어진 떠도는 시녀의 잔재를 별검 위에 한 결 더 입힌 칼. 별빛의 결이 손잡이까지 따라 흐른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  corridor_aegis: {
    name: "회랑 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+17" },
      { label: "활력", value: "+10" },
    ],
    bonus: { atk: 17, vit: 10 },
    description: "별의 방패에 회랑의 별빛 합금을 한 겹 더 두른 방패형 무기. 회랑의 결이 충격을 가른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  corridor_lance: {
    name: "회랑창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+19" },
      { label: "민첩", value: "+10" },
    ],
    bonus: { atk: 19, dex: 10 },
    description: "별창 끝에 회랑의 별빛을 압축해 박은 긴 창. 끝에서 회랑의 결이 가늘게 떨린다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  corridor_grip: {
    name: "회랑 너클",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+19" },
      { label: "행운", value: "+10" },
    ],
    bonus: { atk: 19, luk: 10 },
    description: "별의 너클을 한 번 풀어 회랑의 별빛 결로 다시 새긴 너클. 한 방 한 방이 회랑을 닮은 결을 낸다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  corridor_mantle: {
    name: "회랑 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+8" },
      { label: "속도", value: "+8" },
      { label: "활력", value: "+4" },
    ],
    bonus: { dex: 8, spd: 8, vit: 4 },
    description: "별의 망토에 회랑의 별빛 실을 한 결 더 짜낸 가벼운 망토. 두르면 발걸음에 회랑의 결이 따라 붙는다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,

  // ── 선인의 폐도 무구 5종 — 천공인의 왕 협동 처치 보상 (별 라인의 한 단계 위). ──
  // 무기 atk +19(검/방패) / +21(창/너클) 공통(제작 `일반` 기준) + 보조 스탯.
  aether_blade: {
    name: "에테르검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+19" },
      { label: "힘", value: "+10" },
    ],
    bonus: { atk: 19, str: 10 },
    description: "에테르 합금을 별의 정수에 담갔다 단조한 한손 대검. 칼날을 휘두를 때마다 옛 별빛이 결을 따라 흐른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  aether_aegis: {
    name: "에테르 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+19" },
      { label: "활력", value: "+12" },
    ],
    bonus: { atk: 19, vit: 12 },
    description: "에테르 합금을 겹쳐 별의 정수로 결을 잡은 방패형 무기. 막아낼 때마다 별빛의 결이 적의 충격을 흩는다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  aether_lance: {
    name: "에테르창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+21" },
      { label: "민첩", value: "+12" },
    ],
    bonus: { atk: 21, dex: 12 },
    description: "별의 정수로 균형을 잡고 에테르 합금 창끝을 깎아 박은 긴 창. 끝에서 별빛이 옛 천공인의 마지막 노래처럼 떨린다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  aether_grip: {
    name: "에테르 너클",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+21" },
      { label: "행운", value: "+12" },
    ],
    bonus: { atk: 21, luk: 12 },
    description: "에테르 합금을 깎아 손등에 채운 너클. 한 방 한 방이 옛 천공인이 별을 떨궜다는 어느 순간을 닮았다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  aether_mantle: {
    name: "에테르 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+9" },
      { label: "속도", value: "+9" },
      { label: "활력", value: "+4" },
    ],
    bonus: { dex: 9, spd: 9, vit: 4 },
    description: "별의 정수를 짜낸 실로 짠 망토. 두르면 발걸음이 가벼워지고 어깨가 든든해진다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  // 천공인의 관 — 천공인의 왕 협동 legend 티어 1% 드랍 (물욕템).
  // accessory 슬롯, 운봉령/별빛 두루마기 위의 분포.
  skyfolk_crown: {
    name: "천공인의 관",
    slot: "accessory",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "방어력", value: "+7" },
      { label: "힘", value: "+4" },
      { label: "민첩", value: "+4" },
      { label: "활력", value: "+4" },
      { label: "속도", value: "+4" },
      { label: "행운", value: "+4" },
    ],
    bonus: { atk: 7, def: 7, str: 4, dex: 4, vit: 4, spd: 4, luk: 4 },
    description: "옛 천공인의 마지막 왕이 별빛에 두고 떠난 관. 닿은 자는 어느 결로도 꺾이지 않는다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,

  // ── 옥좌의 길 무구 5종 (Lv85) — aether 와 empyrean 사이 중간 tier. ──
  // 무기 atk +22(검/방패) / +24(창/너클). 에테르 무구를 잡아 황성 합금 + 별의 결로 다시 단조.
  road_blade: {
    name: "황성검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+22" },
      { label: "힘", value: "+11" },
    ],
    bonus: { atk: 22, str: 11 },
    description: "옥좌의 길에서 무너진 황성 호위병의 칼을 에테르검 위에 한 겹 더 입힌 한손 대검. 휘두를 때마다 황성의 결이 칼날을 따라 흐른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  road_aegis: {
    name: "황성 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+22" },
      { label: "활력", value: "+13" },
    ],
    bonus: { atk: 22, vit: 13 },
    description: "에테르 방패에 황성 호위병이 두르고 있던 보호의 결을 한 겹 더 두른 방패형 무기. 막아낼 때마다 황성의 결이 충격을 흩는다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  road_lance: {
    name: "황성창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+24" },
      { label: "민첩", value: "+13" },
    ],
    bonus: { atk: 24, dex: 13 },
    description: "에테르창 끝에 황성의 결을 압축해 박은 긴 창. 끝에서 옥좌가 빛을 떨군다는 그 결이 가늘게 떨린다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  road_grip: {
    name: "황성 너클",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+24" },
      { label: "행운", value: "+13" },
    ],
    bonus: { atk: 24, luk: 13 },
    description: "에테르 너클에 황성 호위병의 한 결을 더 새긴 너클. 한 방 한 방이 옥좌로 가는 길을 닮은 결을 낸다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  road_mantle: {
    name: "황성 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+10" },
      { label: "속도", value: "+10" },
      { label: "활력", value: "+5" },
    ],
    bonus: { dex: 10, spd: 10, vit: 5 },
    description: "에테르 망토에 황성의 결을 한 줄 더 짜낸 가벼운 망토. 두르면 어깨에 옥좌로 가는 길의 결이 얹힌다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,

  // ── 창공의 옥좌 무구 5종 — 창공의 주재 협동 처치 보상 (에테르 라인의 한 단계 위, 만렙 정점). ──
  // 무기 atk +25(검/방패) / +27(창/너클) 공통(제작 `일반` 기준) + 보조 스탯.
  empyrean_blade: {
    name: "창공검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+25" },
      { label: "힘", value: "+12" },
    ],
    bonus: { atk: 25, str: 12 },
    description: "창공 조각을 태초의 정수에 담갔다 단조한 한손 대검. 휘두를 때마다 별 그 자체의 결이 칼날을 따라 흐른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  empyrean_aegis: {
    name: "창공 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+25" },
      { label: "활력", value: "+14" },
    ],
    bonus: { atk: 25, vit: 14 },
    description: "창공 조각을 겹쳐 태초의 정수로 결을 잡은 방패형 무기. 막아낼 때마다 별이 일렁이며 충격을 흩는다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  empyrean_lance: {
    name: "창공창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+27" },
      { label: "민첩", value: "+14" },
    ],
    bonus: { atk: 27, dex: 14 },
    description: "태초의 정수로 균형을 잡고 창공 조각 끝을 깎아 박은 긴 창. 끝에서 별이 떨어지는 듯한 결이 인다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  empyrean_grip: {
    name: "창공 너클",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+27" },
      { label: "행운", value: "+14" },
    ],
    bonus: { atk: 27, luk: 14 },
    description: "창공 조각을 깎아 손등에 채운 너클. 한 방 한 방이 옥좌가 별을 떨어뜨렸다는 그 순간을 닮았다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  empyrean_mantle: {
    name: "창공 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+11" },
      { label: "속도", value: "+11" },
      { label: "활력", value: "+6" },
    ],
    bonus: { dex: 11, spd: 11, vit: 6 },
    description: "태초의 정수를 짜낸 실로 짠 가장 가벼우면서 가장 단단한 망토. 두르면 어깨에 별 한 자루의 결이 얹힌다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  // ── 5막 별빛 무구 — 4 별빛 사냥터 (Ch 26 이후) 진입 컨텐츠.
  // 무기 25종 = 5무기(대검/창/방패/쌍검/단검) × 5부스탯 변형. atk +28 / 메인 +14 / 부스탯 +5.
  // 메인스탯 매핑: 대검=str, 창=dex, 방패=vit, 쌍검=spd, 단검=luk.
  // 부스탯이 메인과 일치하는 변형(예: 힘의 별빛 대검) 은 같은 스탯에 자연 합산 → 메인 +19.
  // 방어구 5종 = 메인스탯 5종 각 1자루. def +24 / 메인 +14. 부스탯 없음.
  // 입수: 4 사냥터 일반 몹 제작서 드랍 → 별빛 조각으로 제작 / 사냥터 일반 몹 완제품 드랍.
  // craftTier 적용 + 강화 +7 + 마법부여 3슬 (강화 단계별 해금).

  // 대검 (메인 = 힘)
  starlit_greatsword_str: {
    name: "힘의 별빛 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+19" },
    ],
    bonus: { atk: 28, str: 19 },
    description: "별빛 한 결을 한 자루로 두껍게 두른 한손 대검. 들면 어깨에 별바다의 무게가 가지런히 얹힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_greatsword_dex: {
    name: "민첩의 별빛 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+14" },
      { label: "민첩", value: "+5" },
    ],
    bonus: { atk: 28, str: 14, dex: 5 },
    description: "별빛 한 결을 가늘게 흘려 단조한 한손 대검. 결을 따라 손끝까지 가지런히 흐른다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_greatsword_vit: {
    name: "활력의 별빛 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+14" },
      { label: "활력", value: "+5" },
    ],
    bonus: { atk: 28, str: 14, vit: 5 },
    description: "별빛 한 결이 가장 안쪽에 두텁게 가라앉아 있는 한손 대검. 한 호흡이 어긋나도 결이 자세를 잡아 준다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_greatsword_spd: {
    name: "속도의 별빛 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+14" },
      { label: "속도", value: "+5" },
    ],
    bonus: { atk: 28, str: 14, spd: 5 },
    description: "별빛 한 결을 결대로 얇게 펴 단조한 한손 대검. 그림자가 가볍게 떨어진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_greatsword_luk: {
    name: "행운의 별빛 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+14" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 28, str: 14, luk: 5 },
    description: "별빛 한 점이 한 칼에 옅게 떨려 있는 한손 대검. 자루 끝에서 가끔 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // 창 (메인 = 민첩)
  starlit_lance_str: {
    name: "힘의 별빛 창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "민첩", value: "+14" },
      { label: "힘", value: "+5" },
    ],
    bonus: { atk: 28, dex: 14, str: 5 },
    description: "별빛 한 결을 묵직하게 박아 단조한 긴 창. 한 번 박으면 결이 손까지 같이 박힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_lance_dex: {
    name: "민첩의 별빛 창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "민첩", value: "+19" },
    ],
    bonus: { atk: 28, dex: 19 },
    description: "별빛 한 결을 가장 가지런히 흘려 단조한 긴 창. 결이 손끝까지 한 번에 미끄러진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_lance_vit: {
    name: "활력의 별빛 창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "민첩", value: "+14" },
      { label: "활력", value: "+5" },
    ],
    bonus: { atk: 28, dex: 14, vit: 5 },
    description: "별빛 한 결이 자루 안쪽에 가장 두텁게 가라앉아 있는 긴 창. 호흡이 끊겨도 자루가 자세를 잡아 준다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_lance_spd: {
    name: "속도의 별빛 창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "민첩", value: "+14" },
      { label: "속도", value: "+5" },
    ],
    bonus: { atk: 28, dex: 14, spd: 5 },
    description: "별빛 한 결을 가장 얇게 펴 단조한 긴 창. 휘두를 때마다 그림자가 한 박자 늦게 따라온다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_lance_luk: {
    name: "행운의 별빛 창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "민첩", value: "+14" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 28, dex: 14, luk: 5 },
    description: "별빛 한 점이 창끝에 옅게 떨려 있는 긴 창. 결정적인 한 자세에 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // 방패 (메인 = 활력)
  starlit_shield_str: {
    name: "힘의 별빛 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "활력", value: "+14" },
      { label: "힘", value: "+5" },
    ],
    bonus: { atk: 28, vit: 14, str: 5 },
    description: "별빛 한 결을 가장 두텁게 박아 단조한 방패형 무기. 받아 내는 한 번에 별바다의 무게가 같이 얹힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_shield_dex: {
    name: "민첩의 별빛 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "활력", value: "+14" },
      { label: "민첩", value: "+5" },
    ],
    bonus: { atk: 28, vit: 14, dex: 5 },
    description: "별빛 한 결을 가장 가지런히 흘려 단조한 방패형 무기. 결이 손끝까지 한 번에 미끄러진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_shield_vit: {
    name: "활력의 별빛 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "활력", value: "+19" },
    ],
    bonus: { atk: 28, vit: 19 },
    description: "별빛 한 결이 안쪽까지 가장 깊이 가라앉아 있는 방패형 무기. 어떤 결도 안으로 닿지 못한다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_shield_spd: {
    name: "속도의 별빛 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "활력", value: "+14" },
      { label: "속도", value: "+5" },
    ],
    bonus: { atk: 28, vit: 14, spd: 5 },
    description: "별빛 한 결을 얇게 펴 단조한 방패형 무기. 받아 낼 때마다 그림자가 한 박자 늦게 따라온다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_shield_luk: {
    name: "행운의 별빛 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "활력", value: "+14" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 28, vit: 14, luk: 5 },
    description: "별빛 한 점이 방패 한가운데에 옅게 떨려 있는 방패형 무기. 막아 낸 한 번에 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // 쌍검 (메인 = 속도)
  starlit_twinblades_str: {
    name: "힘의 별빛 쌍검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "속도", value: "+14" },
      { label: "힘", value: "+5" },
    ],
    bonus: { atk: 28, spd: 14, str: 5 },
    description: "별빛 한 결을 두껍게 두른 한 손에 한 자루씩의 쌍검. 한 번에 두 결이 같이 박힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_twinblades_dex: {
    name: "민첩의 별빛 쌍검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "속도", value: "+14" },
      { label: "민첩", value: "+5" },
    ],
    bonus: { atk: 28, spd: 14, dex: 5 },
    description: "별빛 한 결을 가지런히 흘려 단조한 쌍검. 두 결이 한 손끝까지 같이 미끄러진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_twinblades_vit: {
    name: "활력의 별빛 쌍검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "속도", value: "+14" },
      { label: "활력", value: "+5" },
    ],
    bonus: { atk: 28, spd: 14, vit: 5 },
    description: "별빛 한 결이 두 자루 안쪽에 두텁게 가라앉아 있는 쌍검. 두 호흡이 끊겨도 결이 자세를 잡아 준다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_twinblades_spd: {
    name: "속도의 별빛 쌍검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "속도", value: "+19" },
    ],
    bonus: { atk: 28, spd: 19 },
    description: "별빛 한 결을 가장 얇게 펴 단조한 쌍검. 두 그림자가 한 박자 늦게 같이 따라온다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_twinblades_luk: {
    name: "행운의 별빛 쌍검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "속도", value: "+14" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 28, spd: 14, luk: 5 },
    description: "별빛 한 점이 두 자루 끝에 옅게 떨려 있는 쌍검. 결정적인 두 결에 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // 단검 (메인 = 행운)
  starlit_dagger_str: {
    name: "힘의 별빛 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "행운", value: "+14" },
      { label: "힘", value: "+5" },
    ],
    bonus: { atk: 28, luk: 14, str: 5 },
    description: "별빛 한 결을 두껍게 두른 짧고 가는 단검. 한 번 박으면 별바다의 무게가 같이 박힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_dagger_dex: {
    name: "민첩의 별빛 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "행운", value: "+14" },
      { label: "민첩", value: "+5" },
    ],
    bonus: { atk: 28, luk: 14, dex: 5 },
    description: "별빛 한 결을 가지런히 흘려 단조한 짧고 가는 단검. 결이 손끝까지 한 번에 미끄러진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_dagger_vit: {
    name: "활력의 별빛 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "행운", value: "+14" },
      { label: "활력", value: "+5" },
    ],
    bonus: { atk: 28, luk: 14, vit: 5 },
    description: "별빛 한 결이 자루 안쪽에 두텁게 가라앉아 있는 짧고 가는 단검. 호흡이 끊겨도 자루가 자세를 잡아 준다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_dagger_spd: {
    name: "속도의 별빛 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "행운", value: "+14" },
      { label: "속도", value: "+5" },
    ],
    bonus: { atk: 28, luk: 14, spd: 5 },
    description: "별빛 한 결을 가장 얇게 펴 단조한 짧고 가는 단검. 그림자가 칼끝보다 한 박자 늦게 따라온다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_dagger_luk: {
    name: "행운의 별빛 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "행운", value: "+19" },
    ],
    bonus: { atk: 28, luk: 19 },
    description: "별빛 한 점이 칼끝에 가장 가지런히 떨려 있는 짧고 가는 단검. 결정적인 한 박자에 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // 별빛 갑옷 5종 (메인스탯만, 부스탯 없음)
  starlit_armor_str: {
    name: "힘의 별빛 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "힘", value: "+14" },
    ],
    bonus: { def: 24, str: 14 },
    description: "별빛 한 결을 가장 두껍게 두른 갑주. 한 발 디딜 때마다 별바다의 무게가 가지런히 얹힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_armor_dex: {
    name: "민첩의 별빛 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "민첩", value: "+14" },
    ],
    bonus: { def: 24, dex: 14 },
    description: "별빛 한 결을 가지런히 흘려 단조한 가벼운 갑주. 몸의 결이 한 번에 미끄러진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_armor_vit: {
    name: "활력의 별빛 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "활력", value: "+14" },
    ],
    bonus: { def: 24, vit: 14 },
    description: "별빛 한 결이 안쪽까지 가장 깊이 가라앉아 있는 두꺼운 갑주. 어떤 결도 안으로 닿지 못한다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_armor_spd: {
    name: "속도의 별빛 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "속도", value: "+14" },
    ],
    bonus: { def: 24, spd: 14 },
    description: "별빛 한 결을 가장 얇게 펴 단조한 갑주. 그림자가 한 박자 늦게 따라온다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_armor_luk: {
    name: "행운의 별빛 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "행운", value: "+14" },
    ],
    bonus: { def: 24, luk: 14 },
    description: "별빛 한 점이 가슴 위에 옅게 떨려 있는 갑주. 결정적인 한 발에 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // ── 5막 잔영 협동 legend 1% unique 액세서리 3종 (별빛 변종 협동 보스 보상) ──
  // 별빛 거인 잔영 / 수심의 메아리 / 성문지기 잔영 각각 legend 도달자 한정 0.01 굴림.
  // peak_relic / star_robe / apex_regalia 와 같은 결의 물욕 unique 라인. 한 자루씩.
  giant_yoke: {
    name: "거인의 멍에",
    slot: "accessory",
    stats: [
      { label: "활력", value: "+18" },
      { label: "힘", value: "+12" },
    ],
    bonus: { vit: 18, str: 12 },
    description: "거인의 어깨에 얹혔던 멍에. 별빛 잔영이 그 무게를 자기 결로 옮겨 온 자리. 두르면 어깨가 가라앉지 않는다. 마지막에 자기 발로 선 자만 허락된 결.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  deep_orb: {
    name: "수심의 메아리 보주",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+15" },
      { label: "속도", value: "+15" },
    ],
    bonus: { dex: 15, spd: 15 },
    description: "수심의 것이 가장 깊은 곳에서 한 점씩 모아 두었던 결. 손에 쥐면 발 끝의 결이 흐르듯 가벼워진다. 마지막 한 음절을 끊은 자에게만 허락된 결.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  gate_bar: {
    name: "성문의 빗장",
    slot: "accessory",
    stats: [
      { label: "공격력", value: "+15" },
      { label: "행운", value: "+18" },
    ],
    bonus: { atk: 15, luk: 18 },
    description: "성문지기 자동인형이 마지막으로 들었다가 떨군 빗장. 한 손에 쥐면 한 번에 두 박자를 끊을 수 있다. 빗장을 마지막으로 내린 자에게만 허락된 결.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,

  // 창공의 옥새 — 창공의 주재 협동 legend 티어 1% 드랍 (만렙 정점 물욕템).
  // accessory 슬롯, 천공인의 관 위의 전스탯 + 양면 분포.
  apex_regalia: {
    name: "창공의 옥새",
    slot: "accessory",
    stats: [
      { label: "공격력", value: "+10" },
      { label: "방어력", value: "+10" },
      { label: "힘", value: "+5" },
      { label: "민첩", value: "+5" },
      { label: "활력", value: "+5" },
      { label: "속도", value: "+5" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 10, def: 10, str: 5, dex: 5, vit: 5, spd: 5, luk: 5 },
    description: "창공의 주재가 옥좌에 두고 떠난 옥새. 한 손에 별 한 자루의 무게가 그대로 실린다. 마지막에 닿은 자에게만 허락된 결.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,

  // ── 태고의 노룡 (월드 보스) 보상 — 용의 둥지에서 모든 모험가가 깎아 잡는 어미의 결. ──
  // gold/epic 티어 도달자에게 equipRolls 로 직접 떨어지는 무구 4종 (no debuff, BiS급).
  // legend 티어 도달자에게는 그 위 액세서리 한 자루(태고의 비늘관) — 운빨.
  primordial_blade: {
    name: "태고의 결검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+14" },
      { label: "속도", value: "+5" },
    ],
    bonus: { atk: 28, str: 14, spd: 5 },
    description: "태고의 노룡의 가장 안쪽 비늘을 깎아 결을 잡은 한손 대검. 들면 어깨에 옛 시대의 무게가 그대로 얹히면서, 그 결이 칼날 끝까지 흐른다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  primordial_aegis: {
    name: "태고의 결갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "활력", value: "+14" },
      { label: "힘", value: "+6" },
    ],
    bonus: { def: 24, vit: 14, str: 6 },
    description: "태고의 노룡의 가슴 비늘을 그대로 뜯어 두른 두꺼운 갑주. 어떤 결도 안으로 닿지 못한다. 어미의 무게가 가슴에 그대로 얹혀 있다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  primordial_helm: {
    name: "태고의 결관",
    slot: "accessory",
    stats: [
      { label: "방어력", value: "+11" },
      { label: "활력", value: "+9" },
      { label: "힘", value: "+6" },
    ],
    bonus: { def: 11, vit: 9, str: 6 },
    description: "태고의 노룡의 머리뼈 결을 그대로 깎아 두른 투구. 한 번 쓰면 어미가 잠시 자네의 어깨에 한 결을 얹는다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  primordial_cloak: {
    name: "태고의 잿빛 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+10" },
      { label: "속도", value: "+10" },
      { label: "활력", value: "+8" },
      { label: "방어력", value: "+5" },
    ],
    bonus: { dex: 10, spd: 10, vit: 8, def: 5 },
    description: "태고의 노룡의 등에서 흘러내린 잿빛 비늘을 가는 가닥으로 풀어 짠 망토. 두르면 어깨가 가벼워지고, 동시에 어디로도 흔들리지 않는다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  // 태고의 비늘관 — legend 티어 5% 드랍 (월드 보스 정점 물욕템).
  // accessory 슬롯, 창공의 옥새 위의 전스탯 — 운빨로 한 자루.
  primordial_regalia: {
    name: "태고의 비늘관",
    slot: "accessory",
    stats: [
      { label: "공격력", value: "+12" },
      { label: "방어력", value: "+12" },
      { label: "힘", value: "+6" },
      { label: "민첩", value: "+6" },
      { label: "활력", value: "+6" },
      { label: "속도", value: "+6" },
      { label: "행운", value: "+6" },
    ],
    bonus: { atk: 12, def: 12, str: 6, dex: 6, vit: 6, spd: 6, luk: 6 },
    description: "태고의 노룡이 마지막에 떨군 가장 안쪽 비늘 한 장을 그대로 둘러 만든 관. 한 자루로는 닿을 수 없는 결. 모든 모험가의 누적 데미지로 어미를 쓰러뜨려야만 자네의 손에 들린다.",
    rarity: "legendary",
    tier: 5,
  } satisfies EquipItem,

  // 6막 「별을 잊은 것」 — 잊힌 봉인 legend 랜덤 롤 장신구. base 는 옵션 없음(bonus 생략):
  // 실제 옵션(힘·활력·민첩·속도·행운 중 2개 × 1~20)은 드랍 시 인스턴스마다 롤되어 박힌다
  // (starlitRing.ts / EquipmentInstance.rolledBonus). 거래 불가 — 롤 자체가 파밍 동력이라
  // 좋은 롤을 사고팔지 못하게(마켓도 인스턴스 롤을 구분 못 함).
  starlit_ring: {
    name: "별빛 고리",
    slot: "accessory",
    stats: [{ label: "랜덤 옵션", value: "2종 · 각 +1~20" }],
    // base 는 옵션 없음 — 실제 bonus 는 인스턴스 rolledBonus 가 채운다(resolveStarlitRing).
    // 빈 객체라도 둬야 ITEMS 유니온 전 항목이 bonus 키를 가져 타입이 일관된다.
    bonus: {},
    description:
      "잊힌 봉인이 흘린 결을 고리로 엮은 것. 손가락에 둘러질 때마다 다른 결이 깃들어, 같은 고리는 둘도 없다.",
    rarity: "legendary",
    tier: 6,
    tradable: false,
  } satisfies EquipItem,

  // ── 히든 퀘스트 보상 (§11) — 정식 곡선 위 한 칸, 의뢰로만 입수 ─────────────
  // 월광검: 볼드 ↔ 만월 옛 합작 무기를 마저 완성한 것(hidden-blacksmith-duel). 운봉 무기 한 칸 위.
  moonlight_blade: {
    name: "월광검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+9" },
      { label: "힘", value: "+4" },
      { label: "속도", value: "+3" },
    ],
    bonus: { atk: 9, str: 4, spd: 3 },
    description:
      "두 대장장이가 절반씩 벼려 마침내 한 자루로 합친 검. 달빛 같은 푸른 결이 칼날을 따라 흐른다.",
    rarity: "rare",
    tradable: false,
    tier: 4,
  } satisfies EquipItem,
  // 용암 정수: 화산의 심장이 잠든 자리에 고인 정수를 시온이 다듬은 것(hidden-volcano-relic). 봉황 액세서리 한 칸 위.
  lava_essence: {
    name: "용암 정수",
    slot: "accessory",
    stats: [
      { label: "힘", value: "+6" },
      { label: "활력", value: "+5" },
    ],
    bonus: { str: 6, vit: 5 },
    description:
      "화산의 심장이 잠든 자리에서 흘러나와 굳은 정수. 손에 쥐면 가슴께가 묵직하게 달아오른다.",
    rarity: "rare",
    tradable: false,
    tier: 4,
  } satisfies EquipItem,

  // ── 유실된 명품 ───────────────────────────────────────────────────────────
  // 일부 잡몹이 아주 드물게(≈0.01~0.02%) 떨구는 unique 등급 장비. 그 구간에서 제작·일반 드랍으로는
  // 못 얻는 한두 티어 위의 "한 자루" — 운빨로 점프하는 손맛 전용이라 곡선 위로 살짝만 비집고 들어간다
  // (보조 스탯 합으로 보면 같은 구간 정식 장비가 대개 더 낫다). 드랍/원정 결과에 강조 배너가 뜨고,
  // 드랍 품질 롤도 그대로 적용된다 — 정교한/빼어난까지 겹치면 더블 잭팟. 1번(두더지왕의 드릴)은 위 참고.
  bat_swarm_charm: {
    name: "박쥐떼의 길잡이",
    slot: "accessory",
    stats: [
      { label: "속도", value: "+4" },
      { label: "민첩", value: "+2" },
    ],
    bonus: { spd: 4, dex: 2 },
    description: "박쥐 한 마리가 발에 꼭 끼우고 다니던 작은 뼈 장신구. 지니면 발밑이 환해지고 발걸음이 가벼워진다. 박쥐떼가 길을 안다는 옛말이 진짜였을지도.",
    rarity: "unique",
    tier: 2,
  } satisfies EquipItem,
  spider_queen_silk_robe: {
    name: "거미여왕의 비단갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+4" },
      { label: "행운", value: "+7" },
    ],
    bonus: { def: 4, luk: 7 },
    description: "거미가 제 몸보다 큰 비단 뭉치를 끌어안고 있었다. 풀어 두르면 결이 비단보다 곱고, 묘하게 운이 따라붙는다. 진짜 여왕이 짠 건지는 아무도 모른다.",
    rarity: "unique",
    tier: 2,
  } satisfies EquipItem,
  hero_broken_sword: {
    name: "부러진 영웅검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "방어력", value: "-2" },
    ],
    bonus: { atk: 8, def: -2 },
    description: "폐허 한구석에 반쯤 묻혀 있던 검의 윗동강. 폐허 늑대가 자루를 물어뜯고 있었다. 날밑이 떨어져 나가 손이 자꾸 베이지만, 한 번 휘두르면 옛 영웅의 무게가 실린다.",
    rarity: "unique",
    tier: 2,
  } satisfies EquipItem,
  // 운향 만월의 '부러진 영웅검' 복원 의뢰(storyQuests: hero_sword_restoration) 보상.
  // hero_broken_sword 윗동강 + 운봉석 검신 + 화염 능선 재료 날밑 → 한 자루로 복원. 서사 아이템이라 거래 불가.
  hero_sword: {
    name: "영웅검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+18" },
      { label: "힘", value: "+5" },
    ],
    bonus: { atk: 18, str: 5 },
    description: "운향 대장장이 만월이 부러진 윗동강에 운봉석 검신을 잇고, 화염 능선의 것으로 새 날밑을 둘러 되살린 검. 옛 영웅이 들었을 때의 무게가 고스란히 돌아왔다. 묵직한데도 손에 착 감기고, 그 무게가 곧 위력이 된다.",
    rarity: "legendary",
    tradable: false,
    tier: 5,
  } satisfies EquipItem,
  // ── 천공 라인 legendary 4종 — 신규 지역(starspire/skyfolk_ruins/apex_throne) 몹에서 ──
  // ──   ultra-rare(0.00015~0.0002) 로 떨어지는 specialized lore drop. craftable 라인엔  ──
  // ──   없는 stat 결합으로 빌드 다양성 부여.                                            ──
  starlight_bow: {
    name: "별빛 명궁",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+24" },
      { label: "민첩", value: "+15" },
    ],
    bonus: { atk: 24, dex: 15 },
    description: "별의 첨탑 정찰자들이 한 자루씩 들고 있었다 전해지는 가느다란 활. 시위를 당기면 별빛이 시위 결을 따라 흐른다.",
    rarity: "legendary",
    tier: 5,
  } satisfies EquipItem,
  ancient_sky_blade: {
    name: "옛 천공인의 칼",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+27" },
      { label: "힘", value: "+12" },
      { label: "속도", value: "+6" },
    ],
    bonus: { atk: 27, str: 12, spd: 6 },
    description: "옛 천공인 전사가 폐도 끝에서 부러뜨리지 못한 채 남긴 가벼우면서 잔인하게 무거운 칼. 휘둘러야 할 결을 손이 먼저 안다.",
    rarity: "legendary",
    tier: 5,
  } satisfies EquipItem,
  enthrone_plate: {
    name: "봉인된 황좌 갑주",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+21" },
      { label: "활력", value: "+15" },
      { label: "힘", value: "+5" },
    ],
    bonus: { def: 21, vit: 15, str: 5 },
    description: "잠든 황좌 거인 내부에 함께 잠들어 있던 옛 호위병의 갑주. 두르는 자에게 옥좌의 무게가 그대로 얹힌다.",
    rarity: "legendary",
    tier: 5,
  } satisfies EquipItem,
  starbound_charm: {
    name: "별빛 부적",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+15" },
      { label: "민첩", value: "+6" },
      { label: "속도", value: "+6" },
    ],
    bonus: { luk: 15, dex: 6, spd: 6 },
    description: "별빛 사도들이 마지막까지 품에 두고 있었다는 작은 부적. 손에 쥐면 어느 결로 떨어진 별의 자리가 어렴풋이 보인다.",
    rarity: "legendary",
    tier: 5,
  } satisfies EquipItem,

  // ── 천공 라인 빌드 정의 unique 18종 (Lv70~90) — 골렘갑주 패턴의 한쪽 몰빵 + 디버프 ─
  // 각 라인 잡몹에서 0.04% 로 떨어지는 specialized drop. craftable 곡선 위로 raw stat
  // 살짝 비집고 들어가지만 디버프 2~3종을 동시에 받아 특정 빌드(SPD/DEX/LUK/순수ATK/
  // 순수DEF) 에서만 손맛이 사는 한 자루.
  cloud_hunter_string: {
    name: "구름시위",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+15" },
      { label: "민첩", value: "+13" },
      { label: "활력", value: "-6" },
      { label: "방어력", value: "-4" },
    ],
    bonus: { atk: 15, dex: 13, vit: -6, def: -4 },
    description: "구름 사냥꾼이 한쪽 어깨에 메고 있던 가느다란 활. 손에 들면 어깨가 무거워지는 만큼 시위가 가벼워진다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  fate_weaver_skein: {
    name: "운명실",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+17" },
      { label: "민첩", value: "+4" },
      { label: "활력", value: "-5" },
      { label: "방어력", value: "-3" },
    ],
    bonus: { luk: 17, dex: 4, vit: -5, def: -3 },
    description: "운명 직조자가 끝까지 풀지 못한 별빛 실타래. 손에 쥐면 운이 가닥을 따라 따라붙고, 어깨가 텅 빈다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  starlight_lens: {
    name: "별빛 안목",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+16" },
      { label: "행운", value: "+4" },
      { label: "활력", value: "-5" },
      { label: "방어력", value: "-3" },
    ],
    bonus: { dex: 16, luk: 4, vit: -5, def: -3 },
    description: "별점술사 잔영이 한쪽 눈에 끼우고 있던 별빛 렌즈. 손에 쥐면 어깨가 비는 만큼 별의 자리가 또렷이 보인다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  corridor_string: {
    name: "회랑시위",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+16" },
      { label: "민첩", value: "+15" },
      { label: "활력", value: "-7" },
      { label: "방어력", value: "-4" },
    ],
    bonus: { atk: 16, dex: 15, vit: -7, def: -4 },
    description: "떠도는 시녀가 별빛 결을 한 가닥 더 매어 둔 활. 시위에 닿으면 어깨 위 무게가 사라진다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  wraith_omen_charm: {
    name: "망령 부적",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+20" },
      { label: "민첩", value: "+4" },
      { label: "활력", value: "-6" },
      { label: "방어력", value: "-4" },
    ],
    bonus: { luk: 20, dex: 4, vit: -6, def: -4 },
    description: "별빛 망령이 마지막까지 쥐고 있던 별점 부적. 손에 쥐면 별빛이 다음 한 수를 일러준다. 그 대가로 어깨가 비어 든다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  corridor_carapace: {
    name: "회랑갑주",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "공격력", value: "-3" },
      { label: "속도", value: "-5" },
      { label: "행운", value: "-2" },
    ],
    bonus: { def: 24, atk: -3, spd: -5, luk: -2 },
    description: "회랑 골렘의 잔해를 그대로 두른 두꺼운 갑주. 어떤 결도 들이치지 못하지만, 발이 묶이고 운도 따르지 않는다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  starlight_dust_armor: {
    name: "별바람 경갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+8" },
      { label: "민첩", value: "+14" },
      { label: "속도", value: "+6" },
      { label: "힘", value: "-5" },
      { label: "활력", value: "-7" },
    ],
    bonus: { def: 8, dex: 14, spd: 6, str: -5, vit: -7 },
    description: "별빛 망령이 두르고 있던 한 줌의 경갑. 두르면 어깨에 힘이 빠지는 만큼 발이 떠오른다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  ruin_scout_sandals: {
    name: "폐도 짚신",
    slot: "accessory",
    stats: [
      { label: "속도", value: "+18" },
      { label: "민첩", value: "+4" },
      { label: "활력", value: "-6" },
      { label: "방어력", value: "-4" },
    ],
    bonus: { spd: 18, dex: 4, vit: -6, def: -4 },
    description: "천공인 사관이 신고 다녔다는 가벼운 별빛 짚신. 신으면 어깨가 휑한 만큼 발이 살아난다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  ruin_phantom_blade: {
    name: "폐도 환검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+20" },
      { label: "속도", value: "+14" },
      { label: "활력", value: "-8" },
      { label: "방어력", value: "-5" },
    ],
    bonus: { atk: 20, spd: 14, vit: -8, def: -5 },
    description: "천공인 사관이 환영처럼 휘둘렀다는 가벼운 칼. 손에 들면 어깨가 비는 만큼 발이 한 박자 먼저 떨어진다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  skyfolk_warden_plate: {
    name: "천공 결갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+26" },
      { label: "공격력", value: "-3" },
      { label: "속도", value: "-6" },
      { label: "행운", value: "-2" },
    ],
    bonus: { def: 26, atk: -3, spd: -6, luk: -2 },
    description: "천공인 전사가 마지막까지 두르고 있던 두꺼운 갑주. 한 번 두르면 어떤 결도 안으로 닿지 못한다. 그 대가로 발이 묶인다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  skyfolk_greatsword: {
    name: "천공 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+26" },
      { label: "방어력", value: "-5" },
      { label: "속도", value: "-4" },
      { label: "행운", value: "-2" },
    ],
    bonus: { atk: 26, def: -5, spd: -4, luk: -2 },
    description: "폐허의 거상이 한 손에 들고 있던 양손검. 두 손으로도 무겁지만, 한 번 휘두르면 별이 떨어진다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  road_flash_dagger: {
    name: "일섬 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+18" },
      { label: "민첩", value: "+18" },
      { label: "활력", value: "-8" },
      { label: "방어력", value: "-5" },
    ],
    bonus: { atk: 18, dex: 18, vit: -8, def: -5 },
    description: "황성 의장기수가 옥좌의 길에서 다듬은 가느다란 단검. 손에 닿으면 어깨가 비고 끝이 살아난다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  road_resolve_blade: {
    name: "황성 결검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+30" },
      { label: "방어력", value: "-6" },
      { label: "속도", value: "-4" },
      { label: "행운", value: "-2" },
    ],
    bonus: { atk: 30, def: -6, spd: -4, luk: -2 },
    description: "황성 호위병이 마지막까지 휘두른 옛 결의 칼. 무게가 손에 그대로 얹히는 만큼 발이 묶인다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  road_sandals: {
    name: "황성 짚신",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+4" },
      { label: "속도", value: "+18" },
      { label: "활력", value: "-7" },
      { label: "힘", value: "-5" },
    ],
    bonus: { def: 4, spd: 18, vit: -7, str: -5 },
    description: "황성 호위병이 신고 옥좌의 길을 달렸다는 가벼운 짚신. 신으면 힘이 빠지는 만큼 발이 살아난다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  shard_seal_plate: {
    name: "파편 결정갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+29" },
      { label: "공격력", value: "-4" },
      { label: "속도", value: "-6" },
      { label: "행운", value: "-2" },
    ],
    bonus: { def: 29, atk: -4, spd: -6, luk: -2 },
    description: "봉인 파편이 단단해진 옛 봉인의 결정을 그대로 두른 갑주. 어떤 무게도 결정 위로 미끄러진다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  throne_pursuer_sandals: {
    name: "옥좌 짚신",
    slot: "accessory",
    stats: [
      { label: "속도", value: "+22" },
      { label: "민첩", value: "+6" },
      { label: "활력", value: "-8" },
      { label: "방어력", value: "-5" },
    ],
    bonus: { spd: 22, dex: 6, vit: -8, def: -5 },
    description: "옥좌의 검신이 신고 옥좌 둘레를 돌았다는 가벼운 짚신. 신으면 어깨가 비고 발이 살아난다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  apostle_shard_blade: {
    name: "사도 잔검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+22" },
      { label: "행운", value: "+18" },
      { label: "활력", value: "-8" },
      { label: "방어력", value: "-5" },
    ],
    bonus: { atk: 22, luk: 18, vit: -8, def: -5 },
    description: "별빛 사도가 끝까지 부러뜨리지 못한 잔검. 손에 쥐면 어깨가 비고 운이 끝을 따라 떨어진다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  throne_starbook: {
    name: "황좌 별책",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+24" },
      { label: "공격력", value: "+5" },
      { label: "활력", value: "-8" },
      { label: "방어력", value: "-5" },
    ],
    bonus: { luk: 24, atk: 5, vit: -8, def: -5 },
    description: "잠든 황좌 거인이 옛 황성에서 두고 떠난 별책. 손에 쥐면 어깨가 비고 별의 결이 손가락에 흐른다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,

  sky_render_talon: {
    name: "하늘가르개",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+11" },
      { label: "민첩", value: "+5" },
    ],
    bonus: { atk: 11, dex: 5 },
    description: "초원 매가 한쪽 발에 끼우고 다니던 굽은 발톱 모양 쇳조각. 휘두르면 허공이 가늘게 갈라진다. 어느 대장장이가 매에게 빼앗긴 물건이라는 소문이 있다.",
    rarity: "unique",
    tier: 4,
  } satisfies EquipItem,
  lava_core_maul: {
    name: "굳은 용암핵 망치",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+11" },
      { label: "속도", value: "-2" },
    ],
    bonus: { atk: 11, spd: -2 },
    description: "용암 슬라임이 미처 녹이지 못한 채 품고 있던 거대한 용암 핵에 자루를 단 것. 둔하기 짝이 없지만, 한 번 내리치면 땅이 운다.",
    rarity: "unique",
    tier: 4,
  } satisfies EquipItem,

  // ── 중간 단계 제작 장비 ───────────────────────────────────────────────────
  // 그동안 퀘스트 deliver/판매 외엔 쓸 데가 없던 재료(영혼 결정·산초꽃·바람 마석·늑대왕의 송곳니·
  // 초원 매 깃털)에 제작 destination 을 붙인 라인. 각자 그 재료가 나오는 구간에서 다음 보스 보상 전까지
  // 한 칸 메우는 정도 — 곡선 위로 살짝 비집고 들어간다. 제작서는 해당 재료를 이미 소비하던 의뢰의
  // 보상으로 풀린다(바람 마석만 돌풍 정령 recipe 드롭).
  soul_blade: {
    name: "혼백검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+5" },
      { label: "활력", value: "+1" },
    ],
    bonus: { atk: 5, vit: 1 },
    description: "떠도는 망령에게서 거둔 영혼 결정을 칼날 안에 박아 벼린 검. 결정에서 새어 나오는 한기가 칼날을 좀처럼 식지 않게 한다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  sancho_vest: {
    name: "산초 누비 조끼",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+5" },
      { label: "활력", value: "+3" },
    ],
    bonus: { def: 5, vit: 3 },
    description: "말린 산초꽃을 천 사이에 누벼 넣은 조끼. 두르면 몸이 은근히 따뜻하고, 베인 자리가 더디 곪는다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  windmana_charm: {
    name: "바람 마석 부적",
    slot: "accessory",
    stats: [
      { label: "속도", value: "+3" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { spd: 3, dex: 1 },
    description: "협곡 정령이 흩뿌린 바람 마석을 가는 끈에 꿰어 만든 부적. 손목에 두르면 발끝이 바람을 머금은 듯 가볍다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  wolfking_fang_dagger: {
    name: "늑대왕 송곳니 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "민첩", value: "+3" },
    ],
    bonus: { atk: 7, dex: 3 },
    description: "무리를 이끄는 늑대만이 갖는 길고 굵은 송곳니를 그대로 자루에 박아 만든 단검. 휘두를 때마다 짐승의 무게가 손에 실린다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  hawkfeather_cloak: {
    name: "매깃 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+3" },
      { label: "속도", value: "+4" },
    ],
    bonus: { def: 3, spd: 4 },
    description: "초원 매의 길고 가벼운 깃털을 이어 짠 망토. 바람을 잘 타 두르면 발걸음이 한결 빨라진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,

  // ── 기존 장비를 재료(equip)로 한 단계 끌어올린 결과물 ──
  // 베이스가 'equip' 재료로 소비된다 (recipes.ts). 명품(unique) 업그레이드는 결과도 unique ("손에 맞춰진 보물").
  reinforced_leather_armor: {
    name: "덧댄 가죽갑옷",
    slot: "armor",
    stats: [{ label: "방어력", value: "+5" }],
    bonus: { def: 5 },
    description: "낡은 가죽갑옷에 들개 가죽을 덧대고 두텁게 누벼 받친 것. 같은 한 벌인데 한층 든든하다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  bandit_chief_dagger: {
    name: "두목의 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "민첩", value: "+3" },
    ],
    bonus: { atk: 6, dex: 3 },
    description: "산적의 단검에 단단한 수정을 박아 날을 다시 세운 것. 두목쯤은 들고 다녔을 법한 무게가 손에 감긴다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  nymph_blessing: {
    name: "호수 님프의 가호",
    slot: "accessory",
    stats: [
      { label: "속도", value: "+4" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { spd: 4, dex: 1 },
    description: "님프의 반지에 요정가루를 입혀 가호를 깊게 한 것. 끼고 있으면 발끝이 호숫물처럼 가볍다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  reforged_golem_hammer: {
    name: "재단조한 골렘 망치",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "힘", value: "+3" },
      { label: "속도", value: "-2" },
    ],
    bonus: { atk: 8, str: 3, spd: -2 },
    description: "골렘의 망치를 마정석으로 다시 벼리고 폐허 잔해로 자루를 보강한 것. 여전히 둔하지만, 한 번 내리치면 무게가 다르다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  wraithking_cloak: {
    name: "망령왕의 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+4" },
      { label: "민첩", value: "+2" },
      { label: "속도", value: "+3" },
    ],
    bonus: { def: 4, dex: 2, spd: 3 },
    description: "망령의 망토에 영혼 결정을 엮어 넣어 한기를 깊게 한 것. 두르면 발소리가 사라지고, 베인 자리가 시리다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  lava_core_greatmaul: {
    name: "용암핵 대망치",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+14" },
      { label: "속도", value: "-2" },
    ],
    bonus: { atk: 14, spd: -2 },
    description: "굳은 용암핵 망치에 용암 핵을 더 녹여 붓고 화염 비늘로 자루를 감싼 것. 더 둔해진 만큼, 한 번 내리치면 땅이 갈라진다.",
    rarity: "unique",
    tier: 4,
  } satisfies EquipItem,
  azure_talon: {
    name: "창천의 발톱",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+13" },
      { label: "민첩", value: "+6" },
    ],
    bonus: { atk: 13, dex: 6 },
    description: "하늘가르개에 초원 매 깃털을 겹겹이 둘러 균형을 잡은 것. 휘두르면 허공이 한 줄 더 깊게 갈라진다.",
    rarity: "unique",
    tier: 4,
  } satisfies EquipItem,
  spider_queen_silk_plate: {
    name: "거미여왕의 비단 정갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+5" },
      { label: "행운", value: "+9" },
    ],
    bonus: { def: 5, luk: 9 },
    description: "거미여왕의 비단갑을 거미줄로 더 곱게 짜 올린 정갑. 결이 비단 위의 비단이고, 운이 더 끈질기게 따라붙는다.",
    rarity: "unique",
    tier: 3,
  } satisfies EquipItem,
  bat_swarm_guide: {
    name: "박쥐떼의 인도자",
    slot: "accessory",
    stats: [
      { label: "속도", value: "+6" },
      { label: "민첩", value: "+3" },
    ],
    bonus: { spd: 6, dex: 3 },
    description: "박쥐떼의 길잡이에 박쥐 눈알을 박아 어둠을 더 멀리 읽게 한 것. 지니면 한 발 앞이 늘 환하고, 그만큼 발이 앞선다.",
    rarity: "unique",
    tier: 3,
  } satisfies EquipItem,
  phoenix_flight_cape: {
    name: "봉황 비행깃 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+6" },
      { label: "민첩", value: "+3" },
      { label: "속도", value: "+6" },
    ],
    bonus: { def: 6, dex: 3, spd: 6 },
    description: "봉황 망토에 봉황 깃털을 더 이어 짜 비행깃을 살린 것. 두르면 발이 불꽃처럼 가벼워지고, 방향을 트는 게 한결 빠르다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,
  mole_king_borer: {
    name: "두더지왕의 굴착드릴",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "속도", value: "+3" },
    ],
    bonus: { atk: 8, spd: 3 },
    description: "두더지왕의 드릴에 단단한 수정 날과 마정석 동력부를 단 것. 회전이 묵직해지고, 파고드는 손맛이 한 단계 위다.",
    rarity: "unique",
    tier: 2,
  } satisfies EquipItem,

  // ── 해안 지선 장비 (조수 갯벌 / 산호초 섬 / 수심의 것) ─────────────────────
  // 폐허~산기슭 구간과 나란히 놓이는 바닷길 라인. 갯벌 입문 2종(게딱지) → 산호초 섬 잡몹산 3종
  // (산호 가시·심해 비늘) → 업그레이드 3종 → 수심의 것 보스 보상(심연 무구 4 + 수심의 핵).
  // 제작산은 표시값=평균, 보스 드랍산은 표시값=하한. 모두 제작 품질 변동(`품질 변동: …`)이 굴려진다.
  crab_shell_buckler: {
    name: "게딱지 손방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+3" },
      { label: "방어력", value: "+2" },
    ],
    bonus: { atk: 3, def: 2 },
    description: "집게발 게의 등딱지를 깎아 댄 작은 손방패. 가볍고, 보기보다 단단하다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  tideflats_waders: {
    name: "갯벌 각반",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+4" },
      { label: "속도", value: "+1" },
    ],
    bonus: { def: 4, spd: 1 },
    description: "게딱지 조각을 정강이에 누벼 감싼 각반. 진흙에 발이 빠져도 미끄러지지 않는다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  coral_spine_dagger: {
    name: "산호 가시 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+5" },
      { label: "민첩", value: "+2" },
    ],
    bonus: { atk: 5, dex: 2 },
    description: "암초에서 부러진 산호 가시를 갈아 자루에 박은 단검. 끝이 송곳처럼 예리하다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  siren_scale_robe: {
    name: "사이렌 비늘 로브",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+5" },
      { label: "속도", value: "+2" },
    ],
    bonus: { def: 5, spd: 2 },
    description: "산호초 사이렌의 비늘을 이어 짠 로브. 물기를 머금어 서늘하고, 걸치면 발이 매끄럽게 미끄러진다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  tideglass_charm: {
    name: "조수유리 부적",
    slot: "accessory",
    stats: [
      { label: "활력", value: "+3" },
      { label: "행운", value: "+2" },
    ],
    bonus: { vit: 3, luk: 2 },
    description: "심해 비늘과 산호 조각을 가는 끈에 엮어 만든 부적. 파도가 드나드는 소리가 은은하게 난다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  // 업그레이드 결과 3종 — 베이스를 'equip' 재료로 소비 (recipes.ts).
  crustacean_bulwark: {
    name: "갑각 보루방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+5" },
      { label: "방어력", value: "+4" },
      { label: "속도", value: "-1" },
    ],
    bonus: { atk: 5, def: 4, spd: -1 },
    description: "게딱지 손방패에 더 큰 갑각판과 산호 가시를 덧대 보루처럼 키운 방패. 묵직한 만큼 발이 조금 무겁다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  barbed_coral_dagger: {
    name: "가시 산호 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "민첩", value: "+3" },
    ],
    bonus: { atk: 7, dex: 3 },
    description: "산호 가시 단검에 잔가시를 더 박아 넣은 것. 스칠 때마다 살갗을 긁는다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  siren_song_mantle: {
    name: "사이렌 노래 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+7" },
      { label: "민첩", value: "+2" },
      { label: "속도", value: "+3" },
    ],
    bonus: { def: 7, dex: 2, spd: 3 },
    description: "사이렌 비늘 로브에 심해 비늘을 더 이어 짠 망토. 두르면 물살을 가르듯 움직임이 부드러워진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  // 수심의 것 보스 보상 — 심연 무구 4종(무기, atk +7 공통 + 보조 stat) + 수심의 핵(액세서리).
  // recipe_one_of 로 무기 1종 확정 학습, 0.15 로 수심의 핵 제작서. 마정석 라인의 한 단계 위.
  abyssal_edge: {
    name: "심연 칼날",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "힘", value: "+4" },
    ],
    bonus: { atk: 7, str: 4 },
    description: "수심의 것의 비늘을 벼려 만든 칼날. 휘두를 때마다 깊은 물의 무게가 손에 실린다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  abyssal_ward: {
    name: "심연 방벽",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "활력", value: "+4" },
    ],
    bonus: { atk: 7, vit: 4 },
    description: "수심의 것의 등딱지를 그대로 두른 방패형 무구. 막아내면 차가운 물살이 손끝까지 전해진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  abyssal_pike: {
    name: "심연 장창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "민첩", value: "+5" },
    ],
    bonus: { atk: 7, dex: 5 },
    description: "수심의 것의 가시뼈를 깎아 박은 긴 창. 멀리서도 물살을 가르듯 곧게 뻗는다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  abyssal_clasp: {
    name: "심연 손아귀",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 7, luk: 5 },
    description: "수심의 것의 발톱뼈를 손등에 박은 너클. 한 방 한 방이 깊은 물처럼 어디로 향할지 알 수 없다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  abyssal_heart: {
    name: "수심의 핵",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+3" },
      { label: "활력", value: "+3" },
    ],
    bonus: { dex: 3, vit: 3 },
    description: "수심의 것의 가슴 깊은 곳에서 꺼낸 차가운 핵. 손에 쥐면 숨이 길어지고 손끝이 또렷해진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  // 유실된 명품 — 진흙 미꾸라지가 아주 드물게 떨군다. tidelord_signet 은 가시 산호 골렘/수심의 것이
  // 떨구는 새김서로 끌어올린 결과(결과도 unique) — "손에 맞춰진 보물".
  drowned_signet: {
    name: "물에 잠긴 인장반지",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+4" },
      { label: "속도", value: "+1" },
    ],
    bonus: { luk: 4, spd: 1 },
    description: "어느 진흙 미꾸라지가 진창 속에 끌고 다니던 낡은 인장반지. 문장이 닳아 누구 것이었는지는 알 수 없지만, 끼고 있으면 묘하게 운이 따른다.",
    rarity: "unique",
    tier: 2,
  } satisfies EquipItem,
  tidelord_signet: {
    name: "조수군주의 인장",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+6" },
      { label: "속도", value: "+2" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { luk: 6, spd: 2, dex: 1 },
    description: "닳은 인장반지에 심해 비늘을 녹여 새 문장을 새겨 넣은 것. 무슨 문장인지는 아무도 모르지만, 끼고 있으면 파도가 제 편인 듯하다.",
    rarity: "unique",
    tier: 3,
  } satisfies EquipItem,

  // ── 서편 옛길 장비 (서편 옛길 / 옛 변경 성채 / 옛 성문지기) ─────────────────
  // 시작 마을 서쪽의 막다른 라인. 옛길 입문 2종(까마귀 깃) → 옛 변경 성채 잡몹산 3종
  // (녹슨 쇳조각·옛 군기 조각) → 업그레이드 3종 → 옛 성문지기 보스 보상(수비대 무구 4 + 성문지기의 핵).
  // 수비대 무구는 마정석 라인과 운봉 라인 사이(atk +6 + 보조 +4) — 옛 변경 성채(Lv13) tier.
  crow_feather_cap: {
    name: "까마귀깃 두건",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+1" },
      { label: "속도", value: "+2" },
    ],
    bonus: { def: 1, spd: 2 },
    description: "들까마귀 깃을 이어 댄 가벼운 두건. 머리에 쓰면 발걸음이 묘하게 가벼워진다.",
    rarity: "uncommon",
    tier: 1,
  } satisfies EquipItem,
  roadbandit_shortsword: {
    name: "노상강도의 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+3" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { atk: 3, dex: 1 },
    description: "옛길에 눌러앉은 노상강도가 품에 차고 다니던 짧은 검. 들고양이 송곳니로 손잡이를 감았다.",
    rarity: "uncommon",
    tier: 1,
  } satisfies EquipItem,
  garrison_hauberk: {
    name: "수비대 사슬갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+6" },
      { label: "활력", value: "+1" },
    ],
    bonus: { def: 6, vit: 1 },
    description: "녹슨 쇳조각을 다시 엮어 짠 사슬갑옷. 한 세대 전 변경 수비대가 입던 것과 같은 짜임이다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  geared_warpick: {
    name: "톱니 전곡괭이",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+5" },
      { label: "힘", value: "+2" },
    ],
    bonus: { atk: 5, str: 2 },
    description: "녹슨 자동인형의 톱니와 강철판으로 머리를 벼린 전쟁용 곡괭이. 한 번 내리찍으면 묵직하게 박힌다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  tattered_standard_cloak: {
    name: "낡은 군기 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+4" },
      { label: "속도", value: "+2" },
      { label: "행운", value: "+1" },
    ],
    bonus: { def: 4, spd: 2, luk: 1 },
    description: "옛 변경 수비대의 군기를 기워 두른 망토. 빛바랜 문장이 등에 희미하게 남아 있다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  // 업그레이드 결과 3종 — 베이스를 'equip' 재료로 소비 (recipes.ts).
  roadbandit_falchion: {
    name: "노상강도의 활검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+5" },
      { label: "민첩", value: "+3" },
    ],
    bonus: { atk: 5, dex: 3 },
    description: "노상강도의 단검에 녹슨 쇳조각을 덧대 날을 길게 늘이고 굽힌 것. 휘둘러 베는 맛이 한결 매섭다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  reinforced_garrison_hauberk: {
    name: "보강한 수비대 사슬갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+8" },
      { label: "활력", value: "+3" },
      { label: "속도", value: "-1" },
    ],
    bonus: { def: 8, vit: 3, spd: -1 },
    description: "수비대 사슬갑옷에 녹슨 쇳조각으로 가슴판을 덧대고 옛 군기 조각으로 안감을 받친 것. 두터워진 만큼 발이 조금 무겁다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  frontier_standard_cloak: {
    name: "변경 군기 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+6" },
      { label: "속도", value: "+3" },
      { label: "행운", value: "+2" },
    ],
    bonus: { def: 6, spd: 3, luk: 2 },
    description: "낡은 군기 망토에 또 다른 군기 조각을 겹쳐 기워 결을 두텁게 한 것. 등의 문장이 한결 또렷해졌다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  // 옛 성문지기 보스 보상 — 수비대 무구 4종(무기, atk +6 공통 + 보조 +4) + 성문지기의 핵(액세서리).
  // recipe_one_of 로 무기 1종 확정 학습, 0.15 로 성문지기의 핵. 마정석 라인과 운봉 라인 사이 tier.
  garrison_blade: {
    name: "수비대 도검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "힘", value: "+4" },
    ],
    bonus: { atk: 6, str: 4 },
    description: "옛 성문지기의 강철판을 다시 벼려 만든 한손 도검. 휘두를 때마다 옛 수비대의 무게가 손에 실린다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  garrison_bulwark: {
    name: "수비대 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "활력", value: "+4" },
    ],
    bonus: { atk: 6, vit: 4 },
    description: "옛 성문지기의 빗장을 그대로 두른 방패형 무구. 막아내면 묵직한 강철의 무게가 손목에 전해진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  garrison_glaive: {
    name: "수비대 미늘창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "민첩", value: "+4" },
    ],
    bonus: { atk: 6, dex: 4 },
    description: "옛 성문지기의 톱니 끝을 깎아 미늘로 박은 긴 창. 멀리서도 정확하게 찔러 건다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  garrison_cudgel: {
    name: "수비대 철퇴",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "행운", value: "+4" },
    ],
    bonus: { atk: 6, luk: 4 },
    description: "옛 성문지기의 강철판을 뭉쳐 머리를 단 철퇴. 한 방 한 방이 어디로 떨어질지 휘두르는 자도 모른다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  gatekeeper_core: {
    name: "성문지기의 핵",
    slot: "accessory",
    stats: [
      { label: "활력", value: "+4" },
      { label: "힘", value: "+2" },
    ],
    bonus: { vit: 4, str: 2 },
    description: "옛 성문지기의 가슴 깊은 곳에서 멈춰 있던 강철 핵. 손에 쥐면 어깨가 묵직해지고 버티는 힘이 단단해진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  // 유실된 명품 — 들까마귀 떼가 아주 드물게 떨군다. corvid_fortune_charm 은 녹슨 자동인형/옛
  // 성문지기가 떨구는 새김서로 끌어올린 결과(결과도 unique) — "손에 맞춰진 보물".
  crows_hoard_charm: {
    name: "까마귀 둥지의 부적",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+3" },
      { label: "속도", value: "+2" },
    ],
    bonus: { luk: 3, spd: 2 },
    description: "들까마귀 떼가 둥지에 그러모은 잡동사니. 닳은 동전, 깨진 거울 조각, 가는 사슬을 엮어 만든 듯한 장신구. 누가 만든 건지 아무도 모르지만, 지니면 묘하게 운이 따른다.",
    rarity: "unique",
    tier: 2,
  } satisfies EquipItem,
  corvid_fortune_charm: {
    name: "까마귀 보물의 부적",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+5" },
      { label: "속도", value: "+3" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { luk: 5, spd: 3, dex: 1 },
    description: "까마귀 둥지의 부적에 녹슨 동전과 톱니를 더 엮어 무겁게 한 것. 누가 손본 건지 모르지만, 지니면 운이 한층 끈질기게 따라붙는다.",
    rarity: "unique",
    tier: 3,
  } satisfies EquipItem,

  // ── 용비늘 라인 장비 (뼈무덤 황야 / 용비늘 묘지 / 뼈비늘 노룡) ─────────────
  // 바람골 역참 남쪽의 막다른 라인. 서양 판타지 톤의 고룡 묘지 — 방어 중심 무구가 떨어진다.
  // 황야 입문 2종(뼈비늘 손방패·황야 행자 갑옷) → 묘지 잡몹산 3종(용골 카이트 방패·비늘 보호갑·
  // 뼈각인 투구) → 뼈비늘 노룡 보스 보상(용비늘 무구 3종 업그레이드 + 뼈왕의 대검 + 용지기의 망토).
  // 별·회랑 라인(Lv70~75)과 같은 tier 5 영역이지만 방어/활력 비중이 훨씬 높다.
  bonescale_buckler: {
    name: "뼈비늘 손방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "활력", value: "+5" },
      { label: "방어력", value: "+2" },
    ],
    bonus: { atk: 8, vit: 5, def: 2 },
    description: "황야의 도굴꾼이 뼛조각과 용비늘 가루로 덧대 짠 작은 손방패. 가볍지만, 보기보다 단단하다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,
  barrow_traveler_armor: {
    name: "황야 행자 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+9" },
      { label: "활력", value: "+4" },
    ],
    bonus: { def: 9, vit: 4 },
    description: "뼈무덤 황야를 떠도는 자들이 두르는 두꺼운 가죽 갑옷. 안감에 용비늘 가루를 다져 넣어 모래바람도 막아낸다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,
  // 용비늘 묘지 잡몹산 3종 — Lv75 사냥터 드랍 제작서로 풀린다.
  dragonbone_kite_shield: {
    name: "용골 카이트 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+11" },
      { label: "활력", value: "+9" },
      { label: "방어력", value: "+3" },
    ],
    bonus: { atk: 11, vit: 9, def: 3 },
    description: "묘지에서 거둔 용골을 잘라 두른 길쭉한 카이트 방패. 한 번 들면 어깨가 묵직해지지만, 그만큼 어디로 들이쳐도 받아낸다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  scaleguard_plate: {
    name: "비늘 보호갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+11" },
      { label: "활력", value: "+6" },
    ],
    bonus: { def: 11, vit: 6 },
    description: "용비늘 조각을 비늘 모양 그대로 강철 안감에 누벼 댄 갑주. 잿빛 비늘이 어깨부터 허리까지 한 줄로 흐른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  bonerune_helm: {
    name: "뼈각인 투구",
    slot: "accessory",
    stats: [
      { label: "방어력", value: "+5" },
      { label: "활력", value: "+4" },
    ],
    bonus: { def: 5, vit: 4 },
    description: "용골을 갈아 옛 보호의 결을 새겨 넣은 강철 투구. 머리에 쓰면 옛 룬이 가늘게 떨리며 머리뼈를 감싸 보호한다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  // 뼈비늘 노룡 보스 보상 — 잡몹산 3종 업그레이드(영광 방패·흉갑·투구) + 뼈왕의 대검 + 용지기의 망토.
  // recipe_one_of 로 4종 중 1종 확정 학습, 0.15 로 망토 제작서. 별·회랑 라인 위, 에테르 아래.
  dragonscale_aegis: {
    name: "용비늘 영광 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+13" },
      { label: "활력", value: "+12" },
      { label: "방어력", value: "+5" },
    ],
    bonus: { atk: 13, vit: 12, def: 5 },
    description: "용골 카이트 방패의 골격에 노룡의 비늘을 한 겹 더 얹고 뼈각인 강철로 결을 다시 잡은 방패. 막아내면 옛 룬이 결을 따라 떨린다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  dragonscale_plate: {
    name: "용비늘 흉갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+15" },
      { label: "활력", value: "+9" },
    ],
    bonus: { def: 15, vit: 9 },
    description: "비늘 보호갑에 노룡의 가슴 비늘을 가공해 덧댄 흉갑. 한 번 두르면 정면에서 들이치는 어떤 결도 비늘 위로 미끄러져 나간다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  dragonscale_helm: {
    name: "용비늘 투구",
    slot: "accessory",
    stats: [
      { label: "방어력", value: "+8" },
      { label: "활력", value: "+6" },
      { label: "힘", value: "+3" },
    ],
    bonus: { def: 8, vit: 6, str: 3 },
    description: "뼈각인 투구의 위로 노룡의 두골 비늘을 한 겹 더 두른 투구. 쓰면 어깨에 노룡의 무게가 그대로 얹힌다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  boneking_greatsword: {
    name: "뼈왕의 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+17" },
      { label: "힘", value: "+9" },
    ],
    bonus: { atk: 17, str: 9 },
    description: "노룡의 등뼈를 통째로 깎아 손잡이를 박은 거대한 양손검. 휘두를 때마다 묘지 깊은 곳에서 노룡이 한 번 더 일어서듯 무겁다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  wyrm_warden_cloak: {
    name: "용지기의 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+10" },
      { label: "활력", value: "+3" },
      { label: "속도", value: "+5" },
    ],
    bonus: { def: 10, vit: 3, spd: 5 },
    description: "노룡의 잿빛 비늘을 가는 가닥으로 풀어 짠 가벼운 망토. 두르면 발이 묘하게 가벼워지면서도 등이 든든하다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
} as const;

export type ItemId = keyof typeof ITEMS;

const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const NAME_TO_ID: Map<string, ItemId> = new Map(
  ITEM_IDS.map((id) => [ITEMS[id].name, id]),
);

// 장착돼 있던 EquipItem이 어느 ITEMS 엔트리인지 역추적. localStorage 저장 후
// 참조가 끊긴 인스턴스도 이름 매칭으로 식별 — 이름은 고유라고 가정.
export function findItemId(item: EquipItem | null | undefined): ItemId | null {
  if (!item) return null;
  return NAME_TO_ID.get(item.name) ?? null;
}
