// v2 장비 시스템 곡선 plausibility 측정 — 일회성 분석용.
// 실행:  npx tsx scripts/sim-equip-drops.ts
//        TRIALS=500 LEVEL=50 npx tsx scripts/sim-equip-drops.ts
//
// 목적:
//   1. 던전 1~5층 × 장비 세팅(없음/T1풀/T3풀/T5풀) sim N번 → 통과율·평균 턴
//   2. 드랍 굴림 분포 — 한 사냥당 장비 드랍 빈도, 풀 가중이 결과에 어떻게 비춰지는지
//   3. 곡선의 명백한 어색함 잡기 (정식 튜닝은 사용자 실측 후 PR-5)
//
// 환경 변수:
//   TRIALS  (기본 500)  trial 수
//   LEVEL   (기본 50)   캐릭 레벨 (단련 0 으로 고정)
//
// 결과는 표 형식으로 stdout.

import { resolveBattle, type PlayerCombat } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { MONSTERS } from "../src/adventure/data/monsters";
import { MAIN_DUNGEON } from "../src/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import {
  dropPoolForDepth,
  rollEquipDrop,
} from "../src/adventure/data/v2/dungeonEquipDrops";
import {
  V2_EQUIPMENT,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipSlot,
  type V2EquipTier,
} from "../src/adventure/data/v2/v2Equipment";
import type { DungeonFloorId } from "../src/adventure/data/v2/types";

const TRIALS = Number(process.env.TRIALS ?? 500);
const LEVEL = Number(process.env.LEVEL ?? 50);
const FLOORS: DungeonFloorId[] = [1, 2, 3, 4, 5, 6, 7, 8];

// 한 티어의 6슬롯 풀세팅. 가장 흔한 빌드: str 무기 / heavy 갑옷·장갑·신발 / 운 반지 / 마법 목걸이.
// PR-4a — v2Equipped 슬롯 맵을 반환(derivePlayerCombatV2Pure 가 위력/무게로 처리).
function loadoutForTier(
  tier: V2EquipTier | null,
): Partial<Record<V2EquipSlot, V2EquipmentId>> {
  if (tier === null) return {};
  const bySlotTier = (slot: V2EquipSlot, concept: V2Equipment["concept"]) =>
    Object.values(V2_EQUIPMENT).find(
      (x) => x.slot === slot && x.concept === concept && x.tier === tier,
    ) ?? null;
  const w = bySlotTier("weapon", "str");
  const armor = bySlotTier("armor", "heavy");
  const gloves = bySlotTier("gloves", "heavy");
  const boots = bySlotTier("boots", "heavy");
  const ring = bySlotTier("ring", "luck");
  const necklace = bySlotTier("necklace", "mana");
  const eq: Partial<Record<V2EquipSlot, V2EquipmentId>> = {};
  if (w) eq.weapon = w.id;
  if (armor) eq.armor = armor.id;
  if (gloves) eq.gloves = gloves.id;
  if (boots) eq.boots = boots.id;
  if (ring) eq.ring = ring.id;
  if (necklace) eq.necklace = necklace.id;
  return eq;
}

function deriveLoadout(tier: V2EquipTier | null): PlayerCombat {
  // 올바른 v2 derive — 단련 0 으로 고정(LEVEL 만, 장비만 변인).
  const d = derivePlayerCombatV2Pure({
    level: LEVEL,
    v2Equipped: loadoutForTier(tier),
  });
  return d.player;
}

function pickRandomEnemy(enemies: readonly string[]): string {
  return enemies[Math.floor(Math.random() * enemies.length)];
}

type CaseResult = {
  trials: number;
  wins: number;
  totalTurns: number;
  totalDmgPerTurn: number;
};

function simBattle(
  tier: V2EquipTier | null,
  floor: DungeonFloorId,
  trials: number,
): CaseResult {
  const floorData = MAIN_DUNGEON.floors.find((f) => f.id === floor);
  if (!floorData) throw new Error(`unknown floor=${floor}`);
  const out: CaseResult = {
    trials,
    wins: 0,
    totalTurns: 0,
    totalDmgPerTurn: 0,
  };
  for (let i = 0; i < trials; i++) {
    const player = deriveLoadout(tier);
    const enemyName = pickRandomEnemy(floorData.enemies.map((e) => e.key));
    const base = MONSTERS[enemyName];
    if (!base) continue;
    const enemy = scaleMonsterForFloor(base, floor);
    const res = resolveBattle(player, enemy, "용사", {
      pickAction: (state) =>
        pickAutoAction(state, { rules: [], potions: {} }),
      potions: {},
    });
    if (res.outcome === "win") out.wins += 1;
    out.totalTurns += res.turns;
    // 평균 dmg/턴 — enemy.hp - finalState.enemyHp / turns
    const dmg = enemy.hp - res.finalState.enemyHp;
    const dpt = res.turns > 0 ? dmg / res.turns : 0;
    out.totalDmgPerTurn += dpt;
  }
  return out;
}

