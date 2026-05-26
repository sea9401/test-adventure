// 전술(스탠스)이 보스를 얼마나 쉽게 만드는지 정량 측정 — 일회성 분석용.
// 실행:  npx tsx scripts/sim-stance.ts
//        POWER_MULTS=0.6,1.0 TRIALS=120 npx tsx scripts/sim-stance.ts
//
// 목표: applyStance(없음/공세/수성/처형)를 PlayerCombat 에 적용하고, 실제 보스(후기 솔로 +
//      협동 월드)와 resolveBattle 로 붙여 스탠스별 난이도 지표를 잰다. "없음" 대비 델타로
//      "스탠스가 보스를 얼마나 쉽게 만들었나"를 본다.
//
// 지표:
//   - 솔로 보스: WR(승률) / 처치턴(낮을수록 빠름) / 잔여HP%(높을수록 여유).
//   - 협동 월드 보스(고HP, 한 전투로 못 잡음): 한 전투에 가한 데미지%(높을수록 레이드 빨리 죽음).
//
// 환경 변수: POWER_MULTS(기본 "0.6,1.0") / TRIALS(기본 120) / LEVEL(100) / PT_MULT(1.5)

import { resolveBattle, type PlayerCombat } from "../src/adventure/battle/engine";
import { pickAutoAction } from "../src/adventure/battle/pickAutoAction";
import { derivePlayerCombat } from "../src/adventure/character/derivePlayerCombat";
import { FEAT_NAMES, SKILL_NAMES } from "../src/adventure/character/skills";
import {
  applyStance,
  STANCE_META,
  type StanceId,
} from "../src/adventure/character/stance";
import { COOP_BOSSES } from "../src/adventure/coop/data";
import { ITEMS } from "../src/adventure/data/items";
import { MONSTERS, type Monster } from "../src/adventure/data/monsters";
import type { StatKey } from "../src/adventure/data/stats";

const LEVEL = Number(process.env.LEVEL ?? 100);
const TRIALS = Number(process.env.TRIALS ?? 120);
const PT_MULT = Number(process.env.PT_MULT ?? 1.5);
const POWER_MULTS = (process.env.POWER_MULTS ?? "0.6,1.0")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);

const BASE_STATS: Record<StatKey, number> = { str: 3, dex: 3, vit: 3, spd: 3, luk: 3, int: 3 };
type Archetype = "STR" | "DEX" | "SPD" | "BAL";
const ARCHES: Archetype[] = ["STR", "BAL", "DEX", "SPD"];

// 없음(null) + 3종.
const STANCES: (StanceId | null)[] = [null, "onslaught", "bulwark", "execution"];
const stanceLabel = (s: StanceId | null) => (s ? STANCE_META[s].name : "없음");

