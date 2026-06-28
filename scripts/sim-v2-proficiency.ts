// v2 숙련도 재설계 — 커리어 경제 sim (docs/v2-proficiency-redesign.md §10 캘리브).
//
// 모델(2026-06 직업 숙련도 전환): 한 직업 계보로 사냥하며 전직하는 한 "생애".
//   - 승리당 숙달 포인트(points) += V2_PROFICIENCY_PER_KILL_BASE (수행·스킬 소비 통화).
//     ⚠️라이브는 깊이 밴드 비례 2~5(proficiencyPerKillAtDepth) — sim 은 보수적 바닥(들판 2) 고정.
//   - 사냥 승리당 직군 숙련도(groups.cumLevel)와 현재 직업 숙련도(jobCumLevel) += 1.
//   - 전직 게이트 = v2JobCatalog 해금 조건(2차는 직군 숙련도, 3차+는 계보 직업 숙련도) AND Lv cap.
//   - floor(저점) 입력 = 직업 숙련도(cumLevel, points 아님). 승리 누적이라 레벨캡과 별개로 쌓인다.
//   - 전직 = 레벨 1 리셋 + grown 리셋. points/직업 숙련도/caps 보존.
//   - 숙달 포인트로: 레거시 시그니처 학습 기준선 + 수행(앵커+2/관련+1, 8+cap×5).
//
// 킬당 EXP 는 대표 몬스터 EXP(MONSTER_EXP) 가정의 근사 — 경제 컬럼은 ballpark.
// floor/cap/파워 컬럼은 직업 숙련도(cumLevel)로 계산.
//
// 측정(각 계보 직업 도달 시점): 누적킬 / 기준 학습누계 / 수행횟수 / 잔량 / 앵커 cap·floor·floor% / 성숙파워.
//
// 실행: node --import tsx scripts/sim-v2-proficiency.ts

import {
  V2_PROFICIENCY_PER_KILL_BASE,
  V2_SIGNATURE_LEARN_COST,
  emptyProficiency,
  addPoints,
  addCumLevel,
  addJobCumLevel,
  applyCultivation,
  spendProficiency,
  setGrown,
  groupCumLevel,
  jobCumLevelOf,
  usablePoints,
  cultivationCount,
  capGain,
  effectiveStatCap,
  type V2ProficiencyState,
} from "../src/adventure/data/v2/proficiency";
import { V2_LEVEL_CAP } from "../src/adventure/data/v2/coreLoopConfig";
import {
  TIER2_UNLOCK_CUMLEVEL,
  TIER3_UNLOCK_CUMLEVEL,
  TIER4_UNLOCK_CUMLEVEL,
  V2_JOB_CATALOG,
  isJobUnlocked,
  LEGACY_CLASS_SPEC_BY_JOB,
} from "../src/adventure/data/v2/v2JobCatalog";
import { computeStatFloors } from "../src/adventure/data/v2/statGrowth";
import {
  V2_CLASS_DEFS,
  type V2Class,
} from "../src/adventure/data/v2/classes";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import { MAIN_DUNGEON } from "../src/adventure/data/v2/dungeon";
import {
  applyNewbieExpBonusByBattles,
  requiredExpToNext,
  XP_RATE_MULT,
} from "../src/lib/leveling";
import { V2_STAT_KEYS, type V2StatKey } from "../src/adventure/data/v2/v2StatKeys";

// 대표 단일 계보. 분기 직업·하이브리드는 별도 sim 대상이고, 여기서는 경제 페이싱 기준선을 본다.
const LINEAGES: Record<V2Class, string[]> = {
  none: [],
  warrior: ["warrior", "squire", "paladin", "veteran"],
  martial: ["martial", "boxer", "brawler", "sensei"],
  mage: ["mage", "caster", "magus", "sage"],
  rogue: ["rogue", "archer", "ranger", "chief"],
  survivor: ["survivor", "ironman", "extremesurvivor", "returner"],
};
const TIER1: V2Class[] = ["warrior", "martial", "mage", "rogue", "survivor"];
const ADVANCE_MASTERY_REQ: Record<number, number> = {
  2: TIER2_UNLOCK_CUMLEVEL,
  3: TIER3_UNLOCK_CUMLEVEL,
  4: TIER4_UNLOCK_CUMLEVEL,
};

// 스타터 장비(파워 비교를 base 캐릭 ≈ floor min 앵커와 맞추려 전 구간 고정 — 실제론 업글됨).
const STARTER_EQUIP = {
  weapon: "v2_iron_sword",
  armor: "v2_leather_armor",
  gloves: "v2_leather_gloves",
  boots: "v2_leather_boots",
  ring: "v2_silver_ring",
  necklace: "v2_jade_amulet",
} as const;

