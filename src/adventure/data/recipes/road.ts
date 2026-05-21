import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const ROAD_RECIPES: Recipe[] = [
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

];
