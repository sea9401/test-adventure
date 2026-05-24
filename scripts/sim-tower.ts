// 고탑(엔드컨텐츠 PR-1) 스케일링 곡선 시뮬레이션 — 일회성 분석용.
// 실행:  npx tsx scripts/sim-tower.ts
//
// 목표: HP/ATK/DEF 를 층 함수로 스케일링한 상태에서 만렙 풀스펙 플레이어의 층별 승률
//      곡선이 어떻게 나오는지 본다. "~80층에서 WR 50%" 가 1차 튜닝 목표 (Lv70 기준).
//
// 모델:
//  - 1 시도 = 1 층 1 전투. 매 전투 HP 풀회복 (체크포인트 정책 단순화).
//  - 실 게임의 floor pool 매핑(src/adventure/tower/floorPools) + 스케일링
//    (src/adventure/tower/scaling) 그대로 호출 — 시뮬과 실제가 분기되지 않게.
//  - 잡몹 층은 풀에서 균등 무작위 선택, 보스 층은 결정적 BOSS_SLOTS 매핑.
//  - TRIALS 회 매번 새 적을 뽑아 평균 승률.
//
// 환경 변수:
//   LEVEL          기본 100 (만렙). 70 으로 두면 PR-1 메모와 동일.
//   TRIALS         층당 시도 횟수, 기본 60
//   MAX_FLOOR      탐색 상한 층, 기본 150
//   FLOOR_STEP     5 (5층 단위 출력)
//   PT_MULT        레벨당 스탯 포인트 배수, 기본 1.5
//   QUAL           1=풀스펙 장비 보정 (atk/def +2), 0=베이스. 기본 1.
//   POWER_MULTS    "1,1.25,1.5" 같은 콤마 구분. 플레이어 atk/def/hp 평탄 배수.

import { resolveBattle, type PlayerCombat } from "../src/adventure/battle/engine";
import { pickAutoAction } from "../src/adventure/battle/pickAutoAction";
import { derivePlayerCombat } from "../src/adventure/character/derivePlayerCombat";
import { FEAT_NAMES, SKILL_NAMES } from "../src/adventure/character/skills";
import { ITEMS } from "../src/adventure/data/items";
import { MONSTERS, type Monster } from "../src/adventure/data/monsters";
import type { StatKey } from "../src/adventure/data/stats";
import {
  PARAGON_TRACK_CAP,
  type ParagonTrackKey,
} from "../src/lib/paragon";
import type { EquippedRune, RuneGrade } from "../src/adventure/data/runes";
import type { EnchantSlot } from "../src/adventure/character/enchant";
import {
  BOSS_SLOTS,
  bossBaseMonster,
  bossDisplayName,
  bossSlotForFloor,
  mobPoolForFloor,
  pickMobFromPool,
} from "../src/adventure/tower/floorPools";
import {
  TOWER_ACC_BOSS_MULT,
  TOWER_ACC_PER_FLOOR,
  TOWER_ACC_START_FLOOR,
  isBossFloor,
  scaledStats,
} from "../src/adventure/tower/scaling";

const LEVEL = Number(process.env.LEVEL ?? 100);
const TRIALS = Number(process.env.TRIALS ?? 60);
const MAX_FLOOR = Number(process.env.MAX_FLOOR ?? 150);
const FLOOR_STEP = Number(process.env.FLOOR_STEP ?? 5);
const PT_MULT = Number(process.env.PT_MULT ?? 1.5);
const QUAL = process.env.QUAL !== "0";
// 실제 만렙 파워 보정(2026-05-23) — 과거 sim 빌드엔 파라곤/룬/부여가 빠져 ×1.0 이 실유저보다
// 약했다(sim 이 tower F80 보스도 0% 인데 실유저는 F89=F80 클리어). 이 셋을 반영해 현실 앵커
// "만렙 = F90 보스 벽" 에 맞춘다. 0 으로 끄면 옛 베이스라인.
const PARAGON_PTS = Number(process.env.PARAGON_PTS ?? 60); // 전투 트랙 분배 총 포인트
const RUNE_GRADE = Number(process.env.RUNE_GRADE ?? 4); // 룬 3슬롯 등급(0=룬 없음)
const ENCHANT = process.env.ENCHANT !== "0"; // 부여 슬롯 채움

