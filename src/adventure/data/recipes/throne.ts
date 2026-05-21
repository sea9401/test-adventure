import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const THRONE_RECIPES: Recipe[] = [
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

];
