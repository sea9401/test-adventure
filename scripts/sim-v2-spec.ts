// v2 계파(시그니처 + 직업 특성) 상대 밸런스 진단.
//
// 각 계파를 tier4·lv75 풀킷(3패시브 전부 해금 + 차수4 직업특성)으로 구성하고,
// 직군 표준 스탯 분배 + 동일 power(스타터, power 5) 무기 + tier4 방어구 세트로
// 훈련 더미를 친다. 직군별 baseline(무계파)과 비교해 "킷 기여"·outlier·동일직군 차별을 본다.
//
//   wr%    = 더미 처치 승률 (생존력 — 더미 atk 에 죽으면 패)
//   killT  = 승리 시 평균 처치 턴 (낮을수록 고DPS)
//   vs base = baseline(무계파) 대비 killT 변화 % (음수 = 킷이 더 빠르게 처치)
//
// ⚠️ 절대 수치보다 "동일 직군 3계파 간 차별 + 직군 내 outlier" 가 핵심. 더미는 중립 속성.
// 실행: npx tsx scripts/sim-v2-spec.ts [--hp=8000] [--atk=120] [--trials=400]

import { resolveBattle, type PlayerCombat } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { V2_JOB_SPECS, type V2JobSpec } from "../src/adventure/data/v2/v2JobSpecs";
import {
  V2_SKILLS,
  v2SkillSlotsForLevel,
  type V2SkillId,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import { starterWeaponForType } from "../src/adventure/data/v2/v2Equipment";
import type {
  V2EquipmentId,
  V2EquipSlot,
  V2WeaponType,
} from "../src/adventure/data/v2/v2Equipment";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import type { V2Class } from "../src/adventure/data/v2/classes";
import type { Monster } from "../src/adventure/data/monsters/types";

const argNum = (p: string, d: number) => {
  const a = process.argv.find((x) => x.startsWith(p));
  if (!a) return d;
  const n = Number(a.slice(p.length));
  return Number.isFinite(n) ? n : d;
};
const LEVEL = 75;
const TIER = 4;
const TRIALS = argNum("--trials=", 400);
const DUMMY_HP = argNum("--hp=", 8000);
const DUMMY_ATK = argNum("--atk=", 120);

// tier-4 방어구 세트 (progression sim 과 동일 라인).
const ARMOR: Record<
  "heavy" | "light",
  Record<"armor" | "gloves" | "boots", V2EquipmentId>
> = {
  heavy: {
    armor: "v2_silver_plate",
    gloves: "v2_silver_gauntlets",
    boots: "v2_silver_boots",
  },
  light: {
    armor: "v2_silken_armor",
    gloves: "v2_silken_gloves",
    boots: "v2_silken_boots",
  },
};
const RING: V2EquipmentId = "v2_stardust_ring";
const NECKLACE: V2EquipmentId = "v2_starlight_pendant";

type JobCfg = {
  main: V2StatKey;
  sub: V2StatKey;
  fill: V2StatKey;
  weight: "heavy" | "light";
  skillStat: "str" | "int";
};
// 직군 표준 빌드 — 물리딜은 str(atk=str), 마법은 int(magicAtk). 동일 직군 3계파는 같은 분배라
// 비교가 시그니처+특성만 분리한다. (martial=vit 앵커지만 딜은 str.)
const JOB: Record<string, JobCfg> = {
  warrior: { main: "str", sub: "vit", fill: "luk", weight: "heavy", skillStat: "str" },
  martial: { main: "str", sub: "vit", fill: "dex", weight: "heavy", skillStat: "str" },
  mage: { main: "int", sub: "vit", fill: "spi", weight: "light", skillStat: "int" },
  rogue: { main: "str", sub: "dex", fill: "luk", weight: "light", skillStat: "str" },
};
const JOB_CLASS: Record<string, V2Class> = {
  warrior: "warrior",
  martial: "martial",
  mage: "mage",
  rogue: "rogue",
};

function allocate(job: JobCfg): Record<V2StatKey, number> {
  const total = Math.max(0, LEVEL - 1) * V2_STAT_POINTS_PER_LEVEL;
  const a: Record<V2StatKey, number> = {
    str: 0,
    dex: 0,
    vit: 0,
    int: 0,
    spi: 0,
    luk: 0,
  };
  a[job.main] = Math.round(total * 0.6);
  a[job.sub] = Math.round(total * 0.25);
  a[job.fill] = total - a[job.main] - a[job.sub];
  return a;
}

const NO_SKILLS = process.argv.includes("--noskills");
function skillsFor(skillStat: "str" | "int"): V2SkillsState {
  if (NO_SKILLS) return { learned: [], equipped: [] };
  const ids = (Object.keys(V2_SKILLS) as V2SkillId[])
    .filter((id) => {
      const def = V2_SKILLS[id];
      if (def.monsterOnly) return false;
      if (def.learn?.requireClass) return false;
      if (def.stat !== skillStat) return false;
      if (def.learn && LEVEL < (def.learn.level ?? 0)) return false;
      return true;
    })
    .sort((a, b) => {
      const da = V2_SKILLS[a];
      const db = V2_SKILLS[b];
      const atkA = da.category === "attack" ? 1 : 0;
      const atkB = db.category === "attack" ? 1 : 0;
      if (atkA !== atkB) return atkB - atkA;
      return db.tier - da.tier;
    });
  return { learned: ids, equipped: ids.slice(0, v2SkillSlotsForLevel(LEVEL)) };
}

function buildPlayer(
  spec: V2JobSpec | undefined,
  weaponType: V2WeaponType,
  job: JobCfg,
  cls: V2Class,
): PlayerCombat {
  // greatsword 는 스타터가 없음(v2_greatsword 가 그 타입) → 폴백. ⚠️ power 가 스타터(5)보다
  // 높을 수 있어 광검 절대치는 약간 부풀 수 있음(직군 내 비교엔 영향 적음).
  const weapon =
    weaponType === "greatsword"
      ? ("v2_greatsword" as V2EquipmentId)
      : starterWeaponForType(weaponType);
  const set = ARMOR[job.weight];
  const equipped: Partial<Record<V2EquipSlot, V2EquipmentId>> = {
    ...(weapon ? { weapon } : {}),
    armor: set.armor,
    gloves: set.gloves,
    boots: set.boots,
    ring: RING,
    necklace: NECKLACE,
  };
  return derivePlayerCombatV2Pure({
    level: LEVEL,
    allocatedStats: allocate(job),
    v2Equipped: equipped,
    playerClass: cls,
    classTier: TIER,
    spec,
    unlockedPassives: spec ? spec.passives.map((p) => p.id) : [],
    hp: undefined,
  }).player;
}

function dummy(): Monster {
  return {
    name: "훈련 더미",
    tags: ["beast"],
    hp: DUMMY_HP,
    atk: DUMMY_ATK,
    def: 30,
    spd: 40,
    exp: 0,
    evasionPct: 0,
  } as Monster;
}

function sim(player: PlayerCombat, skills: V2SkillsState) {
  let wins = 0;
  let winT = 0;
  for (let i = 0; i < TRIALS; i++) {
    const r = resolveBattle({ ...player, hp: player.maxHp }, dummy(), "Sim", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      v2Skills: skills,
    });
    if (r.outcome === "win") {
      wins++;
      winT += r.turns;
    }
  }
  return { wrPct: (wins / TRIALS) * 100, winTurns: wins ? winT / wins : 0 };
}