// 전투 파라곤 트랙(자원 fortune 제외)에 라운드로빈 분배, 트랙당 PARAGON_TRACK_CAP(25) 캡.
function buildParagon(pts: number): Partial<Record<ParagonTrackKey, number>> {
  const order: ParagonTrackKey[] = ["wrath", "vigor", "guard", "precision", "blast"];
  const alloc: Partial<Record<ParagonTrackKey, number>> = {};
  let left = Math.max(0, Math.min(pts, order.length * PARAGON_TRACK_CAP));
  let i = 0;
  while (left > 0 && order.some((k) => (alloc[k] ?? 0) < PARAGON_TRACK_CAP)) {
    const k = order[i % order.length];
    if ((alloc[k] ?? 0) < PARAGON_TRACK_CAP) {
      alloc[k] = (alloc[k] ?? 0) + 1;
      left--;
    }
    i++;
  }
  return alloc;
}

// 3 슬롯 전투 룬(공격·생명·치명) at RUNE_GRADE. 0 이면 룬 없음.
function buildRunes(): (EquippedRune | null)[] | undefined {
  if (RUNE_GRADE <= 0) return undefined;
  const g = Math.min(6, Math.max(1, RUNE_GRADE)) as RuneGrade;
  return [
    { id: "rune_attack", grade: g },
    { id: "rune_life", grade: g },
    { id: "rune_crit", grade: g },
  ];
}

// +7 자루(부여 3슬롯) 가정 — 무기 공격형, 방어구 생존형. ENCHANT=0 이면 빈 칸.
const WEAPON_ENCHANT: EnchantSlot[] = ENCHANT
  ? [
      { affixId: "might", value: 9 },
      { affixId: "might", value: 7 },
      { affixId: "swift", value: 6 },
    ]
  : [];
const ARMOR_ENCHANT: EnchantSlot[] = ENCHANT
  ? [
      { affixId: "endure", value: 8 },
      { affixId: "insight", value: 3 },
      { affixId: "insight", value: 3 },
    ]
  : [];
const POWER_MULTS = (process.env.POWER_MULTS ?? "1,1.25")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);
const SIM_ACC_START_FLOOR = Number(
  process.env.TOWER_ACC_START_FLOOR ?? TOWER_ACC_START_FLOOR,
);
const SIM_ACC_PER_FLOOR = Number(
  process.env.TOWER_ACC_PER_FLOOR ?? TOWER_ACC_PER_FLOOR,
);
const SIM_ACC_BOSS_MULT = Number(
  process.env.TOWER_ACC_BOSS_MULT ?? TOWER_ACC_BOSS_MULT,
);

const BASE_STATS: Record<StatKey, number> = { str: 3, dex: 3, vit: 3, spd: 3, luk: 3 };
type Archetype = "STR" | "DEX" | "SPD" | "BAL";
type AccConfig = { start: number; per: number; bossMult: number };
let activeAccConfig: AccConfig = {
  start: SIM_ACC_START_FLOOR,
  per: SIM_ACC_PER_FLOOR,
  bossMult: SIM_ACC_BOSS_MULT,
};

function simTowerEnemyAccuracy(floor: number, isBoss: boolean): number {
  if (floor <= activeAccConfig.start) return 0;
  const base = (floor - activeAccConfig.start) * activeAccConfig.per;
  return Math.round(base * (isBoss ? activeAccConfig.bossMult : 1));
}

