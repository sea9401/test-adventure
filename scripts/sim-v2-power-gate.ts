// 권장 파워 게이트(floorPowerGate) 캘리브 sim — "그 깊이에서 풀 승률 TARGET_WR% 를 내는
// 현실 빌드의 파워"를 깊이별로 실측해, 게이트 곡선(damping 지수)을 역산한다.
//
// 배경(2026-06-11): 옛 게이트 = statMult × 110 (at-level 비례 가정). 그러나 후반 유저의
// 파워(누적레벨 floor 감쇠 + 밴드 장비 flat)는 깊이 statMult(선형 0.6/깊이)만큼 못 자라는
// 반면, 전투 실효(크리·회피·spd·def 댐핑)는 파워 점수에 다 안 잡혀 — 깊이 48 권장 2915 vs
// 실측 파워 1390 빌드가 승률 93% 라는 큰 괴리가 났다. 게이트는 표시 전용(진입은 frontierDepth)
// 이라 안전하게 재캘리브 가능.
//
// 레퍼런스 빌드(전사 4차, 보통 수행): 누적레벨이 다이얼.
//   - 스탯: computeStatFloors(cumLevel) + Lv100 성장(rollLevelGrowth 99회, caps=보통 수행)
//   - 장비: 그 깊이 밴드의 드랍 BiS(슬롯별 최고 위력, 대검). 깊이<13 = 상점 미스릴 라인.
//   - 스킬 0(베이스라인 — 스킬 빌드는 더 강하므로 게이트는 보수측).
//
// 실행: node --import tsx scripts/sim-v2-power-gate.ts
// 출력: 깊이별 필요 파워 실측 + 추천 GATE_DAMP(최소자승) + 새 곡선 미리보기.

import { resolveBattle } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { computeStatFloors, rollLevelGrowth } from "../src/adventure/data/v2/statGrowth";
import { emptyProficiency } from "../src/adventure/data/v2/proficiency";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import { floorPowerGate, floorStatMult } from "../src/adventure/data/v2/dungeonLadder";
import { V2_MONSTERS } from "../src/adventure/data/v2/v2Monsters";
import { enemiesForDepth } from "../src/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
  type V2EquipSlot,
} from "../src/adventure/data/v2/v2Equipment";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import type { Monster } from "../src/adventure/data/monsters/types";

const TARGET_WR = 90; // "권장" 의미 — 이 파워면 그 깊이 풀을 편하게(90%) 사냥.
const TRIALS_PER_MONSTER = 30;

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

// 깊이 → 밴드 장비 prefix (7+, 깊은 산 삭제 후). 43+ 는 마지막 밴드(소굴) 무한 반복.
function bandPrefix(depth: number): string | null {
  if (depth < 7) return null;
  if (depth <= 12) return "v2_canyon_";
  if (depth <= 18) return "v2_lake_";
  if (depth <= 24) return "v2_cave_";
  if (depth <= 30) return "v2_sanctum_";
  if (depth <= 36) return "v2_swamp_";
  return "v2_den_";
}

// 슬롯별 최고 위력(전사 — 무기는 대검 우선, 없으면 최고 위력 무기).
function bandGear(depth: number): Partial<Record<V2EquipSlot, V2EquipmentId>> {
  const prefix = bandPrefix(depth);
  if (!prefix) {
    return {
      weapon: "v2_mithril_sword",
      armor: "v2_mithril_plate",
      gloves: "v2_windweave_gloves",
      boots: "v2_windweave_boots",
      ring: "v2_fate_ring",
      necklace: "v2_mana_essence",
    };
  }
  const ids = (Object.keys(V2_EQUIPMENT) as V2EquipmentId[]).filter((id) =>
    id.startsWith(prefix),
  );
  const bySlot = new Map<V2EquipSlot, V2EquipmentId>();
  for (const id of ids) {
    const it = V2_EQUIPMENT[id];
    const cur = bySlot.get(it.slot);
    const better = !cur || (V2_EQUIPMENT[cur].power ?? 0) < (it.power ?? 0);
    if (it.slot === "weapon") {
      const curIsGs = cur && V2_EQUIPMENT[cur].weaponType === "greatsword";
      const isGs = it.weaponType === "greatsword";
      if (curIsGs && !isGs) continue;
      if (!curIsGs && isGs) {
        bySlot.set(it.slot, id);
        continue;
      }
    }
    if (better) bySlot.set(it.slot, id);
  }
  return Object.fromEntries(bySlot.entries());
}

