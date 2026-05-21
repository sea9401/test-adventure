import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const PHOENIX_RECIPES: Recipe[] = [
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

];
