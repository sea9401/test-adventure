import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const SPIRE_RECIPES: Recipe[] = [
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

];