// ── 플레이어 빌드 (sim-tower 와 동일 패턴) ─────────────────────────────
function allocate(arch: Archetype, level: number): Record<StatKey, number> {
  const points = Math.round(Math.max(0, level - 1) * PT_MULT);
  const a: Record<StatKey, number> = { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 };
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
const GEAR: Record<Archetype, Gear> = {
  STR: { weapon: "empyrean_blade", armor: "empyrean_mantle", accessory: "apex_regalia" },
  DEX: { weapon: "empyrean_grip", armor: "empyrean_mantle", accessory: "apex_regalia" },
  SPD: { weapon: "empyrean_lance", armor: "empyrean_mantle", accessory: "apex_regalia" },
  BAL: { weapon: "empyrean_blade", armor: "empyrean_mantle", accessory: "apex_regalia" },
};
function fallbackGear(g: Gear): Gear {
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
function makePlayer(arch: Archetype, powerMult: number): PlayerCombat {
  const gear = fallbackGear(GEAR[arch]);
  const bump = (it: (typeof ITEMS)[keyof typeof ITEMS], main: "atk" | "def") => {
    const b = { ...(it.bonus ?? {}) } as Record<string, number>;
    b[main] = (b[main] ?? 0) + 2;
    for (const k of ["str", "dex", "vit", "spd", "luk"]) {
      if (k !== main && (b[k] ?? 0) > 0) {
        b[k] = (b[k] ?? 0) + 2;
        break;
      }
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
  const d = derivePlayerCombat({
    level: LEVEL,
    baseStats: BASE_STATS,
    allocatedStats: allocate(arch, LEVEL),
    equipped: {
      weapon: bump(ITEMS[gear.weapon], "atk"),
      armor: bump(ITEMS[gear.armor], "def"),
      accessory: ITEMS[gear.accessory],
    },
    equippedSkills: skillsFor(arch),
    equippedFeats: featsFor(arch),
    storyFlagIds: flags,
    hp: 99999,
  });
  // powerMult 는 클램프하지 않는다 — <1 로 두면 보스와 박빙이 돼 WR 변별이 생긴다.
  const m = powerMult;
  return {
    ...d.player,
    atk: Math.round(d.player.atk * m),
    def: Math.round(d.player.def * m),
    maxHp: Math.round(d.player.maxHp * m),
  };
}

// ── 보스 목록 ──────────────────────────────────────────────────────────
// 솔로: 후기 region 보스(MONSTERS 정의 그대로). 협동: 월드 보스(COOP_BOSSES maxHp 오버라이드).
const SOLO_BOSSES = ["별을 지키는 자", "천공인의 왕", "순례자의 분신", "창공의 주재"];
const COOP_WORLD = Object.values(COOP_BOSSES)
  .filter((b) => b?.isWorldBoss)
  .map((b) => ({ name: b!.monsterName, maxHp: b!.maxHp }));

function soloEnemy(name: string): Monster {
  return MONSTERS[name];
}
function coopEnemy(name: string, maxHp: number): Monster {
  return { ...MONSTERS[name], hp: maxHp };
}

const noPotion = {
  potions: {},
  pickAction: (s: Parameters<typeof pickAutoAction>[0]) =>
    pickAutoAction(s, { rules: [], potions: {} }),
};

type Agg = { wins: number; turns: number; hpPctLeft: number; dmgPct: number; n: number };
function fresh(): Agg {
  return { wins: 0, turns: 0, hpPctLeft: 0, dmgPct: 0, n: 0 };
}

function runMatchup(
  player: PlayerCombat,
  enemy: Monster,
  stance: StanceId | null,
  agg: Agg,
): void {
  const enemyMaxHp = enemy.hp; // 입력 정의 hp = 그 전투의 최대 HP.
  const p = applyStance({ ...player, hp: player.maxHp }, stance);
  const r = resolveBattle({ ...p, hp: p.maxHp }, enemy, "p", { ...noPotion, isBoss: true });
  agg.n += 1;
  if (r.outcome === "win") {
    agg.wins += 1;
    agg.turns += r.turns;
    agg.hpPctLeft += (r.finalState.playerHp / r.finalState.playerMaxHp) * 100;
  }
  const dealt = enemyMaxHp - r.finalState.enemyHp;
  agg.dmgPct += (dealt / enemyMaxHp) * 100;
}

function pad(s: string | number, n: number, left = false): string {
  const str = String(s);
  return left ? str.padStart(n) : str.padEnd(n);
}

console.log(`\n전술(스탠스) 보스 난이도 영향 측정`);
console.log(`Lv${LEVEL} 풀스펙(empyrean) · 4직업 평균 · TRIALS=${TRIALS}/직업 · POWER_MULTS=${POWER_MULTS.join(",")}`);
console.log(`솔로: WR/처치턴/잔여HP% · 협동월드: 가한뎀%(한 전투). 괄호 = '없음' 대비 델타.\n`);

for (const power of POWER_MULTS) {
  console.log(`\n══ POWER_MULT ×${power} ══`);

  // 솔로 보스
  for (const bossName of SOLO_BOSSES) {
    if (!MONSTERS[bossName]) {
      console.log(`  (보스 없음: ${bossName})`);
      continue;
    }
    console.log(`\n  [솔로] ${bossName}`);
    console.log(`    ${pad("전술", 8)}${pad("WR%", 8, true)}${pad("처치턴", 9, true)}${pad("잔여HP%", 10, true)}`);
    const base: Record<string, Agg> = {};
    for (const stance of STANCES) {
      const agg = fresh();
      for (const arch of ARCHES) {
        const player = makePlayer(arch, power);
        for (let t = 0; t < TRIALS; t++) runMatchup(player, soloEnemy(bossName), stance, agg);
      }
      base[stanceLabel(stance)] = agg;
      const wr = (agg.wins / agg.n) * 100;
      const turns = agg.wins ? agg.turns / agg.wins : NaN;
      const hp = agg.wins ? agg.hpPctLeft / agg.wins : NaN;
      const noneA = base["없음"];
      const dWr = stance === null ? "" : ` (${(wr - (noneA.wins / noneA.n) * 100 >= 0 ? "+" : "")}${(wr - (noneA.wins / noneA.n) * 100).toFixed(0)})`;
      const dTurn =
        stance === null || !agg.wins || !noneA.wins
          ? ""
          : ` (${(turns - noneA.turns / noneA.wins) <= 0 ? "" : "+"}${(turns - noneA.turns / noneA.wins).toFixed(1)})`;
      console.log(
        `    ${pad(stanceLabel(stance), 8)}${pad(wr.toFixed(0) + dWr, 8, true)}${pad(isNaN(turns) ? "-" : turns.toFixed(1) + dTurn, 9 + dTurn.length, true)}${pad(isNaN(hp) ? "-" : hp.toFixed(0), 10, true)}`,
      );
    }
  }

  // 협동 월드 보스 — 가한 데미지%
  for (const { name, maxHp } of COOP_WORLD) {
    if (!MONSTERS[name]) continue;
    console.log(`\n  [협동월드] ${name} (HP ${maxHp.toLocaleString()})`);
    console.log(`    ${pad("전술", 8)}${pad("가한뎀%", 10, true)}${pad("vs없음", 9, true)}`);
    let noneDmg = 0;
    for (const stance of STANCES) {
      const agg = fresh();
      for (const arch of ARCHES) {
        const player = makePlayer(arch, power);
        for (let t = 0; t < TRIALS; t++) runMatchup(player, coopEnemy(name, maxHp), stance, agg);
      }
      const dmg = agg.dmgPct / agg.n;
      if (stance === null) noneDmg = dmg;
      const delta = stance === null ? "" : `${dmg - noneDmg >= 0 ? "+" : ""}${(((dmg - noneDmg) / noneDmg) * 100).toFixed(0)}%`;
      console.log(`    ${pad(stanceLabel(stance), 8)}${pad(dmg.toFixed(2), 10, true)}${pad(delta, 9, true)}`);
    }
  }
}
console.log("");