function sampledFloors(maxFloor: number, floorStep: number): number[] {
  const floors = new Set<number>();
  for (let f = 1; f <= maxFloor; f += floorStep) floors.add(f);
  for (let f = 1; f <= maxFloor; f += 1) {
    if (isBossFloor(f)) floors.add(f);
  }
  return [...floors].sort((a, b) => a - b);
}

// ── 플레이어 빌드 ─────────────────────────────────────────────────────
function allocate(arch: Archetype, level: number): Record<StatKey, number> {
  const points = Math.round(Math.max(0, level - 1) * PT_MULT);
  const a: Record<StatKey, number> = { str: 0, dex: 0, vit: 0, spd: 0, luk: 0 };
  let left = points;
  const give = (k: StatKey, n: number) => {
    const v = Math.max(0, Math.min(left, n));
    a[k] += v;
    left -= v;
  };
  if (arch === "BAL") {
    give("str", Math.round(points * 0.3));
    give("vit", Math.round(points * 0.25));
    give("dex", Math.round(points * 0.18));
    give("spd", Math.round(points * 0.15));
    give("luk", left);
    return a;
  }
  const main: StatKey = arch === "STR" ? "str" : arch === "DEX" ? "dex" : "spd";
  const sub: StatKey = arch === "STR" ? "spd" : arch === "DEX" ? "spd" : "str";
  give(main, Math.round(points * 0.5));
  give("vit", Math.round(points * 0.32));
  give(sub, Math.round(points * 0.12));
  give(main, left);
  return a;
}

type Gear = { weapon: keyof typeof ITEMS; armor: keyof typeof ITEMS; accessory: keyof typeof ITEMS };

// 천공 라인 엔드 — 창공 시리즈 (Lv90 풀스펙).
const GEAR: Record<Archetype, Gear> = {
  STR: { weapon: "empyrean_blade", armor: "empyrean_mantle", accessory: "apex_regalia" },
  DEX: { weapon: "empyrean_grip", armor: "empyrean_mantle", accessory: "apex_regalia" },
  SPD: { weapon: "empyrean_lance", armor: "empyrean_mantle", accessory: "apex_regalia" },
  BAL: { weapon: "empyrean_blade", armor: "empyrean_mantle", accessory: "apex_regalia" },
};

function fallbackGear(g: Gear): Gear {
  // 새 brand-new id 가 ITEMS 에 없으면 안전 폴백 — 직전 시리즈(volcano).
  return {
    weapon: g.weapon in ITEMS ? g.weapon : "volcano_sword",
    armor: g.armor in ITEMS ? g.armor : "volcano_armor",
    accessory: g.accessory in ITEMS ? g.accessory : "volcano_core",
  };
}

function skillsFor(arch: Archetype): string[] {
  if (arch === "STR") return [SKILL_NAMES.POWER_ATTACK, SKILL_NAMES.CRUSH, SKILL_NAMES.EXECUTION];
  if (arch === "DEX") return [SKILL_NAMES.EVADE, SKILL_NAMES.COUNTER, SKILL_NAMES.PRECISION];
  if (arch === "SPD") return [SKILL_NAMES.DOUBLE_STRIKE, SKILL_NAMES.VANGUARD, SKILL_NAMES.LIGHTSPEED];
  return [SKILL_NAMES.POWER_ATTACK, SKILL_NAMES.GUARD, SKILL_NAMES.CRUSH];
}
function featsFor(arch: Archetype): (string | null)[] {
  if (arch === "STR") return [FEAT_NAMES.BERSERKER];
  if (arch === "DEX") return [FEAT_NAMES.ACROBAT];
  if (arch === "SPD") return [FEAT_NAMES.GUST_BLADE];
  return [FEAT_NAMES.LIFESTEAL];
}

