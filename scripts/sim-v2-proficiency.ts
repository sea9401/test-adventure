// v2 숙련도 재설계 — 커리어 경제 sim (docs/v2-proficiency-redesign.md §10 캘리브).
//
// 모델(2026-06 cumLevel 전환): 한 직업군으로 사냥하며 레벨을 올려 전직(1→2→3→4)하는 한 "생애".
//   - 킬당 숙달 포인트(points) += V2_PROFICIENCY_PER_KILL_BASE (수행·스킬 소비 통화).
//     ⚠️라이브는 깊이 밴드 비례 2~5(proficiencyPerKillAtDepth) — sim 은 보수적 바닥(들판 2) 고정.
//   - 킬당 exp 누적 → requiredExpToNext 곡선으로 레벨업 → 레벨업당 직군 누적 레벨(cumLevel) += 1.
//   - 전직 게이트 = cumLevel ≥ V2_ADVANCE_CUMLEVEL_REQ[tier] AND 현 차수 레벨 ≥ V2_ADVANCE_MIN_LEVEL.
//   - floor(저점) 입력 = cumLevel (points 아님). cumLevel 은 레벨캡·차수 유한이라 천장을 가짐.
//   - 전직 = 차수 레벨 1 리셋 + grown 리셋 + setGroupTier(floor tierMult↑). points/cumLevel/caps 보존.
//   - 숙달 포인트로: 시그니처 학습(차수 비용) + 수행(앵커+2/관련+1, 8+cap×5).
//
// 킬당 포인트 는 대표 몬스터 EXP(MONSTER_EXP) 가정의 근사 — 경제 컬럼은 ballpark.
// floor/cap/파워 컬럼은 cumLevel(정확)로 계산.
//
// 측정(각 차수 도달 시점): 누적킬 / 학습누계 / 수행횟수 / 잔량 / 앵커 cap·floor·floor% / 성숙파워.
//
// 실행: node --import tsx scripts/sim-v2-proficiency.ts

import {
  V2_PROFICIENCY_PER_KILL_BASE,
  V2_ADVANCE_CUMLEVEL_REQ,
  V2_ADVANCE_MIN_LEVEL,
  V2_SIGNATURE_LEARN_COST,
  emptyProficiency,
  addPoints,
  addCumLevel,
  applyCultivation,
  spendProficiency,
  setGrown,
  setGroupTier,
  groupCumLevel,
  groupUsable,
  cultivationCount,
  capGain,
  effectiveStatCap,
  type V2ProficiencyState,
} from "../src/adventure/data/v2/proficiency";
import { computeStatFloors } from "../src/adventure/data/v2/statGrowth";
import {
  V2_CLASS_DEFS,
  type V2Class,
} from "../src/adventure/data/v2/classes";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import { MAIN_DUNGEON } from "../src/adventure/data/v2/dungeon";
import { requiredExpToNext, MAX_LEVEL } from "../src/lib/leveling";
import { V2_STAT_KEYS, type V2StatKey } from "../src/adventure/data/v2/v2StatKeys";

// 4직군 (P4). 각 군의 1→4차를 따라간다 (class 불변, 차수는 proficiency.tier).
const TIER1: V2Class[] = ["warrior", "martial", "mage", "rogue"];

// 스타터 장비(파워 비교를 base 캐릭 ≈ floor min 앵커와 맞추려 전 구간 고정 — 실제론 업글됨).
const STARTER_EQUIP = {
  weapon: "v2_iron_sword",
  armor: "v2_leather_armor",
  gloves: "v2_leather_gloves",
  boots: "v2_leather_boots",
  ring: "v2_silver_ring",
  necklace: "v2_jade_amulet",
} as const;

// 대표 몬스터 EXP(추정, median~180×배율) — 킬→레벨 환산용. earned/킬 경제 컬럼만 영향
// (floor 는 cumLevel 로 정확 계산). 실제 EXP 는 층·배율로 변동.
const MONSTER_EXP = 350;

// 권장 파워(층 min) — 1~5층(power kind)만. 차수↔층 매핑은 대략(1차=F1, 2차=F2~3, ...).
const FLOOR_POWER_MIN: number[] = MAIN_DUNGEON.floors
  .map((f) => (f.requirement.kind === "power" ? f.requirement.min : null))
  .filter((x): x is number => x != null);