// 대표 몬스터 EXP(추정, 깊이 배율 반영 후 중반 값) — 킬→레벨 환산용. 실제 EXP 는 층·배율로 변동.
const MONSTER_EXP = 350;

// 권장 파워(층 min) — 1~5층(power kind)만. 직업 계보 단계와 층 매핑은 대략치다.
const FLOOR_POWER_MIN: number[] = MAIN_DUNGEON.floors
  .map((f) => (f.requirement.kind === "power" ? f.requirement.min : null))
  .filter((x): x is number => x != null);

// 한 스탯을 cap 까지 채운 "성숙" 파워 — 레벨 충분(grown 이 cap 까지 채움) 가정의 천장.
function maturePower(
  prof: V2ProficiencyState,
  jobId: string,
  level: number,
): number {
  const floors = computeStatFloors(prof);
  const job = V2_JOB_CATALOG[jobId];
  const legacy = LEGACY_CLASS_SPEC_BY_JOB[jobId];
  const playerClass = (legacy?.class ?? jobId) as V2Class;
  // caps = 수행 이득(gains). grown = 유효cap - floor (= 헤드룸+이득) 로 채워 stat=유효cap.
  const gains: Partial<Record<V2StatKey, number>> = {};
  const allocated: Partial<Record<V2StatKey, number>> = {};
  for (const k of V2_STAT_KEYS) {
    const gain = prof.caps[k] ?? 0;
    gains[k] = gain;
    const effCap = effectiveStatCap(floors[k] ?? 0, gain);
    allocated[k] = Math.max(0, effCap - (floors[k] ?? 0));
  }
  const d = derivePlayerCombatV2Pure({
    level,
    allocatedStats: allocated,
    statCaps: gains,
    statFloors: floors,
    v2Equipped: STARTER_EQUIP,
    playerClass,
    // 코어루프 재전직은 직군 tier 를 1로 평탄화한다. 직업 정체성은 jobBonus 로 반영.
    classTier: 1,
    jobBonus: job?.jobBonus,
  });
  return derivePowerScore({
    atk: d.player.atk,
    magicAtk: d.player.magicAtk ?? 0,
    def: d.player.def,
    spd: d.player.spd,
    maxHp: d.maxHp,
    maxMp: d.player.maxMp ?? 0,
  });
}

// 사용가능 숙련도로 가능한 만큼 수행(cap↑). 비파괴 루프.
function cultivateToEmpty(
  prof: V2ProficiencyState,
  group: string,
): V2ProficiencyState {
  let cur = prof;
  for (let i = 0; i < 1000; i++) {
    const r = applyCultivation(cur, group);
    if (!r) break;
    cur = r.next;
  }
  return cur;
}

type Row = {
  tier: number;
  cls: string;
  groupCumLevel: number;
  jobCumLevel: number;
  kills: number;
  learnedCost: number;
  usableAfter: number;
  cultivations: number;
  anchorCap: number;
  anchorFloor: number;
  power: number;
  floorMin: number | null;
};