function makePlayer(arch: Archetype, powerMult: number) {
  const gear = fallbackGear(GEAR[arch]);
  const bump = (it: typeof ITEMS[keyof typeof ITEMS], main: "atk" | "def") => {
    if (!QUAL) return it;
    const b = { ...(it.bonus ?? {}) } as Record<string, number>;
    b[main] = (b[main] ?? 0) + 2;
    for (const k of ["str", "dex", "vit", "spd", "luk"]) {
      if (k !== main && (b[k] ?? 0) > 0) { b[k] = (b[k] ?? 0) + 2; break; }
    }
    return { ...it, bonus: b };
  };
  const flags = new Set<string>([
    "peak_giant_defeated",
    "volcano_heart_defeated",
    "starspire_keeper_defeated",
    "skyfolk_king_defeated",
    "endgame_apex_defeated",
  ]);
  const withEnchant = (
    it: typeof ITEMS[keyof typeof ITEMS],
    slots: EnchantSlot[],
  ) => (slots.length > 0 ? { ...it, enchantSlots: slots } : it);
  const d = derivePlayerCombat({
    level: LEVEL,
    baseStats: BASE_STATS,
    allocatedStats: allocate(arch, LEVEL),
    equipped: {
      weapon: withEnchant(bump(ITEMS[gear.weapon], "atk"), WEAPON_ENCHANT),
      armor: withEnchant(bump(ITEMS[gear.armor], "def"), ARMOR_ENCHANT),
      accessory: ITEMS[gear.accessory],
    },
    equippedSkills: skillsFor(arch),
    equippedFeats: featsFor(arch),
    storyFlagIds: flags,
    paragonAllocations: buildParagon(PARAGON_PTS),
    equippedRunes: buildRunes(),
    hp: 99999,
  });
  const m = Math.max(1, powerMult);
  const combat: PlayerCombat = {
    ...d.player,
    atk: Math.round(d.player.atk * m),
    def: Math.round(d.player.def * m),
    maxHp: Math.round(d.player.maxHp * m),
  };
  return { combat };
}

// ── 적 빌드 (실제 floor pool + scaling 호출) ─────────────────────────
function buildFloorEnemy(floor: number): Monster {
  const slot = bossSlotForFloor(floor);
  if (slot) {
    const base = bossBaseMonster(slot);
    const s = scaledStats(base, floor, slot.bossMultiplier);
    return {
      ...base,
      name: bossDisplayName(slot),
      hp: s.hp,
      atk: s.atk,
      def: s.def,
      spd: s.spd,
      accuracy: simTowerEnemyAccuracy(floor, true),
    };
  }
  const pool = mobPoolForFloor(floor);
  let baseName: string;
  if (pool.length === 0) {
    baseName = bossBaseMonster(BOSS_SLOTS[0]).name;
  } else {
    baseName = pickMobFromPool(pool);
  }
  const base = MONSTERS[baseName] ?? MONSTERS[pool[0]] ?? bossBaseMonster(BOSS_SLOTS[0]);
  const s = scaledStats(base, floor);
  return {
    ...base,
    hp: s.hp,
    atk: s.atk,
    def: s.def,
    spd: s.spd,
    accuracy: simTowerEnemyAccuracy(floor, false),
  };
}

// ── 매치업 ─────────────────────────────────────────────────────────────
function fight(combat: PlayerCombat, enemy: Monster, isBoss: boolean): boolean {
  const r = resolveBattle({ ...combat, hp: combat.maxHp }, enemy, "p", {
    potions: {},
    pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
    isBoss,
  });
  return r.outcome === "win";
}

function winRate(combat: PlayerCombat, floor: number): number {
  const isBoss = isBossFloor(floor);
  let w = 0;
  for (let i = 0; i < TRIALS; i += 1) {
    // 잡몹층은 매 시도마다 풀에서 새 적 추출 — 풀 다양성을 포함한 평균 WR.
    const enemy = buildFloorEnemy(floor);
    if (fight(combat, enemy, isBoss)) w += 1;
  }
  return w / TRIALS;
}

