import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const CORRIDOR_RECIPES: Recipe[] = [
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

];