// 한 스탯을 cap 까지 채운 "성숙" 파워 — 레벨 충분(grown 이 cap 까지 채움) 가정의 천장.
function maturePower(
  prof: V2ProficiencyState,
  playerClass: V2Class,
  level: number,
  classTier: number,
): number {
  const floors = computeStatFloors(prof);
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
    classTier,
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
  cumLevel: number;
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
  const group = t1; // tier1ClassOf(t1) === t1
  const anchor = V2_CLASS_DEFS[t1].anchorStat;
  const rows: Row[] = [];
  let prof = emptyProficiency();
  const cls: V2Class = t1; // P4 — class 는 불변(차수는 prof.tier).
  let kills = 0;
  let tierLevel = 1; // 현 차수 레벨(전직 시 1 리셋)
  let expBuf = 0;
  let learnedCostTotal = 0; // 누적 학습 지출(이미 배운 차수는 재지출 안 함 — learn-skill 멱등).
  const learnedTiers = new Set<number>();

  // 1킬 — earned + exp 누적, 레벨업 수만큼 cumLevel++ (차수 레벨 캡 100).
  const doKill = () => {
    prof = addPoints(prof, group, V2_PROFICIENCY_PER_KILL_BASE);
    kills++;
    expBuf += MONSTER_EXP;
    while (tierLevel < MAX_LEVEL) {
      const need = requiredExpToNext(tierLevel);
      if (need == null || expBuf < need) break;
      expBuf -= need;
      tierLevel++;
      prof = addCumLevel(prof, group, 1);
    }
  };

  for (let tier = 1; tier <= 4; tier++) {
    // 도달한 차수까지 아직 안 배운 시그니처만 학습(차수별 비용 1회 — learn-skill 멱등 반영).
    for (let t = 1; t <= tier; t++) {
      if (learnedTiers.has(t)) continue;
      const c = V2_SIGNATURE_LEARN_COST[t] ?? 0;
      const sp = spendProficiency(prof, group, c);
      if (sp) {
        prof = sp;
        learnedCostTotal += c;
        learnedTiers.add(t);
      }
    }
    // 잔량 전부 수행.
    prof = cultivateToEmpty(prof, group);

    const floors = computeStatFloors(prof);
    const anchorFloor = floors[anchor] ?? 0;
    const anchorCap = effectiveStatCap(anchorFloor, capGain(prof, anchor));
    rows.push({
      tier,
      cls: V2_CLASS_DEFS[cls].name,
      cumLevel: groupCumLevel(prof, group),
      kills,
      learnedCost: learnedCostTotal,
      usableAfter: groupUsable(prof, group),
      cultivations: cultivationCount(prof, group),
      anchorCap,
      anchorFloor,
      power: maturePower(prof, cls, tierLevel, tier),
      floorMin:
        FLOOR_POWER_MIN[Math.min(tier - 1, FLOOR_POWER_MIN.length - 1)] ?? null,
    });

    // 다음 차수로 전직 — cumLevel 게이트 + 현 차수 레벨 ≥ 50 까지 사냥.
    if (tier < 4) {
      const need = V2_ADVANCE_CUMLEVEL_REQ[tier + 1] ?? 0;
      let guard = 0;
      while (
        (groupCumLevel(prof, group) < need ||
          tierLevel < V2_ADVANCE_MIN_LEVEL) &&
        guard++ < 1_000_000
      ) {
        doKill();
      }
      prof = setGroupTier(setGrown(prof, {}), group, tier + 1);
      tierLevel = 1;
      expBuf = 0;
    }
  }
  return rows;
}

console.log("━━━ v2 숙련도 커리어 경제 sim (cumLevel 전환) ━━━");
console.log(
  `적립 +${V2_PROFICIENCY_PER_KILL_BASE}/킬 · 전직게이트 cumLevel ${JSON.stringify(V2_ADVANCE_CUMLEVEL_REQ)} (+Lv${V2_ADVANCE_MIN_LEVEL}) · 학습 ${JSON.stringify(V2_SIGNATURE_LEARN_COST)}`,
);
console.log(`권장 파워(F1~5) ${JSON.stringify(FLOOR_POWER_MIN)} · 몬스터EXP(추정) ${MONSTER_EXP}`);
console.log("");

for (const t1 of TIER1) {
  const rows = simulateGroup(t1);
  const anchor = V2_CLASS_DEFS[t1].anchorStat.toUpperCase();
  console.log(`■ ${V2_CLASS_DEFS[t1].group} (앵커 ${anchor})`);
  console.log(
    "  차수 | 직업           | 누적Lv | 누적킬 | 학습비 | 수행 | 잔량 |  cap | floor | floor% | 파워 | 권장",
  );
  console.log(
    "  -----+----------------+--------+--------+--------+------+------+------+-------+--------+------+-----",
  );
  for (const r of rows) {
    const flag = r.anchorFloor > r.anchorCap ? " ⚠floor>cap" : "";
    const pflag =
      r.floorMin != null && r.power < r.floorMin ? " ⚠파워<권장" : "";
    const floorPct = r.anchorCap > 0 ? Math.round((r.anchorFloor / r.anchorCap) * 100) : 0;
    console.log(
      `  ${r.tier}차  | ${r.cls.padEnd(14)} | ${String(r.cumLevel).padStart(6)} | ${String(r.kills).padStart(6)} | ${String(r.learnedCost).padStart(6)} | ${String(r.cultivations).padStart(4)} | ${String(r.usableAfter).padStart(4)} | ${String(r.anchorCap).padStart(4)} | ${String(r.anchorFloor).padStart(5)} | ${String(floorPct + "%").padStart(6)} | ${String(r.power).padStart(4)} | ${String(r.floorMin ?? "-").padStart(4)}${flag}${pflag}`,
    );
  }
  console.log("");
}