console.log(
  `v2 계파 밸런스 — lv${LEVEL} tier${TIER} 풀킷(3픽+특성), 더미 HP${DUMMY_HP}/atk${DUMMY_ATK}, ${TRIALS} trial\n` +
    `(wr=승률·killT=처치턴↓강함·vs base=무계파 killT 대비)\n`,
);
for (const [jobId, specs] of Object.entries(V2_JOB_SPECS)) {
  const job = JOB[jobId];
  const cls = JOB_CLASS[jobId];
  if (!job || !cls || specs.length === 0) continue;
  const skills = skillsFor(job.skillStat);
  const baseWeapon = specs[0].requiredWeaponType;
  const base = sim(buildPlayer(undefined, baseWeapon, job, cls), skills);
  console.log(
    `[${jobId}] baseline(무계파)  wr ${base.wrPct.toFixed(0)}%  killT ${base.winTurns.toFixed(1)}`,
  );
  for (const spec of specs) {
    const r = sim(buildPlayer(spec, spec.requiredWeaponType, job, cls), skills);
    const dt =
      base.winTurns > 0 && r.winTurns > 0
        ? (r.winTurns / base.winTurns - 1) * 100
        : 0;
    console.log(
      `   ${spec.name.padEnd(4)} ${`(${spec.trait?.name ?? "-"})`.padEnd(8)}  wr ${r.wrPct.toFixed(0).padStart(3)}%  killT ${r.winTurns.toFixed(1).padStart(5)}  (${dt >= 0 ? "+" : ""}${dt.toFixed(0)}% vs base)`,
    );
  }
  console.log();
}