function makeRef(depth: number, cumLevel: number) {
  const prof = emptyProficiency();
  const firstLife = cumLevel <= 100;
  const level = firstLife ? Math.max(1, cumLevel) : 100;
  const tier = firstLife ? (level >= 70 ? 4 : level >= 50 ? 3 : level >= 30 ? 2 : 1) : 4;
  prof.groups["warrior"] = { tier, points: 0, cumLevel } as never;
  // 보통 수행 — 주력 위주 cap 이득(파밍 동반 가정). 첫 생애엔 비례 축소.
  const capScale = firstLife ? level / 100 : 1;
  (prof as { caps: Partial<Record<V2StatKey, number>> }).caps = {
    str: Math.round(120 * capScale),
    vit: Math.round(70 * capScale),
    dex: Math.round(70 * capScale),
    luk: Math.round(30 * capScale),
  };
  let grown: Partial<Record<V2StatKey, number>> = {};
  const r = rng(7 + depth * 13);
  for (let i = 0; i < level - 1; i++) grown = rollLevelGrowth(grown, "warrior", prof, r);
  const d = derivePlayerCombatV2Pure({
    level,
    allocatedStats: grown,
    statCaps: prof.caps,
    statFloors: computeStatFloors(prof),
    v2Equipped: bandGear(depth),
    playerClass: "warrior",
    classTier: tier as 1 | 2 | 3 | 4,
    hp: undefined,
  });
  const p = d.player;
  const power = derivePowerScore({
    atk: p.atk,
    magicAtk: p.magicAtk ?? 0,
    def: p.def,
    spd: p.spd,
    maxHp: d.maxHp,
    maxMp: p.maxMp ?? 0,
  });
  return { d, power };
}

function poolWr(depth: number, cumLevel: number): number {
  const { d } = makeRef(depth, cumLevel);
  const mobs: Monster[] = [];
  for (const e of enemiesForDepth(depth)) {
    const b = V2_MONSTERS[e.key];
    if (b) mobs.push(scaleMonsterForFloor(b, depth));
  }
  let w = 0;
  let t = 0;
  for (const m of mobs) {
    for (let i = 0; i < TRIALS_PER_MONSTER; i++) {
      const res = resolveBattle({ ...d.player, hp: d.maxHp }, m, "S", {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: { learned: [], equipped: [] },
      });
      t++;
      if (res.outcome === "win") w++;
    }
  }
  return (w / t) * 100;
}

// 깊이별 — TARGET_WR 달성 최소 누적레벨 이진 탐색 → 그 빌드의 파워가 "필요 파워".
function requiredPower(depth: number): { cumLevel: number; power: number } {
  let lo = 1;
  let hi = 6000;
  if (poolWr(depth, hi) < TARGET_WR) return { cumLevel: hi, power: makeRef(depth, hi).power };
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (poolWr(depth, mid) >= TARGET_WR) hi = mid;
    else lo = mid + 1;
  }
  return { cumLevel: lo, power: makeRef(depth, lo).power };
}

const DEPTHS = [7, 9, 11, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46, 48, 52, 56, 60];

console.log(`타깃 풀 승률 ${TARGET_WR}% · 전사 4차 보통수행 · 밴드 BiS(굴림 평균) · 스킬 0`);
console.log("depth | statMult | 현 게이트 | 필요 파워(실측) | 필요/110 | 함의 γ");
const points: { m: number; req: number }[] = [];
for (const depth of DEPTHS) {
  const { cumLevel, power } = requiredPower(depth);
  const m = floorStatMult(depth);
  const gamma = Math.log(power / 110) / Math.log(m);
  points.push({ m, req: power });
  console.log(
    `${String(depth).padStart(5)} | ${m.toFixed(2).padStart(8)} | ${String(floorPowerGate(depth)).padStart(9)} | ${String(power).padStart(8)} (cum ${cumLevel}) | ${(power / 110).toFixed(2).padStart(7)} | ${gamma.toFixed(3)}`,
  );
}

// 최소자승 — log(req/110) = γ·log(m). (110 스케일 고정, γ 단일 다이얼.)
let num = 0;
let den = 0;
for (const { m, req } of points) {
  const lm = Math.log(m);
  num += lm * Math.log(req / 110);
  den += lm * lm;
}
const gammaFit = num / den;
console.log(`\n추천 GATE_DAMP(γ) = ${gammaFit.toFixed(3)}`);
console.log("새 곡선 미리보기 (110 × statMult^γ):");
for (const depth of [7, 13, 19, 25, 31, 37, 43, 48, 56, 60]) {
  const g = Math.round(110 * Math.pow(floorStatMult(depth), gammaFit));
  console.log(`  깊이 ${depth}: ${floorPowerGate(depth)} → ${g}`);
}