// ── 실행 ───────────────────────────────────────────────────────────────
function bossWall(combat: PlayerCombat): number | null {
  const minBossFloor = Number(process.env.SWEEP_MIN_BOSS_FLOOR ?? 90);
  const firstBossFloor = Math.max(10, Math.ceil(minBossFloor / 10) * 10);
  for (let f = firstBossFloor; f <= MAX_FLOOR; f += 10) {
    if (winRate(combat, f) < 0.5) return f;
  }
  return null;
}

function fmtWalls(walls: (number | null)[]): string {
  return walls.map((w) => w ?? ">").join("/");
}

if (process.env.SWEEP_ACC === "1") {
  const starts = [85, 88, 90, 92, 95];
  const pers = [1.5, 2.0, 2.5, 3.0];
  const bossMults = [1.5, 2.0, 2.5];
  const powers = POWER_MULTS.length > 0 ? POWER_MULTS : [1.25, 1.5, 1.75];

  console.log(
    `START | PER | BOSS_MULT | DEX wall | STR wall | BAL wall | SPD wall | verdict`,
  );
  for (const start of starts) {
    for (const per of pers) {
      for (const bossMult of bossMults) {
        activeAccConfig = { start, per, bossMult };
        const walls: Record<Archetype, (number | null)[]> = {
          STR: [],
          BAL: [],
          DEX: [],
          SPD: [],
        };
        for (const power of powers) {
          for (const arch of ["STR", "BAL", "DEX", "SPD"] as Archetype[]) {
            walls[arch].push(bossWall(makePlayer(arch, power).combat));
          }
        }
        const aOk = start >= 90;
        const bOk = powers.every((_, i) => {
          const dex = walls.DEX[i] ?? MAX_FLOOR + 10;
          const nonDex = [walls.STR[i], walls.BAL[i], walls.SPD[i]].map(
            (w) => w ?? MAX_FLOOR + 10,
          );
          const bestNonDex = Math.max(...nonDex);
          return dex >= bestNonDex && dex - bestNonDex <= 10;
        });
        console.log(
          `${String(start).padStart(5)} | ${per.toFixed(1).padStart(3)} | ${bossMult.toFixed(1).padStart(9)} | ${fmtWalls(walls.DEX).padStart(8)} | ${fmtWalls(walls.STR).padStart(8)} | ${fmtWalls(walls.BAL).padStart(8)} | ${fmtWalls(walls.SPD).padStart(8)} | ${aOk ? "A ok" : "A fail"} / ${bOk ? "B ok" : "B fail"}`,
        );
      }
    }
  }
  process.exit(0);
}

console.log(`\n고탑 스케일링 시뮬레이션 (floorPools + scaling 실 모듈 호출)`);
console.log(`Lv${LEVEL} 풀스펙 (PT_MULT=${PT_MULT}, QUAL=${QUAL ? "ON" : "OFF"})  TRIALS=${TRIALS}  층 1..${MAX_FLOOR} step ${FLOOR_STEP}`);
console.log(`ACC START=${SIM_ACC_START_FLOOR} PER=${SIM_ACC_PER_FLOOR} BOSS_MULT=${SIM_ACC_BOSS_MULT}`);
console.log(`목표: ~80층에서 평균 WR 50% 부근 (Lv70 기준 — 그 위 레벨은 더 위로 밀려야 정상)`);

type Threshold = { wr95?: number; wr50?: number; wr10?: number };
type ScenarioSummary = { power: number; thr: Threshold; strThr: Threshold };
const summaries: ScenarioSummary[] = [];

