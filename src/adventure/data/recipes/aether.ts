import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const AETHER_RECIPES: Recipe[] = [
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

];
