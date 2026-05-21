import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const UNBONG_RECIPES: Recipe[] = [
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
];