for (const power of POWER_MULTS) {
  console.log(`\n\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  POWER_MULT = ×${power.toFixed(2)}  (만렙 확장/신규 아이템 효과 근사)  ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  const players: Record<Archetype, { combat: PlayerCombat }> = {} as Record<
    Archetype,
    { combat: PlayerCombat }
  >;
  for (const arch of ["STR", "BAL", "DEX", "SPD"] as Archetype[]) {
    const p = makePlayer(arch, power);
    players[arch] = p;
    const c = p.combat;
    console.log(
      `  [${arch}] atk${c.atk} def${c.def} hp${c.maxHp} eva${c.evasionPct.toFixed(0)}% extra${(c.extraAttackChancePct ?? 0).toFixed(0)}% crit${(c.critChancePct ?? 0).toFixed(0)}%`,
    );
  }

  console.log(
    `\n  ${"층".padStart(3)}   ${"STR".padStart(5)}  ${"BAL".padStart(5)}  ${"DEX".padStart(5)}  ${"SPD".padStart(5)}  ${"평균".padStart(5)}  비고`,
  );
  const thr: Threshold = {};
  const strThr: Threshold = {};
  let prev: number | null = null;
  for (const f of sampledFloors(MAX_FLOOR, FLOOR_STEP)) {
    const wrs: Record<Archetype, number> = { STR: 0, BAL: 0, DEX: 0, SPD: 0 };
    for (const arch of ["STR", "BAL", "DEX", "SPD"] as Archetype[]) {
      wrs[arch] = winRate(players[arch].combat, f);
    }
    const avg = (wrs.STR + wrs.BAL + wrs.DEX + wrs.SPD) / 4;
    if (thr.wr95 == null && avg < 0.95) thr.wr95 = f;
    if (thr.wr50 == null && avg < 0.5) thr.wr50 = f;
    if (thr.wr10 == null && avg < 0.1) thr.wr10 = f;
    if (strThr.wr95 == null && wrs.STR < 0.95) strThr.wr95 = f;
    if (strThr.wr50 == null && wrs.STR < 0.5) strThr.wr50 = f;
    if (strThr.wr10 == null && wrs.STR < 0.1) strThr.wr10 = f;
    const mark = isBossFloor(f) ? "★보스" : "";
    const delta = prev != null && avg < prev - 0.2 ? "↓↓" : prev != null && avg > prev + 0.1 ? "↑" : "";
    console.log(
      `  ${String(f).padStart(3)}   ${(wrs.STR * 100).toFixed(0).padStart(4)}%  ${(wrs.BAL * 100).toFixed(0).padStart(4)}%  ${(wrs.DEX * 100).toFixed(0).padStart(4)}%  ${(wrs.SPD * 100).toFixed(0).padStart(4)}%  ${(avg * 100).toFixed(0).padStart(4)}%  ${mark} ${delta}`,
    );
    prev = avg;
    if (process.env.NO_EARLY_BREAK !== "1" && avg < 0.02 && wrs.STR < 0.02) break;
  }
  console.log(
    `  요약 평균: WR<95% ${thr.wr95 ?? "—"}, WR<50% ${thr.wr50 ?? "—"}, WR<10% ${thr.wr10 ?? "—"}`,
  );
  console.log(
    `  요약 STR:  WR<95% ${strThr.wr95 ?? "—"}, WR<50% ${strThr.wr50 ?? "—"}, WR<10% ${strThr.wr10 ?? "—"}`,
  );
  summaries.push({ power, thr, strThr });
}

console.log(`\n\n════════════ 전체 시나리오 요약 (Lv${LEVEL}) ════════════`);
console.log(`  ${"power".padStart(5)}    평균 WR<95/<50/<10      STR WR<95/<50/<10`);
for (const s of summaries) {
  console.log(
    `  ${`×${s.power.toFixed(2)}`.padStart(5)}    ${`${s.thr.wr95 ?? "—"}/${s.thr.wr50 ?? "—"}/${s.thr.wr10 ?? "—"}`.padStart(14)}    ${`${s.strThr.wr95 ?? "—"}/${s.strThr.wr50 ?? "—"}/${s.strThr.wr10 ?? "—"}`.padStart(14)}`,
  );
}