function simulateGroup(t1: V2Class): Row[] {
  const lineage = LINEAGES[t1];
  const group = t1; // tier1ClassOf(t1) === t1
  const anchor = V2_CLASS_DEFS[t1].anchorStat;
  const rows: Row[] = [];
  let prof = emptyProficiency();
  let kills = 0;
  let tierLevel = 1; // 현 직업 레벨(전직 시 1 리셋)
  let expBuf = 0;
  let learnedCostTotal = 0; // 누적 학습 지출(이미 배운 직업은 재지출 안 함 — learn-skill 멱등).
  const learnedJobs = new Set<string>();

  // 1킬 — 숙달 포인트/직업 숙련도 + exp 누적. 직업 숙련도는 레벨업이 아니라 승리 보상.
  const doKill = (jobId: string) => {
    prof = addPoints(prof, group, V2_PROFICIENCY_PER_KILL_BASE);
    prof = addCumLevel(prof, group, 1);
    prof = addJobCumLevel(prof, jobId, 1);
    const expGain = Math.round(
      applyNewbieExpBonusByBattles(MONSTER_EXP, kills).gained * XP_RATE_MULT,
    );
    kills++;
    expBuf += expGain;
    while (tierLevel < V2_LEVEL_CAP) {
      const need = requiredExpToNext(tierLevel);
      if (need == null || expBuf < need) break;
      expBuf -= need;
      tierLevel++;
    }
  };

  for (let i = 0; i < lineage.length; i++) {
    const jobId = lineage[i]!;
    const job = V2_JOB_CATALOG[jobId]!;
    const nextJob = lineage[i + 1] ? V2_JOB_CATALOG[lineage[i + 1]!] : null;

    // 아직 안 배운 현 직업 시그니처 1회 학습(레거시 경제 기준선).
    if (!learnedJobs.has(jobId)) {
      const c = V2_SIGNATURE_LEARN_COST[job.tier] ?? 0;
      const sp = spendProficiency(prof, c);
      if (sp) {
        prof = sp;
        learnedCostTotal += c;
        learnedJobs.add(jobId);
      }
    }

    // 현 직업으로 레벨캡까지 사냥한다. 다음 직업이 있으면 카탈로그 해금 조건도 같이 만족시킨다.
    if (nextJob) {
      let guard = 0;
      while (
        (tierLevel < V2_LEVEL_CAP || !isJobUnlocked(nextJob, prof)) &&
        guard++ < 1_000_000
      ) {
        doKill(jobId);
      }
    } else {
      let guard = 0;
      while (tierLevel < V2_LEVEL_CAP && guard++ < 1_000_000) {
        doKill(jobId);
      }
    }

    // 잔량 전부 수행.
    prof = cultivateToEmpty(prof, group);

    const floors = computeStatFloors(prof);
    const anchorFloor = floors[anchor] ?? 0;
    const anchorCap = effectiveStatCap(anchorFloor, capGain(prof, anchor));
    rows.push({
      tier: job.tier,
      cls: job.name,
      groupCumLevel: groupCumLevel(prof, group),
      jobCumLevel: jobCumLevelOf(prof, jobId),
      kills,
      learnedCost: learnedCostTotal,
      usableAfter: usablePoints(prof),
      cultivations: cultivationCount(prof, group),
      anchorCap,
      anchorFloor,
      power: maturePower(prof, jobId, tierLevel),
      floorMin:
        FLOOR_POWER_MIN[Math.min(job.tier - 1, FLOOR_POWER_MIN.length - 1)] ??
        null,
    });

    // 다음 직업으로 재전직 — 레벨/grown 리셋, 숙련도/포인트/caps 보존.
    if (nextJob) {
      prof = setGrown(prof, {});
      tierLevel = 1;
      expBuf = 0;
    }
  }
  return rows;
}

console.log("━━━ v2 숙련도 커리어 경제 sim (직업 숙련도 전환) ━━━");
console.log(
  `숙달 포인트 +${V2_PROFICIENCY_PER_KILL_BASE}/킬 · 직군/직업 숙련도 +1/킬 · 해금선 ${JSON.stringify(ADVANCE_MASTERY_REQ)} (+Lv${V2_LEVEL_CAP}) · 레거시 학습 기준 ${JSON.stringify(V2_SIGNATURE_LEARN_COST)}`,
);
console.log(
  `권장 파워(F1~5) ${JSON.stringify(FLOOR_POWER_MIN)} · 몬스터EXP(추정) ${MONSTER_EXP} · XP_RATE_MULT=${XP_RATE_MULT}`,
);
console.log("");

for (const t1 of TIER1) {
  const rows = simulateGroup(t1);
  const anchor = V2_CLASS_DEFS[t1].anchorStat.toUpperCase();
  console.log(`■ ${V2_CLASS_DEFS[t1].group} (앵커 ${anchor})`);
  console.log(
    "  단계 | 직업           | 직군숙 | 직업숙 | 누적킬 | 학습비 | 수행 | 잔량 |  cap | floor | floor% | 파워 | 권장",
  );
  console.log(
    "  -----+----------------+--------+--------+--------+--------+------+------+------+-------+--------+------+-----",
  );
  for (const r of rows) {
    const flag = r.anchorFloor > r.anchorCap ? " ⚠floor>cap" : "";
    const pflag =
      r.floorMin != null && r.power < r.floorMin ? " ⚠파워<권장" : "";
    const floorPct = r.anchorCap > 0 ? Math.round((r.anchorFloor / r.anchorCap) * 100) : 0;
    console.log(
      `  ${r.tier}   | ${r.cls.padEnd(14)} | ${String(r.groupCumLevel).padStart(6)} | ${String(r.jobCumLevel).padStart(6)} | ${String(r.kills).padStart(6)} | ${String(r.learnedCost).padStart(6)} | ${String(r.cultivations).padStart(4)} | ${String(r.usableAfter).padStart(4)} | ${String(r.anchorCap).padStart(4)} | ${String(r.anchorFloor).padStart(5)} | ${String(floorPct + "%").padStart(6)} | ${String(r.power).padStart(4)} | ${String(r.floorMin ?? "-").padStart(4)}${flag}${pflag}`,
    );
  }
  console.log("");
}
