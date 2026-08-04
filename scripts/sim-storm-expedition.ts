// 폭풍 원정 V2 보상 공급량 Monte Carlo 검증.
// 실행: node --import tsx scripts/sim-storm-expedition.ts [runs]

import {
  type StormExpeditionEncounterKind,
  type StormExpeditionRouteId,
} from "../src/adventure/data/v2/stormExpedition";
import {
  STORM_EXPEDITION_ROUTE_MATERIAL_ID,
  STORM_HEART_FRAGMENT_MATERIAL_ID,
  STORM_ORIGIN_FRAGMENT_MATERIAL_ID,
  rollStormExpeditionLoot,
} from "../src/adventure/data/v2/stormExpeditionRewards";

const RUNS = Math.max(1, Math.floor(Number(process.argv[2]) || 1_000_000));
const ROUTES: StormExpeditionRouteId[] = ["gale", "thunder", "wreckage"];
const ENCOUNTERS: StormExpeditionEncounterKind[] = [
  "early_trash",
  "early_trash",
  "late_trash",
  "late_trash",
  "elite",
  "guardian",
  "final_boss",
];

type Totals = {
  routeMaterials: number;
  originFragments: number;
  heartFragments: number;
  equipmentRuns: number;
  equipmentDrops: number;
  contractEquipmentRuns: number;
  contractEquipmentDrops: number;
};

for (const routeId of ROUTES) {
  const totals: Totals = {
    routeMaterials: 0,
    originFragments: 0,
    heartFragments: 0,
    equipmentRuns: 0,
    equipmentDrops: 0,
    contractEquipmentRuns: 0,
    contractEquipmentDrops: 0,
  };
  const routeMaterialId = STORM_EXPEDITION_ROUTE_MATERIAL_ID[routeId];
  for (let run = 0; run < RUNS; run += 1) {
    let foundEquipment = false;
    let foundContractEquipment = false;
    for (let encounterIndex = 0; encounterIndex < ENCOUNTERS.length; encounterIndex += 1) {
      const encounter = ENCOUNTERS[encounterIndex];
      const loot = rollStormExpeditionLoot(routeId, encounter);
      totals.routeMaterials += loot.materials[routeMaterialId] ?? 0;
      totals.originFragments += loot.materials[STORM_ORIGIN_FRAGMENT_MATERIAL_ID] ?? 0;
      totals.heartFragments += loot.materials[STORM_HEART_FRAGMENT_MATERIAL_ID] ?? 0;
      if (loot.equipmentId) {
        totals.equipmentDrops += 1;
        foundEquipment = true;
      }
      const contractLoot = rollStormExpeditionLoot(
        routeId,
        encounter,
        Math.random,
        { equipmentChanceMultiplier: encounterIndex >= 2 ? 2 : 1 },
      );
      if (contractLoot.equipmentId) {
        totals.contractEquipmentDrops += 1;
        foundContractEquipment = true;
      }
    }
    if (foundEquipment) totals.equipmentRuns += 1;
    if (foundContractEquipment) totals.contractEquipmentRuns += 1;
  }

  const average = (value: number) => (value / RUNS).toFixed(4);
  console.log([
    routeId,
    `runs=${RUNS.toLocaleString("en-US")}`,
    `routeMat=${average(totals.routeMaterials)}`,
    `origin=${average(totals.originFragments)}`,
    `heart=${average(totals.heartFragments)}`,
    `gear/run=${average(totals.equipmentDrops)}`,
    `gearChance=${((totals.equipmentRuns / RUNS) * 100).toFixed(3)}%`,
    `contractGear/run=${average(totals.contractEquipmentDrops)}`,
    `contractGearChance=${((totals.contractEquipmentRuns / RUNS) * 100).toFixed(3)}%`,
    `riftRouteMat=${average(totals.routeMaterials + RUNS * 2)}`,
    "goldenGold=331300",
  ].join(" | "));
}
