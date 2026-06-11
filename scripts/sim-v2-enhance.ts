// 장비 강화 밸런스 sim — 풀강(+10)이 PvE 승률·PvP 매치업에 주는 격차 측정.
// 설계 docs/v2-equipment-enhance-plan.md PR-4. ENHANCE 보너스 %p 캘리브 입력.
//
// 레퍼런스: 전사 4차(누적 2000·보통 수행)·소굴 BiS. 강화 시나리오 = 무강 / +5 순푸(+10%) /
// +10 순푸(+20%) / +10 순붉(+30%) — 6슬롯 전부 동일 적용.
//
// 실행: node --import tsx scripts/sim-v2-enhance.ts

import { resolveBattle } from "../src/adventure/v2/combat/engine";
import { resolveBattlePvP } from "../src/adventure/v2/combat/engine-pvp";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { computeStatFloors, rollLevelGrowth } from "../src/adventure/data/v2/statGrowth";
import { emptyProficiency } from "../src/adventure/data/v2/proficiency";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import { floorPowerGate } from "../src/adventure/data/v2/dungeonLadder";
import { V2_MONSTERS } from "../src/adventure/data/v2/v2Monsters";
import { enemiesForDepth } from "../src/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import type { V2EnhanceState } from "../src/adventure/data/v2/v2Enhance";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
  type V2EquipRoll,
  type V2EquipSlot,
} from "../src/adventure/data/v2/v2Equipment";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import type { Monster } from "../src/adventure/data/monsters/types";

function rng(seed: number) {
  let t = seed;
  return () => {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const GEAR: Partial<Record<V2EquipSlot, V2EquipmentId>> = {
  weapon: "v2_den_greatsword",
  armor: "v2_den_void_armor",
  gloves: "v2_den_void_gloves",
  boots: "v2_den_void_boots",
  ring: "v2_den_hunter_ring",
  necklace: "v2_den_hunter_necklace",
};

function makeRef(enhance: V2EnhanceState | undefined) {
  const prof = emptyProficiency();
  prof.groups["warrior"] = { tier: 4, points: 0, cumLevel: 2000 } as never;
  (prof as { caps: Partial<Record<V2StatKey, number>> }).caps = {
    str: 120, vit: 70, dex: 70, luk: 30,
  };
  let grown: Partial<Record<V2StatKey, number>> = {};
  const r = rng(42);
  for (let i = 0; i < 99; i++) grown = rollLevelGrowth(grown, "warrior", prof, r);
  // 강화 = 위력 배율 — resolve 와 동일하게 카탈로그 위력에 적용한 합성 굴림.
  const rolls: Partial<Record<V2EquipmentId, V2EquipRoll>> = {};
  if (enhance) {
    for (const id of Object.values(GEAR) as V2EquipmentId[]) {
      const it = V2_EQUIPMENT[id];
      rolls[id] = {
        power: Math.floor(it.power * (1 + enhance.bonusPct / 100)),
        weight: it.weight,
      };
    }
  }
  const d = derivePlayerCombatV2Pure({
    level: 100,
    allocatedStats: grown,
    statCaps: prof.caps,
    statFloors: computeStatFloors(prof),
    v2Equipped: GEAR,
    v2StatRolls: rolls,
    playerClass: "warrior",
    classTier: 4,
    hp: undefined,
  });
  const p = d.player;
  const power = derivePowerScore({
    atk: p.atk, magicAtk: p.magicAtk ?? 0, def: p.def, spd: p.spd,
    maxHp: d.maxHp, maxMp: p.maxMp ?? 0,
  });
  return { d, power };
}

function pveWr(d: ReturnType<typeof makeRef>["d"], depth: number): number {
  const mobs: Monster[] = [];
  for (const e of enemiesForDepth(depth)) {
    const b = V2_MONSTERS[e.key];
    if (b) mobs.push(scaleMonsterForFloor(b, depth));
  }
  let w = 0, t = 0;
  for (const m of mobs) for (let i = 0; i < 40; i++) {
    const r = resolveBattle({ ...d.player, hp: d.maxHp }, m, "S", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {}, v2Skills: { learned: [], equipped: [] },
    });
    t++; if (r.outcome === "win") w++;
  }
  return Math.round((w / t) * 100);
}

const SCENARIOS: { label: string; enhance: V2EnhanceState | undefined }[] = [
  { label: "무강", enhance: undefined },
  { label: "+5 순푸(+10%)", enhance: { level: 5, bonusPct: 10 } },
  { label: "+10 순푸(+20%)", enhance: { level: 10, bonusPct: 20 } },
  { label: "+10 순붉(+30%)", enhance: { level: 10, bonusPct: 30 } },
];

console.log("시나리오 | power | 깊이48 | 깊이56 | 깊이64 | 깊이72");
const refs = SCENARIOS.map((s) => ({ ...s, ref: makeRef(s.enhance) }));
for (const s of refs) {
  const cells = [48, 56, 64, 72].map((dep) => `${pveWr(s.ref.d, dep)}%`.padStart(5));
  console.log(`${s.label.padEnd(14)} | ${String(s.ref.power).padStart(5)} | ${cells.join(" | ")}`);
}
console.log(`\n권장 파워 게이트: 깊이48=${floorPowerGate(48)} · 56=${floorPowerGate(56)} · 64=${floorPowerGate(64)} · 72=${floorPowerGate(72)}`);

// PvP — 풀강(+30%) vs 무강 직접 대결 (동일 빌드).
const a = refs[3].ref; // +10 순붉
const b = refs[0].ref; // 무강
let aw = 0;
const N = 400;
for (let i = 0; i < N; i++) {
  const r = resolveBattlePvP(
    { ...a.d.player, hp: a.d.maxHp },
    { ...b.d.player, hp: b.d.maxHp },
    "풀강", "무강",
    { pickAction: () => ({ kind: "attack" }), potions: { p1: {}, p2: {} } },
  );
  if (r.outcome === "p1_win") aw++;
}
console.log(`\nPvP 동빌드: +10 순붉 vs 무강 → 풀강 승률 ${Math.round((aw / N) * 100)}% (${N}판)`);