// 드랍 굴림 분포 — 한 사냥당 평균 드랍 빈도 + 티어 분포.
type DropDistribution = {
  trials: number;
  dropped: number;
  byTier: Partial<Record<V2EquipTier, number>>;
};

function simDrops(
  floor: DungeonFloorId,
  trials: number,
  ownedSet: ReadonlySet<V2EquipmentId>,
): DropDistribution {
  const out: DropDistribution = { trials, dropped: 0, byTier: {} };
  for (let i = 0; i < trials; i++) {
    const id = rollEquipDrop(floor, ownedSet, Math.random);
    if (!id) continue;
    out.dropped += 1;
    const tier = V2_EQUIPMENT[id].tier;
    out.byTier[tier] = (out.byTier[tier] ?? 0) + 1;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 1. 통과율·평균 턴 — 장비 세팅 × 층
// ─────────────────────────────────────────────────────────────
console.log(`\n=== 1) 장비 세팅 × 층 — 통과율·평균 턴 (LEVEL=${LEVEL}, TRIALS=${TRIALS}) ===`);
const headers = ["설정", ...FLOORS.map((f) => `F${f}`)];
console.log(headers.map((s) => s.padEnd(14)).join(""));

const setups: { label: string; tier: V2EquipTier | null }[] = [
  { label: "장비없음", tier: null },
  { label: "T1 풀세팅", tier: 1 },
  { label: "T2 풀세팅", tier: 2 },
  { label: "T3 풀세팅", tier: 3 },
];

for (const setup of setups) {
  const row: string[] = [setup.label];
  for (const floor of FLOORS) {
    const r = simBattle(setup.tier, floor, TRIALS);
    const wr = (r.wins / r.trials) * 100;
    const avgT = r.totalTurns / r.trials;
    row.push(`${wr.toFixed(0)}% / ${avgT.toFixed(1)}t`);
  }
  console.log(row.map((s) => s.padEnd(14)).join(""));
}

// ─────────────────────────────────────────────────────────────
// 2. 드랍 분포 — 층별 한 사냥당 드랍 빈도
// ─────────────────────────────────────────────────────────────
console.log(`\n=== 2) 드랍 분포 — 사냥 1회당 드랍 빈도 + 티어 분포 (TRIALS=${TRIALS}) ===`);
console.log("층    chance  실측드랍%  티어 분포");
for (const floor of FLOORS) {
  const pool = dropPoolForDepth(floor);
  const r = simDrops(floor, TRIALS, new Set());
  const actualPct = (r.dropped / r.trials) * 100;
  const tiers = Object.keys(r.byTier)
    .map(Number)
    .sort((a, b) => a - b);
  const tierStr = tiers
    .map((t) => {
      const cnt = r.byTier[t as V2EquipTier] ?? 0;
      const pct = r.dropped > 0 ? ((cnt / r.dropped) * 100).toFixed(0) : "0";
      return `T${t}:${pct}%`;
    })
    .join(" ");
  console.log(
    `F${floor}    ${((pool?.chance ?? 0) * 100).toFixed(0).padEnd(7)}${actualPct.toFixed(1).padEnd(11)}${tierStr}`,
  );
}

// ─────────────────────────────────────────────────────────────
// 3. 풀 마름 — 모든 T1 보유 시 1층 드랍 패턴
// ─────────────────────────────────────────────────────────────
console.log(`\n=== 3) T1 모두 보유 시 1층 드랍 분포 (TRIALS=${TRIALS}) ===`);
const ownedT1 = new Set<V2EquipmentId>();
for (const item of Object.values(V2_EQUIPMENT)) {
  if (item.tier === 1) ownedT1.add(item.id);
}
const r3 = simDrops(1, TRIALS, ownedT1);
const r3Pct = (r3.dropped / r3.trials) * 100;
const r3Tiers = Object.keys(r3.byTier)
  .map(Number)
  .sort((a, b) => a - b)
  .map((t) => `T${t}:${r3.byTier[t as V2EquipTier]}회`);
console.log(
  `드랍 ${r3Pct.toFixed(1)}% (T1 슬롯 잃음 → 풀 마른 시 그 굴림 null)`,
);
console.log(`티어 분포: ${r3Tiers.join(" / ")}`);
console.log(
  `→ 1층 T1 가중 5/9 가 사라지면 실효 chance 가 줄어듦. PR-5 fallback 결정 단서.`,
);

console.log("");
