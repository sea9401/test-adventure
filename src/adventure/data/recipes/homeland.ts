import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const HOMELAND_RECIPES: Recipe[] = [
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
];
