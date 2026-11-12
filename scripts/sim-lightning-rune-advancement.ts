// 전격 마법사·룬 기사 5·6차 밸런스 비교. 7차 확장 시뮬레이션과 같은 측정(Lv100·장비 없음·실제 서버 능력치 산출)을 쓴다.
// 실행: NODE_PATH=./scripts/server-only-stub NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_ATB_SKILLS=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true node --import tsx scripts/sim-lightning-rune-advancement.ts
//
// 각 계보의 4차부터 해당 차수까지 고유 스킬을 모두 장착한 "계보 세트"끼리 비교한다.
// 80행동 사냥(MP 제약 없음·실제 MP), 12행동 사냥, PvP 직접 피해를 같은 능력치 분배에서 잰다.

import { V2_SKILLS_BY_JOB } from "../src/adventure/data/v2/v2SkillsByJob";
import type { V2SkillId } from "../src/adventure/data/v2/v2Skills";
import { runExpansionCase, runExpansionPve, runExpansionPvp, type ExpansionBuild } from "./sim-v2-tier7-expansion";

const INT_SPLIT = { int: 0.6, spi: 0.2, vit: 0.2 };
const STR_SPLIT = { str: 0.6, vit: 0.3, spi: 0.1 };
const HYBRID_SPLIT = { str: 0.4, int: 0.4, vit: 0.2 };

const line = (...jobs: string[]): V2SkillId[] => jobs.flatMap((job) => V2_SKILLS_BY_JOB[job]);
const build = (label: string, jobs: string[], split: ExpansionBuild["split"]): ExpansionBuild => ({
  id: jobs.join("+"),
  label,
  jobId: jobs[jobs.length - 1],
  split,
  skills: line(...jobs),
});

export const LIGHTNING_RUNE_GROUPS: readonly { title: string; builds: readonly ExpansionBuild[] }[] = [
  { title: "마법 4차 기준선", builds: [
    build("전격 4차", ["lightningmage"], INT_SPLIT),
    build("화염 4차", ["firemage"], INT_SPLIT),
    build("냉기 4차", ["frostmage"], INT_SPLIT),
    build("바람 4차", ["windmage"], INT_SPLIT),
    build("비전 4차", ["sage"], INT_SPLIT),
  ] },
  { title: "마법 5차 계보 세트", builds: [
    build("전격 5차", ["lightningmage", "electromancer"], INT_SPLIT),
    build("화염 5차", ["firemage", "pyromancer"], INT_SPLIT),
    build("냉기 5차", ["frostmage", "cryomancer"], INT_SPLIT),
    build("바람 5차", ["windmage", "aeromancer"], INT_SPLIT),
    build("비전 5차", ["sage", "arcanist"], INT_SPLIT),
  ] },
  { title: "마법 6차 계보 세트", builds: [
    build("전격 6차", ["lightningmage", "electromancer", "thundersovereign"], INT_SPLIT),
    build("화염 6차", ["firemage", "pyromancer", "infernomancer"], INT_SPLIT),
    build("냉기 6차", ["frostmage", "cryomancer", "frostsovereign"], INT_SPLIT),
    build("바람 6차", ["windmage", "aeromancer", "stormbringer"], INT_SPLIT),
    build("비전 6차", ["sage", "arcanist", "archmage"], INT_SPLIT),
  ] },
  { title: "전사 4차 기준선", builds: [
    build("마검 4차", ["runeknight"], HYBRID_SPLIT),
    build("검 4차", ["veteran"], STR_SPLIT),
    build("용 4차", ["drakeblood"], STR_SPLIT),
  ] },
  { title: "전사 5차 계보 세트", builds: [
    build("마검 5차", ["runeknight", "spellswordmaster"], HYBRID_SPLIT),
    build("검 5차", ["veteran", "swordmaster"], STR_SPLIT),
    build("용 5차", ["drakeblood", "dragonwing"], STR_SPLIT),
  ] },
  { title: "전사 6차 계보 세트", builds: [
    build("마검 6차", ["runeknight", "spellswordmaster", "spellswordemperor"], HYBRID_SPLIT),
    build("검 6차", ["veteran", "swordmaster", "swordsaint"], STR_SPLIT),
    build("용 6차", ["drakeblood", "dragonwing", "dragonsovereign"], STR_SPLIT),
  ] },
];

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** 5·6차 계보 세트에서 신규 계보(각 그룹 첫 줄)가 기존 계보 중앙값 대비 어디에 있는지. MP 제약 없는 80행동 사냥과 PvP. */
export function runLightningRunePositions(seeds = 60) {
  return LIGHTNING_RUNE_GROUPS.filter((group) => group.title.includes("계보 세트")).map((group) => {
    const rows = group.builds.map((entry) => ({
      pve: runExpansionPve(entry, seeds, 80, false).mean,
      pvp: runExpansionPvp(entry, seeds, false),
    }));
    const [line, ...others] = rows;
    return {
      title: group.title,
      pveRatio: line.pve / median(others.map((row) => row.pve)),
      pvpRatio: line.pvp / median(others.map((row) => row.pvp)),
    };
  });
}

const fmt = (value: number) => Math.round(value).toLocaleString("en-US");

function main() {
  const seeds = Number(process.env.SEEDS ?? 60);
  for (const group of LIGHTNING_RUNE_GROUPS) {
    console.log(`\n## ${group.title}`);
    const rows = group.builds.map((entry) => runExpansionCase(entry, seeds));
    const others = rows.slice(1);
    const span = (pick: (row: (typeof rows)[number]) => number) =>
      `${fmt(Math.min(...others.map(pick)))}~${fmt(Math.max(...others.map(pick)))}`;
    for (const row of rows) {
      console.log([
        row.label.padEnd(8),
        `SP ${row.sp}`,
        `MP ${fmt(row.maxMp)}`,
        `PvE80 ${fmt(row.pveLong)}`,
        `PvE80실MP ${fmt(row.pveLongRealMp)}`,
        `PvE12 ${fmt(row.pveShort)}`,
        `PvP ${fmt(row.pvp)}`,
        `PvP실MP ${fmt(row.pvpRealMp)}`,
        `시전 ${JSON.stringify(Object.fromEntries(Object.entries(row.castsPer80).map(([k, v]) => [k, Number(v.toFixed(1))])))}`,
      ].join(" | "));
    }
    console.log(`기존 범위: PvE80 ${span((r) => r.pveLong)} | PvE80실MP ${span((r) => r.pveLongRealMp)} | PvE12 ${span((r) => r.pveShort)} | PvP ${span((r) => r.pvp)}`);
  }
}

if (process.argv[1]?.endsWith("sim-lightning-rune-advancement.ts")) main();
