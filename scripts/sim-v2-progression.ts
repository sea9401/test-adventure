// v2 진행 시뮬레이션 — 7 archetype × 6 milestone 매트릭스로 derived stats + 던전
// 첫 번째 잡몹 1대1 처치턴/승률 측정.
//
// PR-S1 (×5 스케일) 이후 v2 game 첫 sim. v2Stats.ts (5pt/lv) + V2_BASE_STATS(15) +
// V2_EQUIPMENT(35종, tier-by-level) + derivePlayerCombatV2Pure 기반.
//
// 실행: node --import tsx scripts/sim-v2-progression.ts
//
// 해석 가이드:
//   - 각 줄 = (Arch × Lv) 1조합. 결과는 derive 후 PlayerCombat + 100회 평균 처치턴/승률.
//   - 빌드 간 격차 = 메타 빌드 지배 신호.
//   - turns가 1로 수렴 = 잡몹이 너무 약함 → 다음 층 진입 신호.
//   - wr < 100% = 그 빌드가 그 층 잡몹에서 무너짐.

import { resolveBattle, type PlayerCombat } from "../src/adventure/battle/engine";
import { pickAutoAction } from "../src/adventure/battle/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import { MONSTERS } from "../src/adventure/data/monsters";
import { MAIN_DUNGEON } from "../src/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import { learnedSpellsForInt } from "../src/adventure/data/v2/spells";
import type {
  V2EquipmentId,
  V2EquipSlot,
} from "../src/adventure/data/v2/v2Equipment";
import type { StatKey } from "../src/adventure/data/stats";
import type { Monster } from "../src/adventure/data/monsters/types";

type Arch = "STR" | "DEX" | "VIT" | "SPD" | "LUK" | "INT" | "BAL";
const ARCHES: Arch[] = ["STR", "DEX", "VIT", "SPD", "LUK", "INT", "BAL"];

type Milestone = { lvl: number; floor: 1 | 2 | 3 | 4 | 5 };
const MILESTONES: Milestone[] = [
  { lvl: 3, floor: 1 },
  { lvl: 10, floor: 2 },
  { lvl: 25, floor: 3 },
  { lvl: 50, floor: 4 },
  { lvl: 75, floor: 5 },
  { lvl: 100, floor: 5 },
];

function tierForLevel(level: number): 1 | 2 | 3 | 4 | 5 {
  if (level < 10) return 1;
  if (level < 25) return 2;
  if (level < 50) return 3;
  if (level < 75) return 4;
  return 5;
}

// 무기: STR/VIT/LUK/BAL = sword (str+atk), DEX/SPD = bow (dex+atk+crit), INT = staff
const WEAPON_LINE: Record<"sword" | "bow" | "staff", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  sword: { 1: "v2_iron_sword", 2: "v2_steel_sword", 3: "v2_greatsword", 4: "v2_silver_sword", 5: "v2_mithril_sword" },
  bow: { 1: "v2_wooden_bow", 2: "v2_recurve_bow", 3: "v2_horn_bow", 4: "v2_silver_bow", 5: "v2_starsong_bow" },
  staff: { 1: "v2_oak_staff", 2: "v2_runed_staff", 3: "v2_obsidian_staff", 4: "v2_silver_staff", 5: "v2_starlit_staff" },
};
const ARMOR_LINE: Record<"heavy" | "light", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  heavy: { 1: "v2_chain_mail", 2: "v2_plate_armor", 3: "v2_full_plate", 4: "v2_silver_plate", 5: "v2_mithril_plate" },
  light: { 1: "v2_leather_armor", 2: "v2_studded_leather", 3: "v2_shadow_cloak", 4: "v2_silken_armor", 5: "v2_windweave_cloak" },
};
const ACC_LINE: Record<"luck" | "mana", Record<1 | 2 | 3 | 4 | 5, V2EquipmentId>> = {
  luck: { 1: "v2_silver_ring", 2: "v2_gold_ring", 3: "v2_lucky_charm", 4: "v2_stardust_ring", 5: "v2_fate_ring" },
  mana: { 1: "v2_jade_amulet", 2: "v2_rune_pendant", 3: "v2_crystal_amulet", 4: "v2_starlight_pendant", 5: "v2_mana_essence" },
};

