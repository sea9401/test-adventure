import { ITEMS, type EquipItem, type EquipSlot, type ItemId } from "./items";
import {
  applyCraftTier,
  craftHasVariance,
  type CraftedEquipItem,
  type CraftTier,
  type CraftVariance,
} from "./craftQuality";
import type { MaterialId } from "./materials";
import type { PotionId } from "./potions";

export type { EquipSlot } from "./items";

export type RecipeIngredient =
  | { kind: "material"; materialId: MaterialId; count: number }
  | { kind: "equip"; itemId: ItemId; count: number };

export type RecipeResult =
  | { kind: "equipment"; itemId: ItemId; slot: EquipSlot }
  | { kind: "potion"; potionId: PotionId; quantity: number };

// CraftVariance(variance / varianceTable) 를 합쳐 — 둘 다 옵셔널, equipment 결과에만 의미.
export type Recipe = CraftVariance & {
  id: string;
  name: string;
  description: string;
  ingredients: RecipeIngredient[];
  result: RecipeResult;
  /** 거래소 등록 / 우편 선물 가능 여부. 미지정/true → 가능. */
  tradable?: boolean;
};

export const RECIPES: Recipe[] = [
  {
    id: "baseball_bat",
    name: "야구 방망이 제작서",
    description: `${ITEMS.baseball_bat.name}을(를) 만든다. 손맛이 묵직하다.`,
    ingredients: [{ kind: "material", materialId: "branch", count: 2 }],
    result: { kind: "equipment", itemId: "baseball_bat", slot: "weapon" },
    variance: { atk: 1 },
  },
  // ── 마력가루 회복약 공정 3 종 ──────────────────────────────────────────
  // 작은 회복약은 상점에서 구입 가능. 중간/큰 회복약은 분해실에서 잉여 장비/재료를
  // 갈아낸 마력가루(mana_dust) 한 가지로만 제작. 이 세 레시피는 시작 시점부터
  // 자동 학습 (useCrafting.readInitial 이 known 에 자동 보강 — 기존 세이브도 자동 적용).
  // (지역 재료 라인 — 슬라임 조각/산초꽃/봉황 깃털 — 3 종은 제거됐다.)
  {
    id: "potion_heal_s_dust",
    name: "작은 회복약: 가루 공정",
    description: "마력가루를 약불에 졸여 작은 회복약을 만든다. 통화처럼 굳은 가루도 약이 된다.",
    ingredients: [{ kind: "material", materialId: "mana_dust", count: 1 }],
    result: { kind: "potion", potionId: "potion_heal_s", quantity: 1 },
  },
  {
    id: "potion_heal_m_dust",
    name: "중간 회복약: 가루 공정",
    description: "마력가루 세 줌을 한 모금으로 졸여 중간 회복약을 만든다.",
    ingredients: [{ kind: "material", materialId: "mana_dust", count: 3 }],
    result: { kind: "potion", potionId: "potion_heal_m", quantity: 1 },
  },
  {
    id: "potion_heal_l_dust",
    name: "큰 회복약: 가루 공정",
    description: "마력가루를 한 사발 졸여 큰 회복약을 만든다. 손맛이 굳어야 한 병이 빚어진다.",
    ingredients: [{ kind: "material", materialId: "mana_dust", count: 7 }],
    result: { kind: "potion", potionId: "potion_heal_l", quantity: 1 },
  },
  {
    id: "squishy_armor",
    name: "물컹물컹한 갑옷 제작법",
    description: `${ITEMS.squishy_armor.name}을(를) 만든다. 슬라임 핵을 심으로 두르고 조각을 겹겹이 다진다.`,
    ingredients: [
      { kind: "material", materialId: "slime_core", count: 1 },
      { kind: "material", materialId: "slime_chunk", count: 16 },
    ],
    result: { kind: "equipment", itemId: "squishy_armor", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "nailed_baseball_bat",
    name: "못박힌 야구방망이 제작서",
    description: `${ITEMS.nailed_baseball_bat.name}을(를) 만든다. ${ITEMS.baseball_bat.name}에 낡은 못을 잔뜩 박아 넣는다.`,
    ingredients: [
      { kind: "equip", itemId: "baseball_bat", count: 1 },
      { kind: "material", materialId: "rusty_nail", count: 28 },
    ],
    result: {
      kind: "equipment",
      itemId: "nailed_baseball_bat",
      slot: "weapon",
    },
    variance: { atk: 1 },
  },
  {
    id: "sticky_cloak",
    name: "비단 로브 제작서",
    description: `${ITEMS.sticky_cloak.name}을(를) 만든다. 거미줄을 비단처럼 곱게 짜낸다.`,
    // spider_silk: 거미 4.5% 단독 드랍. 같은 재료를 golem_armor 도 7개 요구해 합 14 ≈ 311킬 벽이었음.
    // 보로 거미줄 의뢰(deliver 10) 와 합치면 더 부담 — 4 로 낮춰 두 추출물 합 8 + 의뢰 10 = 18 (≈ 400킬).
    ingredients: [
      { kind: "material", materialId: "spider_silk", count: 4 },
      { kind: "material", materialId: "slime_chunk", count: 5 },
    ],
    result: {
      kind: "equipment",
      itemId: "sticky_cloak",
      slot: "armor",
    },
    variance: { luk: 1 },
  },
  {
    id: "bat_hood",
    name: "박쥐가죽 후드 제작서",
    description: `${ITEMS.bat_hood.name}을(를) 만든다. 박쥐 가죽을 이어 후드의 형태를 잡는다.`,
    ingredients: [
      { kind: "material", materialId: "bat_eye", count: 3 },
      { kind: "material", materialId: "wilddog_hide", count: 3 },
    ],
    result: {
      kind: "equipment",
      itemId: "bat_hood",
      slot: "armor",
    },
    variance: { spd: 1 },
  },
  {
    id: "golem_armor",
    name: "골렘갑주 제작서",
    description: `${ITEMS.golem_armor.name}을(를) 만든다. 폐허 잔해를 다듬어 거미줄로 안을 덧대고 슬라임 점액으로 이음새를 메운다.`,
    // spider_silk 7→4: sticky_cloak 과 같은 재료(거미 단독 드랍 4.5%) 라 합 14 ≈ 311킬 부담.
    // ruin_fragment(7.5%)/slime_chunk(15%) 는 빠른 재료라 그대로.
    ingredients: [
      { kind: "material", materialId: "ruin_fragment", count: 7 },
      { kind: "material", materialId: "spider_silk", count: 4 },
      { kind: "material", materialId: "slime_chunk", count: 5 },
    ],
    result: {
      kind: "equipment",
      itemId: "golem_armor",
      slot: "armor",
    },
    variance: { def: 1 },
  },
  {
    id: "crystal_dagger",
    name: "수정 단검 제작서",
    description: `${ITEMS.crystal_dagger.name}을(를) 만든다. 단단한 수정을 깎아 들개 송곳니로 손잡이를 감싼다.`,
    ingredients: [
      { kind: "material", materialId: "hard_crystal", count: 3 },
      { kind: "material", materialId: "wilddog_fang", count: 4 },
    ],
    result: {
      kind: "equipment",
      itemId: "crystal_dagger",
      slot: "weapon",
    },
    variance: { atk: 1 },
  },
  {
    id: "fairy_blessing",
    name: "요정의 가호 제작서",
    description: `${ITEMS.fairy_blessing.name}을(를) 만든다. ${ITEMS.vitality_ring.name}에 요정가루를 입혀 가호를 깊게 한다.`,
    ingredients: [
      { kind: "equip", itemId: "vitality_ring", count: 1 },
      { kind: "material", materialId: "fairy_dust", count: 5 },
    ],
    result: {
      kind: "equipment",
      itemId: "fairy_blessing",
      slot: "accessory",
    },
    variance: { vit: 1 },
  },
  // 마정석 무기 4종 — 광맥의 수호자 보스 보상 라인. 마정석 ×2 + 단단한 수정 ×8 로 제작.
  // 제작 품질 등급 — 공격력 일반 +6 기준으로 ±2 변동(불량 +4 .. 걸작 +8).
  {
    id: "mana_sword",
    name: "마정석 검 제작서",
    description: `${ITEMS.mana_sword.name}을(를) 만든다. 마정석을 칼날 형태로 깎아 자루에 끼운다.`,
    ingredients: [
      { kind: "material", materialId: "mana_crystal", count: 2 },
      { kind: "material", materialId: "hard_crystal", count: 8 },
    ],
    result: { kind: "equipment", itemId: "mana_sword", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "mana_shield",
    name: "마정석 방패 제작서",
    description: `${ITEMS.mana_shield.name}을(를) 만든다. 마정석을 두텁게 다져 방패의 중심에 박아 넣는다.`,
    ingredients: [
      { kind: "material", materialId: "mana_crystal", count: 2 },
      { kind: "material", materialId: "hard_crystal", count: 8 },
    ],
    result: { kind: "equipment", itemId: "mana_shield", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "mana_spear",
    name: "마정석 창 제작서",
    description: `${ITEMS.mana_spear.name}을(를) 만든다. 마정석을 길고 가늘게 깎아 창대 끝에 박는다.`,
    ingredients: [
      { kind: "material", materialId: "mana_crystal", count: 2 },
      { kind: "material", materialId: "hard_crystal", count: 8 },
    ],
    result: { kind: "equipment", itemId: "mana_spear", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "mana_knuckle",
    name: "마정석 너클 제작서",
    description: `${ITEMS.mana_knuckle.name}을(를) 만든다. 마정석 조각을 손등 너클의 면에 박아 고정한다.`,
    ingredients: [
      { kind: "material", materialId: "mana_crystal", count: 2 },
      { kind: "material", materialId: "hard_crystal", count: 8 },
    ],
    result: { kind: "equipment", itemId: "mana_knuckle", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "mana_bracelet",
    name: "마정석 팔찌 제작서",
    description: `${ITEMS.mana_bracelet.name}을(를) 만든다. 마정석 조각을 엮어 손목에 두를 팔찌로 매만진다.`,
    ingredients: [
      { kind: "material", materialId: "mana_crystal", count: 2 },
      { kind: "material", materialId: "hard_crystal", count: 3 },
    ],
    result: { kind: "equipment", itemId: "mana_bracelet", slot: "accessory" },
    variance: { vit: 1 },
  },
  // 운봉 무기 4종 + 견갑 + 심장 — 운봉의 거인 보스 보상 라인.
  // 무기 4종 공통 재료: 거인 비늘 ×2 + 운봉석 ×3 + 단단한 수정 ×8 (호환재로 동굴 재방문 동기).
  // 제작 품질 등급 — 무기는 공격력 일반 +8 기준으로 ±2 변동(불량 +6 .. 걸작 +10).
  {
    id: "peak_sword",
    name: "운봉 대검 제작서",
    description: `${ITEMS.peak_sword.name}을(를) 만든다. 거인의 뼛조각을 운봉석으로 다져 검의 형태로 단련한다.`,
    ingredients: [
      { kind: "material", materialId: "giant_scale", count: 2 },
      { kind: "material", materialId: "unbong_ore", count: 3 },
      { kind: "material", materialId: "hard_crystal", count: 8 },
    ],
    result: { kind: "equipment", itemId: "peak_sword", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "peak_shield",
    name: "운봉 방벽 제작서",
    description: `${ITEMS.peak_shield.name}을(를) 만든다. 거인의 비늘을 운봉석으로 결합해 방패의 면을 잡는다.`,
    ingredients: [
      { kind: "material", materialId: "giant_scale", count: 2 },
      { kind: "material", materialId: "unbong_ore", count: 3 },
      { kind: "material", materialId: "hard_crystal", count: 8 },
    ],
    result: { kind: "equipment", itemId: "peak_shield", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "peak_spear",
    name: "운봉 장창 제작서",
    description: `${ITEMS.peak_spear.name}을(를) 만든다. 운봉석 끝을 길고 가늘게 깎아 창대 끝에 박는다.`,
    ingredients: [
      { kind: "material", materialId: "giant_scale", count: 2 },
      { kind: "material", materialId: "unbong_ore", count: 3 },
      { kind: "material", materialId: "hard_crystal", count: 8 },
    ],
    result: { kind: "equipment", itemId: "peak_spear", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "peak_claw",
    name: "운봉 발톱 제작서",
    description: `${ITEMS.peak_claw.name}을(를) 만든다. 거인의 손가락뼈를 깎아 운봉석을 박은 발톱으로 매만진다.`,
    ingredients: [
      { kind: "material", materialId: "giant_scale", count: 2 },
      { kind: "material", materialId: "unbong_ore", count: 3 },
      { kind: "material", materialId: "hard_crystal", count: 8 },
    ],
    result: { kind: "equipment", itemId: "peak_claw", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "peak_mantle",
    name: "운봉 견갑 제작서",
    description: `${ITEMS.peak_mantle.name}을(를) 만든다. 거인의 어깨 비늘을 운봉석으로 묶어 견갑으로 매만진다.`,
    ingredients: [
      { kind: "material", materialId: "giant_scale", count: 3 },
      { kind: "material", materialId: "unbong_ore", count: 2 },
      { kind: "material", materialId: "hard_crystal", count: 3 },
    ],
    result: { kind: "equipment", itemId: "peak_mantle", slot: "accessory" },
    variance: { dex: 1 },
  },
  {
    id: "peak_heart",
    name: "운봉의 심장 제작서",
    description: `${ITEMS.peak_heart.name}을(를) 만든다. 거인의 심장을 운봉석으로 봉인해 손에 쥘 수 있는 형태로 다진다.`,
    ingredients: [
      { kind: "material", materialId: "giant_scale", count: 2 },
      { kind: "material", materialId: "unbong_ore", count: 2 },
      { kind: "material", materialId: "hard_crystal", count: 3 },
    ],
    result: { kind: "equipment", itemId: "peak_heart", slot: "accessory" },
    variance: { str: 1 },
  },
  // 다리 구간 장비 — 운저 평원 / 잿빛 협로. 운봉 라인과 화염 라인 사이를 메운다.
  {
    id: "bison_hide_armor",
    name: "들소 가죽 갑옷 제작서",
    description: `${ITEMS.bison_hide_armor.name}을(를) 만든다. 들소 가죽을 단단한 가죽으로 안을 받쳐 여러 겹 다진다.`,
    ingredients: [
      { kind: "material", materialId: "bison_hide", count: 12 },
      { kind: "material", materialId: "tough_hide", count: 5 },
    ],
    result: { kind: "equipment", itemId: "bison_hide_armor", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "ashforged_blade",
    name: "재무쇠 검 제작서",
    description: `${ITEMS.ashforged_blade.name}을(를) 만든다. 잿돌을 녹여 단단한 수정과 함께 벼려 칼날을 잡는다.`,
    ingredients: [
      { kind: "material", materialId: "ash_stone", count: 8 },
      { kind: "material", materialId: "hard_crystal", count: 6 },
    ],
    result: { kind: "equipment", itemId: "ashforged_blade", slot: "weapon" },
    variance: { atk: 1 },
  },
  // 봉황 무구 6종 — 화산의 심장 보스 보상 라인. 봉황령에서 모은 봉황 깃털 + 보스 드랍 재료로 벼린다.
  // 무기 공통 재료: 용암 핵 ×2 + 봉황 깃털 ×5 + 화염 비늘 ×3.
  // 제작 품질 등급 — 무기 공격력 일반 +10 기준으로 ±2 변동(불량 +8 .. 걸작 +12).
  {
    id: "volcano_sword",
    name: "봉황도 제작서",
    description: `${ITEMS.volcano_sword.name}을(를) 만든다. 용암 핵을 칼날 형태로 녹여 붓고, 봉황 깃털로 자루를 감싼다.`,
    ingredients: [
      { kind: "material", materialId: "lava_core", count: 2 },
      { kind: "material", materialId: "phoenix_feather", count: 5 },
      { kind: "material", materialId: "flame_scale", count: 3 },
    ],
    result: { kind: "equipment", itemId: "volcano_sword", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "volcano_shield",
    name: "봉황패 제작서",
    description: `${ITEMS.volcano_shield.name}을(를) 만든다. 화염 비늘을 방패 면에 겹겹이 녹여 붙이고 용암 핵으로 단련한다.`,
    ingredients: [
      { kind: "material", materialId: "lava_core", count: 2 },
      { kind: "material", materialId: "phoenix_feather", count: 5 },
      { kind: "material", materialId: "flame_scale", count: 3 },
    ],
    result: { kind: "equipment", itemId: "volcano_shield", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "volcano_spear",
    name: "봉황극 제작서",
    description: `${ITEMS.volcano_spear.name}을(를) 만든다. 용암 핵을 창끝으로 빚고, 봉황 깃털로 균형추를 달아 가볍게 한다.`,
    ingredients: [
      { kind: "material", materialId: "lava_core", count: 2 },
      { kind: "material", materialId: "phoenix_feather", count: 5 },
      { kind: "material", materialId: "flame_scale", count: 3 },
    ],
    result: { kind: "equipment", itemId: "volcano_spear", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "volcano_claw",
    name: "봉황조 제작서",
    description: `${ITEMS.volcano_claw.name}을(를) 만든다. 화산의 심장 파편을 발톱 형태로 깎아, 봉황 깃털로 손목에 고정한다.`,
    ingredients: [
      { kind: "material", materialId: "lava_core", count: 2 },
      { kind: "material", materialId: "phoenix_feather", count: 5 },
      { kind: "material", materialId: "flame_scale", count: 3 },
    ],
    result: { kind: "equipment", itemId: "volcano_claw", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "volcano_armor",
    name: "봉황갑 제작서",
    description: `${ITEMS.volcano_armor.name}을(를) 만든다. 화염 비늘을 판금처럼 두드려 용암 핵으로 이음새를 단단히 메운다.`,
    ingredients: [
      { kind: "material", materialId: "lava_core", count: 3 },
      { kind: "material", materialId: "flame_scale", count: 8 },
      { kind: "material", materialId: "phoenix_feather", count: 3 },
    ],
    result: { kind: "equipment", itemId: "volcano_armor", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "volcano_core",
    name: "봉황주 제작서",
    description: `${ITEMS.volcano_core.name}을(를) 만든다. 화산의 심장 내부 순수 결정을 봉황 깃털로 감싸 지닐 수 있는 형태로 봉인한다.`,
    ingredients: [
      { kind: "material", materialId: "lava_core", count: 2 },
      { kind: "material", materialId: "phoenix_feather", count: 5 },
      { kind: "material", materialId: "flame_scale", count: 3 },
    ],
    result: { kind: "equipment", itemId: "volcano_core", slot: "accessory" },
    variance: { dex: 1 },
  },

  // ── 별의 첨탑 무구 5종 — 별을 지키는 자 처치 보상 제작서.
  // 봉황·화산 무기 한 자루를 그대로 잡아넣어 별먼지·천공 합금으로 다시 벼린다 (업그레이드 라인).
  {
    id: "star_blade",
    name: "별검 제작서",
    description: `${ITEMS.star_blade.name}을(를) 만든다. ${ITEMS.volcano_sword.name}을 천공 합금에 다시 담갔다 별먼지로 두드려 결을 새긴다.`,
    ingredients: [
      { kind: "equip", itemId: "volcano_sword", count: 1 },
      { kind: "material", materialId: "sky_alloy", count: 2 },
      { kind: "material", materialId: "stardust", count: 5 },
    ],
    result: { kind: "equipment", itemId: "star_blade", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "star_aegis",
    name: "별의 방패 제작서",
    description: `${ITEMS.star_aegis.name}을(를) 만든다. ${ITEMS.volcano_shield.name}의 골격을 천공 합금으로 보강하고 별먼지로 무늬를 새긴다.`,
    ingredients: [
      { kind: "equip", itemId: "volcano_shield", count: 1 },
      { kind: "material", materialId: "sky_alloy", count: 2 },
      { kind: "material", materialId: "stardust", count: 5 },
    ],
    result: { kind: "equipment", itemId: "star_aegis", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "star_lance",
    name: "별창 제작서",
    description: `${ITEMS.star_lance.name}을(를) 만든다. ${ITEMS.volcano_spear.name} 끝에 천공 합금 창끝을 잇고 별먼지로 균형을 잡는다.`,
    ingredients: [
      { kind: "equip", itemId: "volcano_spear", count: 1 },
      { kind: "material", materialId: "sky_alloy", count: 2 },
      { kind: "material", materialId: "stardust", count: 5 },
    ],
    result: { kind: "equipment", itemId: "star_lance", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "star_grip",
    name: "별의 너클 제작서",
    description: `${ITEMS.star_grip.name}을(를) 만든다. ${ITEMS.volcano_claw.name}을 풀어 천공 합금으로 손등 형태로 깎고 별먼지로 표면을 매만진다.`,
    ingredients: [
      { kind: "equip", itemId: "volcano_claw", count: 1 },
      { kind: "material", materialId: "sky_alloy", count: 2 },
      { kind: "material", materialId: "stardust", count: 5 },
    ],
    result: { kind: "equipment", itemId: "star_grip", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "star_mantle",
    name: "별의 망토 제작서",
    description: `${ITEMS.star_mantle.name}을(를) 만든다. ${ITEMS.volcano_core.name}을 별먼지에 풀어 천공 합금 실로 짜낸다.`,
    ingredients: [
      { kind: "equip", itemId: "volcano_core", count: 1 },
      { kind: "material", materialId: "sky_alloy", count: 1 },
      { kind: "material", materialId: "stardust", count: 4 },
    ],
    result: { kind: "equipment", itemId: "star_mantle", slot: "accessory" },
    variance: { dex: 1 },
  },

  // ── 별빛 회랑 무구 5종 (Lv75) — star → corridor → aether 라인 중간 단계.
  // 별 무구 한 자루 + 회랑 결정(중간 사냥터 전용 mat) + sky_alloy + stellar_essence + stardust 결합.
  {
    id: "corridor_blade",
    name: "회랑검 제작서",
    description: `${ITEMS.corridor_blade.name}을(를) 만든다. ${ITEMS.star_blade.name}을 회랑 결정에 담갔다 천공 합금으로 두드려 결을 새긴다.`,
    ingredients: [
      { kind: "equip", itemId: "star_blade", count: 1 },
      { kind: "material", materialId: "corridor_relic", count: 3 },
      { kind: "material", materialId: "sky_alloy", count: 1 },
      { kind: "material", materialId: "stellar_essence", count: 2 },
      { kind: "material", materialId: "stardust", count: 3 },
    ],
    result: { kind: "equipment", itemId: "corridor_blade", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "corridor_aegis",
    name: "회랑 방패 제작서",
    description: `${ITEMS.corridor_aegis.name}을(를) 만든다. ${ITEMS.star_aegis.name}의 골격을 회랑 결정으로 보강하고 천공 합금 결을 한 겹 더 두른다.`,
    ingredients: [
      { kind: "equip", itemId: "star_aegis", count: 1 },
      { kind: "material", materialId: "corridor_relic", count: 3 },
      { kind: "material", materialId: "sky_alloy", count: 1 },
      { kind: "material", materialId: "stellar_essence", count: 2 },
      { kind: "material", materialId: "stardust", count: 3 },
    ],
    result: { kind: "equipment", itemId: "corridor_aegis", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "corridor_lance",
    name: "회랑창 제작서",
    description: `${ITEMS.corridor_lance.name}을(를) 만든다. ${ITEMS.star_lance.name} 끝에 회랑 결정을 박고 천공 합금으로 결을 잡는다.`,
    ingredients: [
      { kind: "equip", itemId: "star_lance", count: 1 },
      { kind: "material", materialId: "corridor_relic", count: 3 },
      { kind: "material", materialId: "sky_alloy", count: 1 },
      { kind: "material", materialId: "stellar_essence", count: 2 },
      { kind: "material", materialId: "stardust", count: 3 },
    ],
    result: { kind: "equipment", itemId: "corridor_lance", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "corridor_grip",
    name: "회랑 너클 제작서",
    description: `${ITEMS.corridor_grip.name}을(를) 만든다. ${ITEMS.star_grip.name}을 풀어 회랑 결정으로 다시 새기고 천공 합금으로 손등을 보강한다.`,
    ingredients: [
      { kind: "equip", itemId: "star_grip", count: 1 },
      { kind: "material", materialId: "corridor_relic", count: 3 },
      { kind: "material", materialId: "sky_alloy", count: 1 },
      { kind: "material", materialId: "stellar_essence", count: 2 },
      { kind: "material", materialId: "stardust", count: 3 },
    ],
    result: { kind: "equipment", itemId: "corridor_grip", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "corridor_mantle",
    name: "회랑 망토 제작서",
    description: `${ITEMS.corridor_mantle.name}을(를) 만든다. ${ITEMS.star_mantle.name}에 회랑 결정 실을 한 결 더 짜내고 천공 합금으로 가장자리를 묶는다.`,
    ingredients: [
      { kind: "equip", itemId: "star_mantle", count: 1 },
      { kind: "material", materialId: "corridor_relic", count: 2 },
      { kind: "material", materialId: "sky_alloy", count: 1 },
      { kind: "material", materialId: "stellar_essence", count: 2 },
      { kind: "material", materialId: "stardust", count: 2 },
    ],
    result: { kind: "equipment", itemId: "corridor_mantle", slot: "accessory" },
    variance: { dex: 1 },
  },

  // ── 선인의 폐도 무구 5종 — 천공인의 왕 처치 보상 제작서.
  // 회랑 무구를 그대로 잡아넣어 에테르 합금·별의 정수로 다시 단조하는 업그레이드 라인.
  {
    id: "aether_blade",
    name: "에테르검 제작서",
    description: `${ITEMS.aether_blade.name}을(를) 만든다. ${ITEMS.corridor_blade.name}을 에테르 합금에 다시 담갔다 별의 정수로 두드려 결을 새긴다.`,
    ingredients: [
      { kind: "equip", itemId: "corridor_blade", count: 1 },
      { kind: "material", materialId: "aether_alloy", count: 2 },
      { kind: "material", materialId: "stellar_essence", count: 6 },
    ],
    result: { kind: "equipment", itemId: "aether_blade", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "aether_aegis",
    name: "에테르 방패 제작서",
    description: `${ITEMS.aether_aegis.name}을(를) 만든다. ${ITEMS.corridor_aegis.name}의 골격을 에테르 합금으로 보강하고 별의 정수로 결을 잡는다.`,
    ingredients: [
      { kind: "equip", itemId: "corridor_aegis", count: 1 },
      { kind: "material", materialId: "aether_alloy", count: 2 },
      { kind: "material", materialId: "stellar_essence", count: 6 },
    ],
    result: { kind: "equipment", itemId: "aether_aegis", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "aether_lance",
    name: "에테르창 제작서",
    description: `${ITEMS.aether_lance.name}을(를) 만든다. ${ITEMS.corridor_lance.name} 끝에 에테르 합금 창끝을 잇고 별의 정수로 균형을 잡는다.`,
    ingredients: [
      { kind: "equip", itemId: "corridor_lance", count: 1 },
      { kind: "material", materialId: "aether_alloy", count: 2 },
      { kind: "material", materialId: "stellar_essence", count: 6 },
    ],
    result: { kind: "equipment", itemId: "aether_lance", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "aether_grip",
    name: "에테르 너클 제작서",
    description: `${ITEMS.aether_grip.name}을(를) 만든다. ${ITEMS.corridor_grip.name}을 풀어 에테르 합금으로 손등 형태로 깎고 별의 정수로 표면을 매만진다.`,
    ingredients: [
      { kind: "equip", itemId: "corridor_grip", count: 1 },
      { kind: "material", materialId: "aether_alloy", count: 2 },
      { kind: "material", materialId: "stellar_essence", count: 6 },
    ],
    result: { kind: "equipment", itemId: "aether_grip", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "aether_mantle",
    name: "에테르 망토 제작서",
    description: `${ITEMS.aether_mantle.name}을(를) 만든다. ${ITEMS.corridor_mantle.name}을 별의 정수에 풀어 에테르 합금 실로 다시 짜낸다.`,
    ingredients: [
      { kind: "equip", itemId: "corridor_mantle", count: 1 },
      { kind: "material", materialId: "aether_alloy", count: 1 },
      { kind: "material", materialId: "stellar_essence", count: 5 },
    ],
    result: { kind: "equipment", itemId: "aether_mantle", slot: "accessory" },
    variance: { dex: 1 },
  },

  // ── 옥좌의 길 무구 5종 (Lv85) — aether → road → empyrean 라인 중간 단계.
  // 에테르 무구 한 자루 + 옥좌 조각(중간 사냥터 전용 mat) + aether_alloy + empyrean_shard + stellar_essence 결합.
  {
    id: "road_blade",
    name: "황성검 제작서",
    description: `${ITEMS.road_blade.name}을(를) 만든다. ${ITEMS.aether_blade.name}을 옥좌 조각으로 한 겹 더 입히고 창공 조각으로 칼날을 단조한다.`,
    ingredients: [
      { kind: "equip", itemId: "aether_blade", count: 1 },
      { kind: "material", materialId: "road_relic", count: 3 },
      { kind: "material", materialId: "aether_alloy", count: 1 },
      { kind: "material", materialId: "empyrean_shard", count: 2 },
      { kind: "material", materialId: "stellar_essence", count: 3 },
    ],
    result: { kind: "equipment", itemId: "road_blade", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "road_aegis",
    name: "황성 방패 제작서",
    description: `${ITEMS.road_aegis.name}을(를) 만든다. ${ITEMS.aether_aegis.name}의 골격을 옥좌 조각으로 보강하고 창공 조각으로 면을 깎는다.`,
    ingredients: [
      { kind: "equip", itemId: "aether_aegis", count: 1 },
      { kind: "material", materialId: "road_relic", count: 3 },
      { kind: "material", materialId: "aether_alloy", count: 1 },
      { kind: "material", materialId: "empyrean_shard", count: 2 },
      { kind: "material", materialId: "stellar_essence", count: 3 },
    ],
    result: { kind: "equipment", itemId: "road_aegis", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "road_lance",
    name: "황성창 제작서",
    description: `${ITEMS.road_lance.name}을(를) 만든다. ${ITEMS.aether_lance.name} 끝에 옥좌 조각을 더하고 창공 조각 창끝을 잇는다.`,
    ingredients: [
      { kind: "equip", itemId: "aether_lance", count: 1 },
      { kind: "material", materialId: "road_relic", count: 3 },
      { kind: "material", materialId: "aether_alloy", count: 1 },
      { kind: "material", materialId: "empyrean_shard", count: 2 },
      { kind: "material", materialId: "stellar_essence", count: 3 },
    ],
    result: { kind: "equipment", itemId: "road_lance", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "road_grip",
    name: "황성 너클 제작서",
    description: `${ITEMS.road_grip.name}을(를) 만든다. ${ITEMS.aether_grip.name}을 풀어 옥좌 조각으로 손등을 다시 새기고 창공 조각으로 표면을 매만진다.`,
    ingredients: [
      { kind: "equip", itemId: "aether_grip", count: 1 },
      { kind: "material", materialId: "road_relic", count: 3 },
      { kind: "material", materialId: "aether_alloy", count: 1 },
      { kind: "material", materialId: "empyrean_shard", count: 2 },
      { kind: "material", materialId: "stellar_essence", count: 3 },
    ],
    result: { kind: "equipment", itemId: "road_grip", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "road_mantle",
    name: "황성 망토 제작서",
    description: `${ITEMS.road_mantle.name}을(를) 만든다. ${ITEMS.aether_mantle.name}에 옥좌 조각을 한 줄 더 짜내고 창공 조각으로 가장자리를 묶는다.`,
    ingredients: [
      { kind: "equip", itemId: "aether_mantle", count: 1 },
      { kind: "material", materialId: "road_relic", count: 2 },
      { kind: "material", materialId: "aether_alloy", count: 1 },
      { kind: "material", materialId: "empyrean_shard", count: 2 },
      { kind: "material", materialId: "stellar_essence", count: 2 },
    ],
    result: { kind: "equipment", itemId: "road_mantle", slot: "accessory" },
    variance: { dex: 1 },
  },

  // ── 창공의 옥좌 무구 5종 — 창공의 주재 처치 보상 (만렙 정점 라인).
  // 황성 무구를 그대로 잡아넣어 창공 조각·태초의 정수로 다시 단조하는 업그레이드 라인.
  {
    id: "empyrean_blade",
    name: "창공검 제작서",
    description: `${ITEMS.empyrean_blade.name}을(를) 만든다. ${ITEMS.road_blade.name}을 창공 조각에 다시 담갔다 태초의 정수로 두드려 결을 새긴다.`,
    ingredients: [
      { kind: "equip", itemId: "road_blade", count: 1 },
      { kind: "material", materialId: "primordial_essence", count: 3 },
      { kind: "material", materialId: "empyrean_shard", count: 7 },
    ],
    result: { kind: "equipment", itemId: "empyrean_blade", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "empyrean_aegis",
    name: "창공 방패 제작서",
    description: `${ITEMS.empyrean_aegis.name}을(를) 만든다. ${ITEMS.road_aegis.name}의 골격을 창공 조각으로 보강하고 태초의 정수로 결을 잡는다.`,
    ingredients: [
      { kind: "equip", itemId: "road_aegis", count: 1 },
      { kind: "material", materialId: "primordial_essence", count: 3 },
      { kind: "material", materialId: "empyrean_shard", count: 7 },
    ],
    result: { kind: "equipment", itemId: "empyrean_aegis", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "empyrean_lance",
    name: "창공창 제작서",
    description: `${ITEMS.empyrean_lance.name}을(를) 만든다. ${ITEMS.road_lance.name} 끝에 창공 조각 창끝을 잇고 태초의 정수로 균형을 잡는다.`,
    ingredients: [
      { kind: "equip", itemId: "road_lance", count: 1 },
      { kind: "material", materialId: "primordial_essence", count: 3 },
      { kind: "material", materialId: "empyrean_shard", count: 7 },
    ],
    result: { kind: "equipment", itemId: "empyrean_lance", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "empyrean_grip",
    name: "창공 너클 제작서",
    description: `${ITEMS.empyrean_grip.name}을(를) 만든다. ${ITEMS.road_grip.name}을 풀어 창공 조각으로 손등 형태로 깎고 태초의 정수로 표면을 매만진다.`,
    ingredients: [
      { kind: "equip", itemId: "road_grip", count: 1 },
      { kind: "material", materialId: "primordial_essence", count: 3 },
      { kind: "material", materialId: "empyrean_shard", count: 7 },
    ],
    result: { kind: "equipment", itemId: "empyrean_grip", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "empyrean_mantle",
    name: "창공 망토 제작서",
    description: `${ITEMS.empyrean_mantle.name}을(를) 만든다. ${ITEMS.road_mantle.name}을 태초의 정수에 풀어 창공 조각 실로 다시 짜낸다.`,
    ingredients: [
      { kind: "equip", itemId: "road_mantle", count: 1 },
      { kind: "material", materialId: "primordial_essence", count: 2 },
      { kind: "material", materialId: "empyrean_shard", count: 6 },
    ],
    result: { kind: "equipment", itemId: "empyrean_mantle", slot: "accessory" },
    variance: { dex: 1 },
  },

  // ── 5막 별빛 무구 30종 — 4 별빛 사냥터 일반 몹 제작서 드랍 → 별빛 조각으로 제작.
  // 무기 25 = 5무기 × 5부스탯 / 방어구 5 = 메인스탯별 1자루. 재료는 별빛 조각 80 통일.
  // tradable:true — 완제품·레시피 거래 가능 (강화/부여 인스턴스는 별개 정책).
  // 부스탯이 메인과 일치하는 변형(예: 힘의 별빛 대검) 은 같은 스탯에 자연 합산.

  // 대검 5종 (메인 = 힘)
  {
    id: "starlit_greatsword_str",
    name: "힘의 별빛 대검 제작서",
    description: `${ITEMS.starlit_greatsword_str.name}을(를) 만든다. 별빛 조각을 결대로 모아 한 자루로 두껍게 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_greatsword_str", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_greatsword_dex",
    name: "민첩의 별빛 대검 제작서",
    description: `${ITEMS.starlit_greatsword_dex.name}을(를) 만든다. 별빛 조각을 가늘게 흘려 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_greatsword_dex", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_greatsword_vit",
    name: "활력의 별빛 대검 제작서",
    description: `${ITEMS.starlit_greatsword_vit.name}을(를) 만든다. 별빛 조각을 안쪽에 두텁게 가라앉혀 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_greatsword_vit", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_greatsword_spd",
    name: "속도의 별빛 대검 제작서",
    description: `${ITEMS.starlit_greatsword_spd.name}을(를) 만든다. 별빛 조각을 결대로 얇게 펴 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_greatsword_spd", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_greatsword_luk",
    name: "행운의 별빛 대검 제작서",
    description: `${ITEMS.starlit_greatsword_luk.name}을(를) 만든다. 별빛 한 점을 칼날 끝에 옅게 띄워 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_greatsword_luk", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },

  // 창 5종 (메인 = 민첩)
  {
    id: "starlit_lance_str",
    name: "힘의 별빛 창 제작서",
    description: `${ITEMS.starlit_lance_str.name}을(를) 만든다. 별빛 조각을 묵직하게 박아 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_lance_str", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_lance_dex",
    name: "민첩의 별빛 창 제작서",
    description: `${ITEMS.starlit_lance_dex.name}을(를) 만든다. 별빛 조각을 가장 가지런히 흘려 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_lance_dex", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_lance_vit",
    name: "활력의 별빛 창 제작서",
    description: `${ITEMS.starlit_lance_vit.name}을(를) 만든다. 별빛 조각을 자루 안쪽에 두텁게 가라앉혀 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_lance_vit", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_lance_spd",
    name: "속도의 별빛 창 제작서",
    description: `${ITEMS.starlit_lance_spd.name}을(를) 만든다. 별빛 조각을 가장 얇게 펴 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_lance_spd", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_lance_luk",
    name: "행운의 별빛 창 제작서",
    description: `${ITEMS.starlit_lance_luk.name}을(를) 만든다. 별빛 한 점을 창끝에 옅게 띄워 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_lance_luk", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },

  // 방패 5종 (메인 = 활력)
  {
    id: "starlit_shield_str",
    name: "힘의 별빛 방패 제작서",
    description: `${ITEMS.starlit_shield_str.name}을(를) 만든다. 별빛 조각을 가장 두텁게 박아 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_shield_str", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_shield_dex",
    name: "민첩의 별빛 방패 제작서",
    description: `${ITEMS.starlit_shield_dex.name}을(를) 만든다. 별빛 조각을 가지런히 흘려 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_shield_dex", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_shield_vit",
    name: "활력의 별빛 방패 제작서",
    description: `${ITEMS.starlit_shield_vit.name}을(를) 만든다. 별빛 조각을 안쪽까지 가장 깊이 가라앉혀 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_shield_vit", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_shield_spd",
    name: "속도의 별빛 방패 제작서",
    description: `${ITEMS.starlit_shield_spd.name}을(를) 만든다. 별빛 조각을 얇게 펴 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_shield_spd", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_shield_luk",
    name: "행운의 별빛 방패 제작서",
    description: `${ITEMS.starlit_shield_luk.name}을(를) 만든다. 별빛 한 점을 방패 한가운데 옅게 띄워 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_shield_luk", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },

  // 쌍검 5종 (메인 = 속도)
  {
    id: "starlit_twinblades_str",
    name: "힘의 별빛 쌍검 제작서",
    description: `${ITEMS.starlit_twinblades_str.name}을(를) 만든다. 별빛 조각을 두껍게 두른 두 자루로 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_twinblades_str", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_twinblades_dex",
    name: "민첩의 별빛 쌍검 제작서",
    description: `${ITEMS.starlit_twinblades_dex.name}을(를) 만든다. 별빛 조각을 가지런히 흘려 두 자루로 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_twinblades_dex", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_twinblades_vit",
    name: "활력의 별빛 쌍검 제작서",
    description: `${ITEMS.starlit_twinblades_vit.name}을(를) 만든다. 별빛 조각을 두 자루 안쪽에 두텁게 가라앉혀 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_twinblades_vit", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_twinblades_spd",
    name: "속도의 별빛 쌍검 제작서",
    description: `${ITEMS.starlit_twinblades_spd.name}을(를) 만든다. 별빛 조각을 가장 얇게 펴 두 자루로 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_twinblades_spd", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_twinblades_luk",
    name: "행운의 별빛 쌍검 제작서",
    description: `${ITEMS.starlit_twinblades_luk.name}을(를) 만든다. 별빛 한 점을 두 자루 끝에 옅게 띄워 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_twinblades_luk", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },

  // 단검 5종 (메인 = 행운)
  {
    id: "starlit_dagger_str",
    name: "힘의 별빛 단검 제작서",
    description: `${ITEMS.starlit_dagger_str.name}을(를) 만든다. 별빛 조각을 두껍게 두른 짧고 가는 자루로 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_dagger_str", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_dagger_dex",
    name: "민첩의 별빛 단검 제작서",
    description: `${ITEMS.starlit_dagger_dex.name}을(를) 만든다. 별빛 조각을 가지런히 흘려 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_dagger_dex", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_dagger_vit",
    name: "활력의 별빛 단검 제작서",
    description: `${ITEMS.starlit_dagger_vit.name}을(를) 만든다. 별빛 조각을 자루 안쪽에 두텁게 가라앉혀 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_dagger_vit", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_dagger_spd",
    name: "속도의 별빛 단검 제작서",
    description: `${ITEMS.starlit_dagger_spd.name}을(를) 만든다. 별빛 조각을 가장 얇게 펴 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_dagger_spd", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },
  {
    id: "starlit_dagger_luk",
    name: "행운의 별빛 단검 제작서",
    description: `${ITEMS.starlit_dagger_luk.name}을(를) 만든다. 별빛 한 점을 칼끝에 가장 가지런히 띄워 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_dagger_luk", slot: "weapon" },
    variance: { atk: 1 },
    tradable: true,
  },

  // 별빛 갑옷 5종 (메인스탯별)
  {
    id: "starlit_armor_str",
    name: "힘의 별빛 갑옷 제작서",
    description: `${ITEMS.starlit_armor_str.name}을(를) 만든다. 별빛 조각을 가장 두껍게 두른 갑주로 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_armor_str", slot: "armor" },
    variance: { def: 1 },
    tradable: true,
  },
  {
    id: "starlit_armor_dex",
    name: "민첩의 별빛 갑옷 제작서",
    description: `${ITEMS.starlit_armor_dex.name}을(를) 만든다. 별빛 조각을 가지런히 흘려 가벼운 갑주로 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_armor_dex", slot: "armor" },
    variance: { def: 1 },
    tradable: true,
  },
  {
    id: "starlit_armor_vit",
    name: "활력의 별빛 갑옷 제작서",
    description: `${ITEMS.starlit_armor_vit.name}을(를) 만든다. 별빛 조각을 안쪽까지 가장 깊이 가라앉혀 두꺼운 갑주로 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_armor_vit", slot: "armor" },
    variance: { def: 1 },
    tradable: true,
  },
  {
    id: "starlit_armor_spd",
    name: "속도의 별빛 갑옷 제작서",
    description: `${ITEMS.starlit_armor_spd.name}을(를) 만든다. 별빛 조각을 가장 얇게 펴 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_armor_spd", slot: "armor" },
    variance: { def: 1 },
    tradable: true,
  },
  {
    id: "starlit_armor_luk",
    name: "행운의 별빛 갑옷 제작서",
    description: `${ITEMS.starlit_armor_luk.name}을(를) 만든다. 별빛 한 점을 가슴 위에 옅게 띄워 단조한다.`,
    ingredients: [{ kind: "material", materialId: "starfall_shard", count: 80 }],
    result: { kind: "equipment", itemId: "starlit_armor_luk", slot: "armor" },
    variance: { def: 1 },
    tradable: true,
  },

  // ── 중간 단계 제작 라인 — 그동안 퀘스트/판매 외엔 안 쓰이던 재료에 제작 destination 부여 ──
  {
    id: "soul_blade",
    name: "혼백검 제작서",
    description: `${ITEMS.soul_blade.name}을(를) 만든다. 영혼 결정을 칼날 안에 가두고 폐허 잔해로 자루를 다진다.`,
    ingredients: [
      { kind: "material", materialId: "soul_crystal", count: 2 },
      { kind: "material", materialId: "ruin_fragment", count: 3 },
      { kind: "material", materialId: "hard_crystal", count: 3 },
    ],
    result: { kind: "equipment", itemId: "soul_blade", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "sancho_vest",
    name: "산초 누비 조끼 제작법",
    description: `${ITEMS.sancho_vest.name}을(를) 만든다. 말린 산초꽃을 천 사이에 누벼 넣고 단단한 가죽으로 테를 두른다.`,
    ingredients: [
      { kind: "material", materialId: "sancho_blossom", count: 4 },
      { kind: "material", materialId: "tough_hide", count: 3 },
      { kind: "material", materialId: "slime_chunk", count: 8 },
    ],
    result: { kind: "equipment", itemId: "sancho_vest", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "windmana_charm",
    name: "바람 마석 부적 세공법",
    description: `${ITEMS.windmana_charm.name}을(를) 만든다. 바람 마석을 가는 끈에 꿰고 요정가루로 봉한다.`,
    ingredients: [
      { kind: "material", materialId: "wind_mana_stone", count: 3 },
      { kind: "material", materialId: "fairy_dust", count: 3 },
      { kind: "material", materialId: "spider_silk", count: 4 },
    ],
    result: { kind: "equipment", itemId: "windmana_charm", slot: "accessory" },
    variance: { spd: 1 },
  },
  {
    id: "wolfking_fang_dagger",
    name: "늑대왕 송곳니 단검 제작서",
    description: `${ITEMS.wolfking_fang_dagger.name}을(를) 만든다. 무리장의 송곳니를 자루에 박고 들개 송곳니로 날을 세운다.`,
    ingredients: [
      { kind: "material", materialId: "wolf_king_fang", count: 1 },
      { kind: "material", materialId: "wilddog_fang", count: 6 },
      { kind: "material", materialId: "tough_hide", count: 4 },
    ],
    result: { kind: "equipment", itemId: "wolfking_fang_dagger", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "hawkfeather_cloak",
    name: "매깃 망토 직조법",
    description: `${ITEMS.hawkfeather_cloak.name}을(를) 만든다. 초원 매 깃털을 들소 가죽 테에 한 장씩 이어 짠다.`,
    ingredients: [
      { kind: "material", materialId: "hawk_feather", count: 5 },
      { kind: "material", materialId: "bison_hide", count: 3 },
      { kind: "material", materialId: "spider_silk", count: 6 },
    ],
    result: { kind: "equipment", itemId: "hawkfeather_cloak", slot: "armor" },
    variance: { spd: 1 },
  },

  // ── 기존 장비 → 한 단계 위 장비 업그레이드 라인 (베이스를 'equip' 재료로 소비) ──
  // 베이스 1개 + 같은 구간 재료를 들여 같은 한 자루를 끌어올린다. nailed_baseball_bat / fairy_blessing 와 같은 방식.
  // 명품(unique) 업그레이드는 결과도 unique·비거래 — "손에 맞춰진 보물".
  {
    id: "reinforced_leather_armor",
    name: "덧댄 가죽갑옷 제작법",
    description: `${ITEMS.reinforced_leather_armor.name}을(를) 만든다. ${ITEMS.old_leather_armor.name}에 들개 가죽을 덧대 두텁게 누빈다.`,
    ingredients: [
      { kind: "equip", itemId: "old_leather_armor", count: 1 },
      { kind: "material", materialId: "wilddog_hide", count: 5 },
    ],
    result: { kind: "equipment", itemId: "reinforced_leather_armor", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "bandit_chief_dagger",
    name: "두목의 단검 제작서",
    description: `${ITEMS.bandit_chief_dagger.name}을(를) 만든다. ${ITEMS.bandit_dagger.name}에 단단한 수정을 박아 날을 다시 세운다.`,
    ingredients: [
      { kind: "equip", itemId: "bandit_dagger", count: 1 },
      { kind: "material", materialId: "hard_crystal", count: 4 },
    ],
    result: { kind: "equipment", itemId: "bandit_chief_dagger", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "nymph_blessing",
    name: "호수 님프의 가호 제작서",
    description: `${ITEMS.nymph_blessing.name}을(를) 만든다. ${ITEMS.nymph_ring.name}에 요정가루를 입혀 가호를 깊게 한다.`,
    ingredients: [
      { kind: "equip", itemId: "nymph_ring", count: 1 },
      { kind: "material", materialId: "fairy_dust", count: 5 },
    ],
    result: { kind: "equipment", itemId: "nymph_blessing", slot: "accessory" },
    variance: { spd: 1 },
  },
  {
    id: "reforged_golem_hammer",
    name: "재단조한 골렘 망치 제작서",
    description: `${ITEMS.reforged_golem_hammer.name}을(를) 만든다. ${ITEMS.golem_hammer.name}을(를) 마정석으로 다시 벼리고 폐허 잔해로 자루를 보강한다.`,
    ingredients: [
      { kind: "equip", itemId: "golem_hammer", count: 1 },
      { kind: "material", materialId: "mana_crystal", count: 8 },
      { kind: "material", materialId: "ruin_fragment", count: 8 },
    ],
    result: { kind: "equipment", itemId: "reforged_golem_hammer", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "wraithking_cloak",
    name: "망령왕의 망토 제작서",
    description: `${ITEMS.wraithking_cloak.name}을(를) 만든다. ${ITEMS.wraith_cloak.name}에 영혼 결정을 엮어 넣어 한기를 깊게 한다.`,
    ingredients: [
      { kind: "equip", itemId: "wraith_cloak", count: 1 },
      { kind: "material", materialId: "soul_crystal", count: 10 },
    ],
    result: { kind: "equipment", itemId: "wraithking_cloak", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "lava_core_greatmaul",
    name: "용암핵 대망치 단조서",
    description: `${ITEMS.lava_core_greatmaul.name}을(를) 만든다. ${ITEMS.lava_core_maul.name}에 용암 핵을 더 녹여 붓고 화염 비늘로 자루를 감싼다.`,
    ingredients: [
      { kind: "equip", itemId: "lava_core_maul", count: 1 },
      { kind: "material", materialId: "lava_core", count: 12 },
      { kind: "material", materialId: "flame_scale", count: 8 },
    ],
    result: { kind: "equipment", itemId: "lava_core_greatmaul", slot: "weapon" },
    variance: { atk: 1 },
    tradable: false,
  },
  {
    id: "azure_talon",
    name: "창천의 발톱 세공서",
    description: `${ITEMS.azure_talon.name}을(를) 만든다. ${ITEMS.sky_render_talon.name}에 초원 매 깃털을 겹겹이 둘러 균형을 잡는다.`,
    ingredients: [
      { kind: "equip", itemId: "sky_render_talon", count: 1 },
      { kind: "material", materialId: "hawk_feather", count: 8 },
    ],
    result: { kind: "equipment", itemId: "azure_talon", slot: "weapon" },
    variance: { atk: 1 },
    tradable: false,
  },
  {
    id: "spider_queen_silk_plate",
    name: "거미여왕의 비단 정갑 직조서",
    description: `${ITEMS.spider_queen_silk_plate.name}을(를) 만든다. ${ITEMS.spider_queen_silk_robe.name}을(를) 거미줄로 더 곱게 짜 올린다.`,
    ingredients: [
      { kind: "equip", itemId: "spider_queen_silk_robe", count: 1 },
      { kind: "material", materialId: "spider_silk", count: 24 },
    ],
    result: { kind: "equipment", itemId: "spider_queen_silk_plate", slot: "armor" },
    variance: { luk: 1 },
    tradable: false,
  },
  {
    id: "bat_swarm_guide",
    name: "박쥐떼의 인도자 세공서",
    description: `${ITEMS.bat_swarm_guide.name}을(를) 만든다. ${ITEMS.bat_swarm_charm.name}에 박쥐 눈알을 박아 어둠을 더 멀리 읽게 한다.`,
    ingredients: [
      { kind: "equip", itemId: "bat_swarm_charm", count: 1 },
      { kind: "material", materialId: "bat_eye", count: 16 },
    ],
    result: { kind: "equipment", itemId: "bat_swarm_guide", slot: "accessory" },
    variance: { spd: 1 },
    tradable: false,
  },
  {
    id: "phoenix_flight_cape",
    name: "봉황 비행깃 망토 직조서",
    description: `${ITEMS.phoenix_flight_cape.name}을(를) 만든다. ${ITEMS.flame_eagle_cape.name}에 봉황 깃털을 더 이어 짜 비행깃을 살린다.`,
    ingredients: [
      { kind: "equip", itemId: "flame_eagle_cape", count: 1 },
      { kind: "material", materialId: "phoenix_feather", count: 10 },
    ],
    result: { kind: "equipment", itemId: "phoenix_flight_cape", slot: "armor" },
    variance: { spd: 1 },
  },
  {
    id: "mole_king_borer",
    name: "두더지왕의 굴착드릴 개조서",
    description: `${ITEMS.mole_king_borer.name}을(를) 만든다. ${ITEMS.mole_king_drill.name}에 단단한 수정 날과 마정석 동력부를 단다.`,
    // hard_crystal 20→12: 이 라인 외에 마나 시리즈 4종이 같은 재료 ×8 씩 쓰는데, 거기에 더해
    // 20개는 ~500킬. 12 로 줄여 ~300킬 — 유실된 명품 업그레이드라 적당히 노력 보존.
    ingredients: [
      { kind: "equip", itemId: "mole_king_drill", count: 1 },
      { kind: "material", materialId: "hard_crystal", count: 12 },
      { kind: "material", materialId: "mana_crystal", count: 10 },
    ],
    result: { kind: "equipment", itemId: "mole_king_borer", slot: "weapon" },
    variance: { atk: 1 },
    tradable: false,
  },

  // ── 해안 지선 (조수 갯벌 / 산호초 섬 / 수심의 것) ─────────────────────────
  // 갯벌 입문 2종은 갯벌 잡몹 drop, 산호초 섬 3종 + 업그레이드 3종은 섬 잡몹 drop,
  // 심연 무구 4종은 수심의 것 보스 recipe_one_of, 수심의 핵은 보스 0.15.
  {
    id: "crab_shell_buckler",
    name: "게딱지 손방패 제작법",
    description: `${ITEMS.crab_shell_buckler.name}을(를) 만든다. 집게발 게의 등딱지를 깎아 손잡이를 댄다.`,
    ingredients: [{ kind: "material", materialId: "crab_shell", count: 6 }],
    result: { kind: "equipment", itemId: "crab_shell_buckler", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "tideflats_waders",
    name: "갯벌 각반 제작법",
    description: `${ITEMS.tideflats_waders.name}을(를) 만든다. 게딱지 조각을 정강이에 누벼 감싼다.`,
    ingredients: [{ kind: "material", materialId: "crab_shell", count: 8 }],
    result: { kind: "equipment", itemId: "tideflats_waders", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "coral_spine_dagger",
    name: "산호 가시 단검 제작서",
    description: `${ITEMS.coral_spine_dagger.name}을(를) 만든다. 부러진 산호 가시를 갈아 자루에 박는다.`,
    ingredients: [{ kind: "material", materialId: "coral_spine", count: 6 }],
    result: { kind: "equipment", itemId: "coral_spine_dagger", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "siren_scale_robe",
    name: "사이렌 비늘 로브 직조서",
    description: `${ITEMS.siren_scale_robe.name}을(를) 만든다. 산호초 사이렌의 비늘을 이어 짠다.`,
    ingredients: [{ kind: "material", materialId: "deep_scale", count: 6 }],
    result: { kind: "equipment", itemId: "siren_scale_robe", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "tideglass_charm",
    name: "조수유리 부적 세공서",
    description: `${ITEMS.tideglass_charm.name}을(를) 만든다. 심해 비늘과 산호 조각을 가는 끈에 엮는다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 3 },
      { kind: "material", materialId: "coral_spine", count: 3 },
    ],
    result: { kind: "equipment", itemId: "tideglass_charm", slot: "accessory" },
    variance: { vit: 1 },
  },
  {
    id: "crustacean_bulwark",
    name: "갑각 보루방패 제작서",
    description: `${ITEMS.crustacean_bulwark.name}을(를) 만든다. ${ITEMS.crab_shell_buckler.name}에 더 큰 갑각판과 산호 가시를 덧대 보루처럼 키운다.`,
    ingredients: [
      { kind: "equip", itemId: "crab_shell_buckler", count: 1 },
      { kind: "material", materialId: "crab_shell", count: 10 },
      { kind: "material", materialId: "coral_spine", count: 4 },
    ],
    result: { kind: "equipment", itemId: "crustacean_bulwark", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "barbed_coral_dagger",
    name: "가시 산호 단검 제작서",
    description: `${ITEMS.barbed_coral_dagger.name}을(를) 만든다. ${ITEMS.coral_spine_dagger.name}에 잔가시를 더 박아 넣는다.`,
    ingredients: [
      { kind: "equip", itemId: "coral_spine_dagger", count: 1 },
      { kind: "material", materialId: "coral_spine", count: 12 },
    ],
    result: { kind: "equipment", itemId: "barbed_coral_dagger", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "siren_song_mantle",
    name: "사이렌 노래 망토 직조서",
    description: `${ITEMS.siren_song_mantle.name}을(를) 만든다. ${ITEMS.siren_scale_robe.name}에 심해 비늘을 더 이어 짠다.`,
    ingredients: [
      { kind: "equip", itemId: "siren_scale_robe", count: 1 },
      { kind: "material", materialId: "deep_scale", count: 14 },
    ],
    result: { kind: "equipment", itemId: "siren_song_mantle", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "abyssal_edge",
    name: "심연 칼날 단조서",
    description: `${ITEMS.abyssal_edge.name}을(를) 만든다. 수심의 것의 비늘을 산호 가시와 함께 벼린다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 8 },
      { kind: "material", materialId: "coral_spine", count: 6 },
    ],
    result: { kind: "equipment", itemId: "abyssal_edge", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "abyssal_ward",
    name: "심연 방벽 단조서",
    description: `${ITEMS.abyssal_ward.name}을(를) 만든다. 수심의 것의 등딱지를 산호 가시로 받쳐 둘러친다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 8 },
      { kind: "material", materialId: "coral_spine", count: 6 },
    ],
    result: { kind: "equipment", itemId: "abyssal_ward", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "abyssal_pike",
    name: "심연 장창 단조서",
    description: `${ITEMS.abyssal_pike.name}을(를) 만든다. 수심의 것의 가시뼈를 깎아 긴 창대에 박는다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 8 },
      { kind: "material", materialId: "coral_spine", count: 6 },
    ],
    result: { kind: "equipment", itemId: "abyssal_pike", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "abyssal_clasp",
    name: "심연 손아귀 단조서",
    description: `${ITEMS.abyssal_clasp.name}을(를) 만든다. 수심의 것의 발톱뼈를 손등에 박아 너클로 엮는다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 8 },
      { kind: "material", materialId: "coral_spine", count: 6 },
    ],
    result: { kind: "equipment", itemId: "abyssal_clasp", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "abyssal_heart",
    name: "수심의 핵 세공서",
    description: `${ITEMS.abyssal_heart.name}을(를) 만든다. 수심의 것의 가슴에서 꺼낸 차가운 핵을 심해 비늘로 감싼다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 6 },
      { kind: "material", materialId: "coral_spine", count: 4 },
    ],
    result: { kind: "equipment", itemId: "abyssal_heart", slot: "accessory" },
    variance: { vit: 1 },
  },
  {
    id: "tidelord_signet_engraving",
    name: "조수군주의 인장 새김서",
    description: `${ITEMS.tidelord_signet.name}을(를) 만든다. ${ITEMS.drowned_signet.name}에 심해 비늘을 녹여 새 문장을 새겨 넣는다.`,
    ingredients: [
      { kind: "equip", itemId: "drowned_signet", count: 1 },
      { kind: "material", materialId: "deep_scale", count: 6 },
    ],
    result: { kind: "equipment", itemId: "tidelord_signet", slot: "accessory" },
    variance: { luk: 1 },
    tradable: false,
  },

  // ── 서편 옛길 (서편 옛길 / 옛 변경 성채 / 옛 성문지기) ─────────────────────
  // 옛길 입문 2종은 옛길 잡몹 drop, 옛 변경 성채 3종 + 업그레이드 3종은 성채 잡몹 drop,
  // 수비대 무구 4종은 옛 성문지기 보스 recipe_one_of, 성문지기의 핵은 보스 0.15.
  {
    id: "crow_feather_cap",
    name: "까마귀깃 두건 제작법",
    description: `${ITEMS.crow_feather_cap.name}을(를) 만든다. 들까마귀 깃을 이어 두건 모양으로 짓는다.`,
    ingredients: [{ kind: "material", materialId: "raven_feather", count: 5 }],
    result: { kind: "equipment", itemId: "crow_feather_cap", slot: "armor" },
    variance: { spd: 1 },
  },
  {
    id: "roadbandit_shortsword",
    name: "노상강도의 단검 제작서",
    description: `${ITEMS.roadbandit_shortsword.name}을(를) 만든다. 들고양이 송곳니로 손잡이를 감고 짧은 날을 댄다.`,
    ingredients: [
      { kind: "material", materialId: "wilddog_fang", count: 4 },
      { kind: "material", materialId: "raven_feather", count: 3 },
    ],
    result: { kind: "equipment", itemId: "roadbandit_shortsword", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "garrison_hauberk",
    name: "수비대 사슬갑옷 제작서",
    description: `${ITEMS.garrison_hauberk.name}을(를) 만든다. 녹슨 쇳조각을 다시 엮어 사슬을 짠다.`,
    ingredients: [{ kind: "material", materialId: "scrap_iron", count: 6 }],
    result: { kind: "equipment", itemId: "garrison_hauberk", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "geared_warpick",
    name: "톱니 전곡괭이 단조서",
    description: `${ITEMS.geared_warpick.name}을(를) 만든다. 자동인형의 톱니와 강철판으로 곡괭이 머리를 벼린다.`,
    ingredients: [{ kind: "material", materialId: "scrap_iron", count: 6 }],
    result: { kind: "equipment", itemId: "geared_warpick", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "tattered_standard_cloak",
    name: "낡은 군기 망토 직조서",
    description: `${ITEMS.tattered_standard_cloak.name}을(를) 만든다. 옛 군기 조각을 기워 망토로 두른다.`,
    ingredients: [{ kind: "material", materialId: "war_banner_scrap", count: 5 }],
    result: { kind: "equipment", itemId: "tattered_standard_cloak", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "roadbandit_falchion",
    name: "노상강도의 활검 제작서",
    description: `${ITEMS.roadbandit_falchion.name}을(를) 만든다. ${ITEMS.roadbandit_shortsword.name}에 녹슨 쇳조각을 덧대 날을 길게 늘이고 굽힌다.`,
    ingredients: [
      { kind: "equip", itemId: "roadbandit_shortsword", count: 1 },
      { kind: "material", materialId: "wilddog_fang", count: 10 },
      { kind: "material", materialId: "scrap_iron", count: 4 },
    ],
    result: { kind: "equipment", itemId: "roadbandit_falchion", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "reinforced_garrison_hauberk",
    name: "보강한 수비대 사슬갑옷 제작서",
    description: `${ITEMS.reinforced_garrison_hauberk.name}을(를) 만든다. ${ITEMS.garrison_hauberk.name}에 녹슨 쇳조각으로 가슴판을 덧대고 옛 군기 조각으로 안감을 받친다.`,
    ingredients: [
      { kind: "equip", itemId: "garrison_hauberk", count: 1 },
      { kind: "material", materialId: "scrap_iron", count: 12 },
      { kind: "material", materialId: "war_banner_scrap", count: 4 },
    ],
    result: { kind: "equipment", itemId: "reinforced_garrison_hauberk", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "frontier_standard_cloak",
    name: "변경 군기 망토 직조서",
    description: `${ITEMS.frontier_standard_cloak.name}을(를) 만든다. ${ITEMS.tattered_standard_cloak.name}에 또 다른 군기 조각을 겹쳐 기운다.`,
    ingredients: [
      { kind: "equip", itemId: "tattered_standard_cloak", count: 1 },
      { kind: "material", materialId: "war_banner_scrap", count: 14 },
    ],
    result: { kind: "equipment", itemId: "frontier_standard_cloak", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "garrison_blade",
    name: "수비대 도검 단조서",
    description: `${ITEMS.garrison_blade.name}을(를) 만든다. 옛 성문지기의 강철판을 옛 군기 조각으로 손잡이를 감아 벼린다.`,
    ingredients: [
      { kind: "material", materialId: "scrap_iron", count: 8 },
      { kind: "material", materialId: "war_banner_scrap", count: 6 },
    ],
    result: { kind: "equipment", itemId: "garrison_blade", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "garrison_bulwark",
    name: "수비대 방패 단조서",
    description: `${ITEMS.garrison_bulwark.name}을(를) 만든다. 옛 성문지기의 빗장을 옛 군기 조각으로 손잡이를 받쳐 두른다.`,
    ingredients: [
      { kind: "material", materialId: "scrap_iron", count: 8 },
      { kind: "material", materialId: "war_banner_scrap", count: 6 },
    ],
    result: { kind: "equipment", itemId: "garrison_bulwark", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "garrison_glaive",
    name: "수비대 미늘창 단조서",
    description: `${ITEMS.garrison_glaive.name}을(를) 만든다. 옛 성문지기의 톱니를 깎아 긴 창대에 미늘로 박는다.`,
    ingredients: [
      { kind: "material", materialId: "scrap_iron", count: 8 },
      { kind: "material", materialId: "war_banner_scrap", count: 6 },
    ],
    result: { kind: "equipment", itemId: "garrison_glaive", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "garrison_cudgel",
    name: "수비대 철퇴 단조서",
    description: `${ITEMS.garrison_cudgel.name}을(를) 만든다. 옛 성문지기의 강철판을 뭉쳐 머리를 달고 자루를 박는다.`,
    ingredients: [
      { kind: "material", materialId: "scrap_iron", count: 8 },
      { kind: "material", materialId: "war_banner_scrap", count: 6 },
    ],
    result: { kind: "equipment", itemId: "garrison_cudgel", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "gatekeeper_core",
    name: "성문지기의 핵 세공서",
    description: `${ITEMS.gatekeeper_core.name}을(를) 만든다. 옛 성문지기의 가슴에서 꺼낸 강철 핵을 녹슨 쇳조각으로 감싸 다듬는다.`,
    ingredients: [
      { kind: "material", materialId: "scrap_iron", count: 6 },
      { kind: "material", materialId: "war_banner_scrap", count: 4 },
    ],
    result: { kind: "equipment", itemId: "gatekeeper_core", slot: "accessory" },
    variance: { vit: 1 },
  },
  {
    id: "crows_hoard_engraving",
    name: "까마귀 둥지 부적 새김서",
    description: `${ITEMS.corvid_fortune_charm.name}을(를) 만든다. ${ITEMS.crows_hoard_charm.name}에 녹슨 동전과 톱니를 더 엮어 무겁게 한다.`,
    ingredients: [
      { kind: "equip", itemId: "crows_hoard_charm", count: 1 },
      { kind: "material", materialId: "scrap_iron", count: 6 },
    ],
    result: { kind: "equipment", itemId: "corvid_fortune_charm", slot: "accessory" },
    variance: { luk: 1 },
    tradable: false,
  },

  // ── 용비늘 라인 (뼈무덤 황야 / 용비늘 묘지 / 뼈비늘 노룡) ─────────────────
  // 황야 입문 2종(잡몹 드랍 제작서) → 묘지 잡몹산 3종(잡몹 드랍 제작서) → 뼈비늘 노룡 보스 보상
  // (잡몹산 3종 업그레이드 + 뼈왕의 대검 + 용지기의 망토). 별·회랑 라인과 같은 tier 5 영역이지만
  // 방어/활력 비중이 훨씬 높다. 업그레이드 라인은 베이스를 'equip' 재료로 소비.
  {
    id: "bonescale_buckler",
    name: "뼈비늘 손방패 제작서",
    description: `${ITEMS.bonescale_buckler.name}을(를) 만든다. 황야의 뼛조각과 용비늘 가루를 짜 가볍게 두른다.`,
    ingredients: [
      { kind: "material", materialId: "scale_dust", count: 6 },
      { kind: "material", materialId: "scrap_iron", count: 4 },
    ],
    result: { kind: "equipment", itemId: "bonescale_buckler", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "barrow_traveler_armor",
    name: "황야 행자 갑옷 제작법",
    description: `${ITEMS.barrow_traveler_armor.name}을(를) 만든다. 두꺼운 가죽 안감에 용비늘 가루를 다져 넣는다.`,
    ingredients: [
      { kind: "material", materialId: "tough_hide", count: 4 },
      { kind: "material", materialId: "scale_dust", count: 8 },
    ],
    result: { kind: "equipment", itemId: "barrow_traveler_armor", slot: "armor" },
    variance: { def: 1 },
  },
  // 묘지 잡몹산 3종 — Lv75 사냥터 드랍.
  {
    id: "dragonbone_kite_shield",
    name: "용골 카이트 방패 제작서",
    description: `${ITEMS.dragonbone_kite_shield.name}을(를) 만든다. 묘지에서 거둔 용골을 잘라 길쭉한 방패 형태로 두른다.`,
    ingredients: [
      { kind: "material", materialId: "dragonscale_shard", count: 4 },
      { kind: "material", materialId: "scale_dust", count: 10 },
      { kind: "material", materialId: "scrap_iron", count: 6 },
    ],
    result: { kind: "equipment", itemId: "dragonbone_kite_shield", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "scaleguard_plate",
    name: "비늘 보호갑 제작법",
    description: `${ITEMS.scaleguard_plate.name}을(를) 만든다. 용비늘 조각을 비늘 모양 그대로 강철 안감에 누벼 댄다.`,
    ingredients: [
      { kind: "material", materialId: "dragonscale_shard", count: 5 },
      { kind: "material", materialId: "scrap_iron", count: 8 },
      { kind: "material", materialId: "scale_dust", count: 6 },
    ],
    result: { kind: "equipment", itemId: "scaleguard_plate", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "bonerune_helm",
    name: "뼈각인 투구 제작서",
    description: `${ITEMS.bonerune_helm.name}을(를) 만든다. 용골을 갈아 옛 보호의 결을 한 줄 새기고 강철 투구로 굳힌다.`,
    ingredients: [
      { kind: "material", materialId: "bone_rune_steel", count: 2 },
      { kind: "material", materialId: "dragonscale_shard", count: 3 },
      { kind: "material", materialId: "scrap_iron", count: 4 },
    ],
    result: { kind: "equipment", itemId: "bonerune_helm", slot: "accessory" },
    variance: { def: 1 },
  },
  // 뼈비늘 노룡 보스 보상 — 업그레이드 3종 + 뼈왕의 대검 + 용지기의 망토.
  {
    id: "dragonscale_aegis",
    name: "용비늘 영광 방패 제작서",
    description: `${ITEMS.dragonscale_aegis.name}을(를) 만든다. ${ITEMS.dragonbone_kite_shield.name}의 골격에 노룡의 비늘을 한 겹 더 얹고 뼈각인 강철로 결을 다시 잡는다.`,
    ingredients: [
      { kind: "equip", itemId: "dragonbone_kite_shield", count: 1 },
      { kind: "material", materialId: "dragonscale_shard", count: 5 },
      { kind: "material", materialId: "bone_rune_steel", count: 3 },
    ],
    result: { kind: "equipment", itemId: "dragonscale_aegis", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "dragonscale_plate",
    name: "용비늘 흉갑 제작법",
    description: `${ITEMS.dragonscale_plate.name}을(를) 만든다. ${ITEMS.scaleguard_plate.name} 위에 노룡의 가슴 비늘을 가공해 한 겹 더 덧댄다.`,
    ingredients: [
      { kind: "equip", itemId: "scaleguard_plate", count: 1 },
      { kind: "material", materialId: "dragonscale_shard", count: 6 },
      { kind: "material", materialId: "bone_rune_steel", count: 3 },
    ],
    result: { kind: "equipment", itemId: "dragonscale_plate", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "dragonscale_helm",
    name: "용비늘 투구 제작서",
    description: `${ITEMS.dragonscale_helm.name}을(를) 만든다. ${ITEMS.bonerune_helm.name} 위로 노룡의 두골 비늘을 한 겹 더 두른다.`,
    ingredients: [
      { kind: "equip", itemId: "bonerune_helm", count: 1 },
      { kind: "material", materialId: "dragonscale_shard", count: 4 },
      { kind: "material", materialId: "bone_rune_steel", count: 2 },
    ],
    result: { kind: "equipment", itemId: "dragonscale_helm", slot: "accessory" },
    variance: { def: 1 },
  },
  {
    id: "boneking_greatsword",
    name: "뼈왕의 대검 제작서",
    description: `${ITEMS.boneking_greatsword.name}을(를) 만든다. 노룡의 등뼈를 통째로 깎아 손잡이를 박고 뼈각인 강철로 칼날을 단조한다.`,
    ingredients: [
      { kind: "material", materialId: "bone_rune_steel", count: 4 },
      { kind: "material", materialId: "dragonscale_shard", count: 4 },
      { kind: "material", materialId: "scrap_iron", count: 10 },
    ],
    result: { kind: "equipment", itemId: "boneking_greatsword", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "wyrm_warden_cloak",
    name: "용지기의 망토 제작법",
    description: `${ITEMS.wyrm_warden_cloak.name}을(를) 만든다. 노룡의 잿빛 비늘을 가는 가닥으로 풀어 짠다.`,
    ingredients: [
      { kind: "material", materialId: "dragonscale_shard", count: 4 },
      { kind: "material", materialId: "scale_dust", count: 8 },
      { kind: "material", materialId: "bone_rune_steel", count: 2 },
    ],
    result: { kind: "equipment", itemId: "wyrm_warden_cloak", slot: "armor" },
    variance: { def: 1 },
  },
];

export function getRecipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

// 결과가 그 장비인 레시피 — 제작산 등급 인스턴스를 EquipItem 으로 재구성할 때 variance 조회.
const RECIPE_BY_RESULT_ITEM: Map<ItemId, Recipe> = new Map();
for (const r of RECIPES) {
  if (r.result.kind === "equipment") RECIPE_BY_RESULT_ITEM.set(r.result.itemId, r);
}

// 레시피에 품질 변동 정의(variance / varianceTable)가 있는지 — 서버가 등급 추첨 여부를 결정.
export function recipeHasVariance(recipe: Recipe): boolean {
  return craftHasVariance(recipe);
}

// 제작산 등급 인스턴스(itemId + 등급) → 등급 반영된 EquipItem(+ craftTier 마커).
// 레시피가 없거나 변동 정의가 없으면 베이스 그대로(+ 마커).
export function resolveCraftedItem(
  itemId: ItemId,
  tier: CraftTier,
): CraftedEquipItem {
  const base: EquipItem = ITEMS[itemId];
  return applyCraftTier(base, RECIPE_BY_RESULT_ITEM.get(itemId) ?? {}, tier);
}
