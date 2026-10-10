// 7차 확장 5종(템페스트·타이탄·룬로드·혈천마신·베히모스) 결정적 밸런스 시뮬레이션.
// 실행: NODE_PATH=./scripts/server-only-stub NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_ATB_SKILLS=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true node --import tsx scripts/sim-v2-tier7-expansion.ts
//
// 실제 서버 능력치 산출(derivePlayerCombatV2FromSaves)로 Lv100·장비 없음 캐릭터를 만들고,
// 같은 능력치 분배에서 7차 고유 패키지와 두 선행 6차 고유 패키지를 비교한다.
// 최대 MP는 항상 실제 값(빙결 추가 피해가 최대 MP에 비례)이다. realMp=false는 평타 행동마다
// MP를 가득 채워 MP 제약을 거의 없앤 화력, true는 직업 MP 풀과 스킬 비용을 그대로 쓴다.

import type { Monster } from "../src/adventure/data/monsters/types";
import { emptyProficiency } from "../src/adventure/data/v2/proficiency";
import { LEGACY_CLASS_SPEC_BY_JOB } from "../src/adventure/data/v2/v2JobCatalog";
import { V2_SKILLS_BY_JOB } from "../src/adventure/data/v2/v2SkillsByJob";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import {
  emptyV2SkillsState,
  spCostOf,
  V2_SKILLS,
  type V2SkillId,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import type { BattleLogEntry, PlayerCombat } from "../src/adventure/v2/combat/engine";
import { resolveBattleAtb } from "../src/adventure/v2/combat/engine.atb";
import { resolveBattlePvPAtb } from "../src/adventure/v2/combat/engine.pvp-atb";
import { derivePlayerCombatV2FromSaves } from "../src/lib/server/derivePlayerCombatV2FromSaves";

const LEVEL = 100;
const DEFAULT_SEEDS = 120;
const SEED_BASE = 20_261_010;
const SAMPLE_SPD = 139;

type Split = Partial<Record<V2StatKey, number>>;

export type ExpansionBuild = {
  id: string;
  label: string;
  jobId: string;
  split: Split;
  skills?: readonly V2SkillId[];
  /** 장착 장비(부위 → 장비 id). 비우면 장비 없음. */
  equipment?: Partial<Record<string, string>>;
};

export type ExpansionCase = {
  id: string;
  label: string;
  sp: number;
  maxMp: number;
  pveLong: number;
  pveLongRealMp: number;
  pveShort: number;
  pvp: number;
  pvpRealMp: number;
  castsPer80: Record<string, number>;
  castsPer80RealMp: Record<string, number>;
};

const INT_SPLIT: Split = { int: 0.6, spi: 0.2, vit: 0.2 };
const TITAN_SPLIT: Split = { vit: 0.5, int: 0.35, spi: 0.15 };
const STR_SPLIT: Split = { str: 0.6, vit: 0.3, spi: 0.1 };
const BEAST_SPLIT: Split = { str: 0.6, dex: 0.2, vit: 0.2 };

export const EXPANSION_GROUPS: readonly { job: string; builds: readonly ExpansionBuild[] }[] = [
  { job: "tempest", builds: [
    { id: "tempest", label: "템페스트 고유", jobId: "tempest", split: INT_SPLIT },
    { id: "stormbringer", label: "스톰브링어 고유", jobId: "stormbringer", split: INT_SPLIT },
    { id: "frostsovereign", label: "빙천제 고유", jobId: "frostsovereign", split: INT_SPLIT },
    { id: "primordialsage", label: "참고: 태초현자 고유", jobId: "primordialsage", split: INT_SPLIT },
  ] },
  { job: "titan", builds: [
    { id: "titan", label: "타이탄 고유", jobId: "titan", split: TITAN_SPLIT },
    { id: "tectomancer", label: "지각술사 고유", jobId: "tectomancer", split: TITAN_SPLIT },
    { id: "eternal", label: "영겁자 고유", jobId: "eternal", split: TITAN_SPLIT },
    { id: "aegis", label: "참고: 이지스 고유", jobId: "aegis", split: TITAN_SPLIT },
  ] },
  { job: "runelord", builds: [
    { id: "runelord", label: "룬로드 고유", jobId: "runelord", split: INT_SPLIT },
    { id: "lawweaver", label: "법칙술사 고유", jobId: "lawweaver", split: INT_SPLIT },
    { id: "archmage", label: "대마도사 고유", jobId: "archmage", split: INT_SPLIT },
    { id: "primordialsage-r", label: "참고: 태초현자 고유", jobId: "primordialsage", split: INT_SPLIT },
  ] },
  { job: "bloodheaven", builds: [
    { id: "bloodheaven", label: "혈천마신 고유", jobId: "bloodheaven", split: STR_SPLIT },
    { id: "blooddemon", label: "혈마 고유", jobId: "blooddemon", split: STR_SPLIT },
    { id: "absolute", label: "절대자 고유", jobId: "absolute", split: STR_SPLIT },
    { id: "ruinblade", label: "참고: 멸검제 고유", jobId: "ruinblade", split: STR_SPLIT },
  ] },
  { job: "behemoth", builds: [
    { id: "behemoth", label: "베히모스 고유", jobId: "behemoth", split: BEAST_SPLIT },
    { id: "primalpredator", label: "원시 포식자 고유", jobId: "primalpredator", split: BEAST_SPLIT },
    { id: "celestialdragon", label: "천룡권성 고유", jobId: "celestialdragon", split: BEAST_SPLIT },
    { id: "dragonlord", label: "참고: 드래곤로드 고유", jobId: "dragonlord", split: BEAST_SPLIT },
  ] },
];

const DUMMY: Monster = {
  name: "결정적 측정 허수아비",
  tags: ["golem"],
  hp: 1_000_000_000,
  atk: 0,
  def: 60,
  magicDef: 60,
  spd: 30,
  directActionSpd: true,
  exp: 0,
};

function allocated(split: Split): Record<V2StatKey, number> {
  const total = (LEVEL - 1) * V2_STAT_POINTS_PER_LEVEL;
  const stats: Record<V2StatKey, number> = { str: 0, dex: 0, vit: 0, int: 0, spi: 0, luk: 0 };
  let used = 0;
  const keys = Object.keys(split) as V2StatKey[];
  keys.forEach((key, index) => {
    const value = index === keys.length - 1 ? total - used : Math.round(total * (split[key] ?? 0));
    stats[key] = value;
    used += value;
  });
  return stats;
}

function skillsOf(build: ExpansionBuild): readonly V2SkillId[] {
  return build.skills ?? V2_SKILLS_BY_JOB[build.jobId];
}

function skillState(skills: readonly V2SkillId[]): V2SkillsState {
  return { ...emptyV2SkillsState(), learned: [...skills], equipped: [...skills] };
}

export function buildExpansionPlayer(build: ExpansionBuild, realMp: boolean): PlayerCombat {
  const legacy = LEGACY_CLASS_SPEC_BY_JOB[build.jobId];
  const grown = allocated(build.split);
  const proficiency = { ...emptyProficiency(), grown, caps: { ...grown } };
  const skills = skillsOf(build);
  const derived = derivePlayerCombatV2FromSaves({
    character: { level: LEVEL, class: legacy.class, specChoice: legacy.spec },
    equipmentSave: build.equipment
      ? {
          owned: Object.values(build.equipment).map((id) => ({ iid: `sim-${id}`, id })),
          equipped: Object.fromEntries(
            Object.entries(build.equipment).map(([slot, id]) => [slot, `sim-${id}`]),
          ),
        }
      : undefined,
    proficiencyRaw: proficiency,
    skillsRaw: skillState(skills),
    includeCookingBuff: false,
  });
  if (!derived) throw new Error(`derive failed: ${build.id}`);
  void realMp;
  const maxMp = derived.player.maxMp ?? 0;
  return {
    ...derived.player,
    hp: derived.maxHp,
    maxMp,
    mp: maxMp,
    spd: SAMPLE_SPD,
    characterElement: "neutral",
  };
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function withSeed<T>(seed: number, run: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

function countCasts(log: readonly BattleLogEntry[], skills: readonly V2SkillId[], side?: "p1"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of skills) {
    const skill = V2_SKILLS[id];
    if (skill.category === "passive") continue;
    out[skill.name] = log.filter((entry) => (!side || entry.side === side) && entry.kind !== "hp_bar" && entry.skillCast?.skillId === id).length;
  }
  return out;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function addCounts(into: Record<string, number>, from: Record<string, number>, seeds: number) {
  for (const [key, value] of Object.entries(from)) into[key] = (into[key] ?? 0) + value / seeds;
}

export function runExpansionPve(build: ExpansionBuild, seeds: number, maxTurns: number, realMp: boolean) {
  return runPve(build, seeds, maxTurns, realMp);
}

export function runExpansionPvp(build: ExpansionBuild, seeds: number, realMp: boolean) {
  return runPvp(build, seeds, realMp);
}

function runPve(build: ExpansionBuild, seeds: number, maxTurns: number, realMp: boolean) {
  const skills = skillsOf(build);
  const samples: number[] = [];
  const casts: Record<string, number> = {};
  for (let index = 0; index < seeds; index += 1) {
    const player = buildExpansionPlayer(build, realMp);
    const result = withSeed(SEED_BASE + index, () =>
      resolveBattleAtb(player, DUMMY, build.label, {
        pickAction: (state) => {
          if (!realMp) state.playerMp = state.playerMaxMp;
          return { kind: "attack" };
        },
        potions: {},
        v2Skills: skillState(skills),
        forceAtbSkills: true,
        maxTurns,
      }),
    );
    samples.push(DUMMY.hp - result.finalState.enemyHp);
    addCounts(casts, countCasts(result.finalState.log, skills), seeds);
  }
  return { mean: mean(samples), casts };
}

function runPvp(build: ExpansionBuild, seeds: number, realMp: boolean) {
  const skills = skillsOf(build);
  const samples: number[] = [];
  for (let index = 0; index < seeds; index += 1) {
    const player = buildExpansionPlayer(build, realMp);
    const base = buildExpansionPlayer({ id: "defender", label: "방어 표본", jobId: "swordsaint", split: STR_SPLIT }, false);
    const defender: PlayerCombat = { ...base, hp: DUMMY.hp, maxHp: DUMMY.hp, atk: 0, magicAtk: 0, spd: SAMPLE_SPD };
    const result = withSeed(SEED_BASE + 7_919 + index, () =>
      resolveBattlePvPAtb(player, defender, build.label, "방어 표본", {
        pickAction: (state, who) => {
          if (!realMp && who === "p1") state.p1.mp = state.p1.maxMp;
          return { kind: "attack" };
        },
        potions: { p1: {}, p2: {} },
        initiativeRoll: 0,
        v2Skills: { p1: skillState(skills), p2: emptyV2SkillsState() },
      }),
    );
    samples.push(defender.maxHp - result.finalState.p2.hp);
  }
  return mean(samples);
}

export function runExpansionCase(build: ExpansionBuild, seeds = DEFAULT_SEEDS): ExpansionCase {
  const skills = skillsOf(build);
  const long = runPve(build, seeds, 80, false);
  const longMp = runPve(build, seeds, 80, true);
  return {
    id: build.id,
    label: build.label,
    sp: skills.reduce((sum, id) => sum + spCostOf(V2_SKILLS[id]), 0),
    maxMp: buildExpansionPlayer(build, true).maxMp ?? 0,
    pveLong: long.mean,
    pveLongRealMp: longMp.mean,
    pveShort: runPve(build, seeds, 12, false).mean,
    pvp: runPvp(build, seeds, false),
    pvpRealMp: runPvp(build, seeds, true),
    castsPer80: long.casts,
    castsPer80RealMp: longMp.casts,
  };
}

export type ExpansionRatio = {
  job: string;
  pveLongRatio: number;
  pvpRatio: number;
  prerequisitePveLong: number;
  corePveLong: number;
};

/** 7차 고유 세트 / 두 선행 6차 고유 세트 중 높은 쪽. MP 제약 없는 80행동 사냥과 PvP를 비교한다. */
export function runTier7ExpansionRatios(seeds = DEFAULT_SEEDS): ExpansionRatio[] {
  return EXPANSION_GROUPS.map((group) => {
    const [core, first, second] = group.builds;
    const long = (build: ExpansionBuild) => runPve(build, seeds, 80, false).mean;
    const pvp = (build: ExpansionBuild) => runPvp(build, seeds, false);
    const prerequisitePveLong = Math.max(long(first), long(second));
    const corePveLong = long(core);
    return {
      job: group.job,
      pveLongRatio: corePveLong / prerequisitePveLong,
      pvpRatio: pvp(core) / Math.max(pvp(first), pvp(second)),
      prerequisitePveLong,
      corePveLong,
    };
  });
}

export function runTier7Expansion(seeds = DEFAULT_SEEDS) {
  return EXPANSION_GROUPS.map((group) => ({
    job: group.job,
    cases: group.builds.map((build) => runExpansionCase(build, seeds)),
  }));
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function main() {
  const seeds = Number(process.env.SEEDS ?? DEFAULT_SEEDS);
  for (const group of runTier7Expansion(seeds)) {
    const [core] = group.cases;
    console.log(`\n## ${group.job}`);
    for (const row of group.cases) {
      const r = (a: number, b: number) => (b > 0 ? (a / b).toFixed(2) : "-");
      console.log(
        [
          row.label.padEnd(16),
          `SP ${row.sp}`,
          `MP ${fmt(row.maxMp)}`,
          `PvE80 ${fmt(row.pveLong)} (${r(row.pveLong, core.pveLong)})`,
          `PvE80실MP ${fmt(row.pveLongRealMp)} (${r(row.pveLongRealMp, row.pveLong)})`,
          `PvE12 ${fmt(row.pveShort)}`,
          `PvP ${fmt(row.pvp)} 실MP ${fmt(row.pvpRealMp)}`,
          `시전 ${JSON.stringify(Object.fromEntries(Object.entries(row.castsPer80).map(([k, v]) => [k, Number(v.toFixed(1))])))}`,
          `실MP시전 ${JSON.stringify(Object.fromEntries(Object.entries(row.castsPer80RealMp).map(([k, v]) => [k, Number(v.toFixed(1))])))}`,
        ].join(" | "),
      );
    }
  }
}

if (process.argv[1]?.endsWith("sim-v2-tier7-expansion.ts")) main();