function equipFor(arch: Arch, level: number): Partial<Record<V2EquipSlot, V2EquipmentId>> {
  const tier = tierForLevel(level);
  const weapon =
    arch === "DEX" || arch === "SPD"
      ? WEAPON_LINE.bow[tier]
      : arch === "INT"
        ? WEAPON_LINE.staff[tier]
        : WEAPON_LINE.sword[tier];
  // VIT 와 STR 은 중갑 (vit+def, spd 페널티 감수). 나머지는 경갑.
  const armor =
    arch === "STR" || arch === "VIT" || arch === "LUK"
      ? ARMOR_LINE.heavy[tier]
      : ARMOR_LINE.light[tier];
  const accessory =
    arch === "INT" || arch === "BAL"
      ? ACC_LINE.mana[tier]
      : ACC_LINE.luck[tier];
  return { weapon, armor, accessory };
}

// 분배 — main 60% / sub 30% / 잔여 10% (BAL 만 5스탯 spread).
// sub 는 빌드 성격에 맞게 — STR/VIT/LUK 는 vit (탱크 보강), DEX/SPD 는 spd (다중공격),
// INT 는 vit (마법사도 hp 필요).
function allocate(arch: Arch, level: number): Record<StatKey, number> {
  const total = Math.max(0, level - 1) * V2_STAT_POINTS_PER_LEVEL;
  const a: Record<StatKey, number> = { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 };
  if (total === 0) return a;
  if (arch === "BAL") {
    a.str = Math.round(total * 0.25);
    a.vit = Math.round(total * 0.25);
    a.dex = Math.round(total * 0.2);
    a.luk = Math.round(total * 0.15);
    a.spd = total - a.str - a.vit - a.dex - a.luk;
    return a;
  }
  const main = arch.toLowerCase() as StatKey;
  const sub: StatKey =
    arch === "DEX" || arch === "SPD"
      ? main === "spd" ? "dex" : "spd"
      : main === "vit" ? "str" : "vit";
  a[main] = Math.round(total * 0.6);
  a[sub] = Math.round(total * 0.3);
  // 잔여는 luk (단 main 이 이미 luk 면 dex — sub 는 위 식에서 절대 luk 가 되지 않음).
  const filler: StatKey = main === "luk" ? "dex" : "luk";
  a[filler] = total - a[main] - a[sub];
  return a;
}

function makePlayer(arch: Arch, level: number) {
  const allocated = allocate(arch, level);
  // PR-S3 fix (codex 지적): equippedSpellsRaw 미지정이면 spells 비어 engine cast no-op
  // → INT 빌드가 마법 못 씀. 학습 가능 spell 전체를 raw 로 넘겨 normalize 단계에서 slot
  // cap 까지 자동 채움. INT 0 인 빌드는 learnedSpellsForInt 가 빈 배열 반환해 무영향.
  const intTotal = 0 + (allocated.int ?? 0); // V2_BASE_STATS.int=0, 장비는 derive 내부에서 합산
  // intTotal 은 장비 int 보너스 미포함 — derive 내부 totalStats.int 계산 후 normalize 가
  // 다시 거른다. 여기선 candidate 만 넣어주면 됨.
  const candidateSpells = learnedSpellsForInt(intTotal + 200); // 충분히 큰 값으로 over-supply
  return derivePlayerCombatV2Pure({
    level,
    allocatedStats: allocated,
    v2Equipped: equipFor(arch, level),
    hp: undefined,
    equippedSpellsRaw: candidateSpells,
  });
}

function sampleMonster(floor: 1 | 2 | 3 | 4 | 5): { name: string; monster: Monster } | null {
  const f = MAIN_DUNGEON.floors.find((x) => x.id === floor);
  if (!f || f.enemies.length === 0) return null;
  // 첫 번째 잡몹 — 결정적 표본. 풀 평균 측정은 별 sim.
  const name = f.enemies[0];
  const base = MONSTERS[name];
  if (!base) return null;
  return { name, monster: scaleMonsterForFloor(base, floor) };
}

const TRIALS = 100;
function turnsToKill(player: PlayerCombat, enemy: Monster) {
  let wins = 0;
  let totalTurns = 0;
  for (let i = 0; i < TRIALS; i++) {
    const r = resolveBattle({ ...player, hp: player.maxHp }, enemy, "Sim", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
    });
    if (r.outcome === "win") {
      wins++;
      totalTurns += r.turns;
    }
  }
  return {
    wr: Math.round((wins / TRIALS) * 100),
    avgTurns: wins > 0 ? totalTurns / wins : 0,
  };
}

// ── 실행 ────────────────────────────────────────────────────
console.log("v2 진행 시뮬레이션 — 7 archetype × 6 milestone (×5 스케일)");
console.log(
  `가정: V2_STAT_POINTS_PER_LEVEL=${V2_STAT_POINTS_PER_LEVEL}, 60/30/10 분배(BAL spread), tier-by-level 장비, 첫 잡몹 100회 sim.`,
);

const pad = (s: string | number, w: number) => String(s).padStart(w);
const pct = (n: number) => n.toFixed(1).padStart(5);

for (const ms of MILESTONES) {
  const floorMeta = MAIN_DUNGEON.floors.find((f) => f.id === ms.floor);
  const sample = sampleMonster(ms.floor);
  console.log(
    `\n━━━ Lv${ms.lvl} · ${floorMeta?.name ?? `Floor ${ms.floor}`} (sample: ${sample?.name ?? "n/a"}) ━━━`,
  );
  console.log(
    "Arch  STR DEX VIT SPD LUK INT │ atk def maxHp maxMp crit% eva% acc% extra% │  wr  turns",
  );
  for (const arch of ARCHES) {
    const d = makePlayer(arch, ms.lvl);
    const s = d.totalStats;
    const p = d.player;
    let combatCol = "│   -    -";
    if (sample) {
      const r = turnsToKill(p, sample.monster);
      // wr 0 이면 turns 도 0 으로 나오는데 의미 없음 — "FAIL" 표기.
      // turns 0 (win < 1 cycle, 보통 INT 마법 1발 처치) → "<1".
      const turnsCell =
        r.wr === 0 ? " FAIL" : r.avgTurns < 1 ? "  <1" : r.avgTurns.toFixed(1);
      combatCol = `│ ${pad(r.wr + "%", 4)} ${pad(turnsCell, 5)}`;
    }
    console.log(
      `${arch.padEnd(5)} ${pad(s.str, 3)} ${pad(s.dex, 3)} ${pad(s.vit, 3)} ${pad(s.spd, 3)} ${pad(s.luk, 3)} ${pad(s.int, 3)} │ ${pad(p.atk, 3)} ${pad(p.def, 3)} ${pad(p.maxHp, 5)} ${pad(p.maxMp ?? 0, 5)} ${pct(p.critChancePct ?? 0)} ${pct(p.evasionPct ?? 0)} ${pct(p.accuracyPct ?? 0)} ${pct(p.extraAttackChancePct ?? 0)} ${combatCol}`,
    );
  }
}

console.log(
  "\n해석:\n  - turns: 1대1 처치 평균 turn 수. 작을수록 강함.\n  - wr<100% = 그 빌드가 그 층 첫 잡몹에서 무너짐.\n  - crit/eva/acc/extra 가 float — 0.1%p 해상도 보존된 ×5 결과.\n  - 빌드 간 격차 = 메타 빌드 지배 신호.",
);
