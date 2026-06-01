// v2 숙련도 재설계 — 커리어 경제 sim (docs/v2-proficiency-redesign.md §10 캘리브).
//
// 모델: 한 직업군으로 사냥하며 누적 숙련도(earned)를 쌓아 전직(1→2→3→4)하는 한 "생애".
//   - 킬당 earned += V2_PROFICIENCY_PER_KILL.
//   - 전직 게이트 = 직업군 earned ≥ V2_ADVANCE_PROFICIENCY_REQ[tier] (earned 는 안 줄어듦).
//   - 전직 = 레벨1 리셋 + grown 리셋 + setGroupTier(floor tierMult↑). earned/spent 보존.
//   - 사용가능(earned − spent)으로: 시그니처 학습(차수 비용) + 수행(앵커+3/관련+1, 8×1.12ⁿ).
//
// 측정(각 차수 도달 시점):
//   - 누적 킬 / 사용가능 잔량 / 학습 누계 / 수행 횟수
//   - 앵커 스탯 cap·floor (floor > cap 이면 "수행이 floor 에 추월당함" 경고)
//   - "성숙 파워" = 전 스탯을 cap 까지 채운(레벨 충분) derive 합성 파워 vs 그 차수 권장 floor min
//
// 실행: node --import tsx scripts/sim-v2-proficiency.ts
// 전투 WR 은 sim-v2-progression(별 스크립트) 소관 — 여기선 prof→스탯→파워 경제만.

import {
  V2_PROFICIENCY_PER_KILL,
  V2_ADVANCE_PROFICIENCY_REQ,
  V2_SIGNATURE_LEARN_COST,
  emptyProficiency,
  addEarned,
  applyCultivation,
  spendProficiency,
  setGrown,
  setGroupTier,
  groupEarned,
  groupUsable,
  cultivationCount,
  capGain,
  effectiveStatCap,
  type V2ProficiencyState,
} from "../src/adventure/data/v2/proficiency";
import { computeStatFloors } from "../src/adventure/data/v2/statGrowth";
import {
  V2_CLASS_DEFS,
  nextTierClassOf,
  type V2Class,
} from "../src/adventure/data/v2/classes";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import { MAIN_DUNGEON } from "../src/adventure/data/v2/dungeon";
import { V2_STAT_KEYS, type V2StatKey } from "../src/adventure/data/v2/v2StatKeys";

// 6 직업군 1차 (representative). 각 군의 4차 체인을 따라간다.
const TIER1: V2Class[] = [
  "swordsman",
  "archer",
  "martial",
  "mage",
  "priest",
  "ninja",
];

// 스타터 장비(파워 비교를 base 캐릭 ≈ floor min 앵커와 맞추려 전 구간 고정 — 실제론 업글됨).
const STARTER_EQUIP = {
  weapon: "v2_iron_sword",
  armor: "v2_leather_armor",
  accessory: "v2_silver_ring",
} as const;

// 권장 파워(층 min) — 1~5층(power kind)만. 차수↔층 매핑은 대략(1차=F1, 2차=F2~3, ...).
const FLOOR_POWER_MIN: number[] = MAIN_DUNGEON.floors
  .map((f) => (f.requirement.kind === "power" ? f.requirement.min : null))
  .filter((x): x is number => x != null);

// 한 스탯을 cap 까지 채운 "성숙" 파워 — 레벨 충분(grown 이 cap 까지 채움) 가정의 천장.
function maturePower(
  prof: V2ProficiencyState,
  playerClass: V2Class,
  level: number,
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
  kills: number;
  earned: number;
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
  let cls: V2Class = t1;
  let kills = 0;
  let learnedCostTotal = 0; // 누적 학습 지출(이미 배운 차수는 재지출 안 함 — learn-skill 멱등).
  const learnedTiers = new Set<number>();

  // 각 차수: earned 임계까지 사냥 → 학습(새 차수 시그니처) → 수행(잔량 전부) → 측정 → 전직.
  for (let tier = 1; tier <= 4; tier++) {
    // 이 차수에 도달하는 데 필요한 earned (1차는 0, 2~4차는 임계).
    const need = tier === 1 ? 0 : (V2_ADVANCE_PROFICIENCY_REQ[tier] ?? 0);
    while (groupEarned(prof, group) < need) {
      prof = addEarned(prof, group, V2_PROFICIENCY_PER_KILL);
      kills++;
    }
    // 전직(2차+) — 차수 기록 + 레벨/grown 리셋(earned/spent/caps 보존).
    if (tier > 1) {
      cls = nextTierClassOf(cls) ?? cls;
      prof = setGroupTier(setGrown(prof, {}), group, tier);
    }
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
    rows.push({
      tier,
      cls: V2_CLASS_DEFS[cls].name,
      kills,
      earned: groupEarned(prof, group),
      learnedCost: learnedCostTotal,
      usableAfter: groupUsable(prof, group),
      cultivations: cultivationCount(prof, group),
      anchorCap: effectiveStatCap(floors[anchor] ?? 0, capGain(prof, anchor)),
      anchorFloor: floors[anchor] ?? 0,
      // 레벨 60 = "잘 키운" 대표값(전직은 PR-6 후 레벨 무관·숙련도 게이트라 차수별 최소레벨 없음).
      power: maturePower(prof, cls, 60),
      // 차수 N ↔ FN (1차=F1). FLOOR_POWER_MIN 은 0-인덱스라 tier-1.
      floorMin:
        FLOOR_POWER_MIN[Math.min(tier - 1, FLOOR_POWER_MIN.length - 1)] ?? null,
    });
  }
  return rows;
}

console.log("━━━ v2 숙련도 커리어 경제 sim ━━━");
console.log(
  `적립 +${V2_PROFICIENCY_PER_KILL}/킬 · 전직임계 ${JSON.stringify(V2_ADVANCE_PROFICIENCY_REQ)} · 학습 ${JSON.stringify(V2_SIGNATURE_LEARN_COST)}`,
);
console.log(`권장 파워(F1~5) ${JSON.stringify(FLOOR_POWER_MIN)}`);
console.log("");

for (const t1 of TIER1) {
  const rows = simulateGroup(t1);
  const anchor = V2_CLASS_DEFS[t1].anchorStat.toUpperCase();
  console.log(`■ ${V2_CLASS_DEFS[t1].group} (앵커 ${anchor})`);
  console.log(
    "  차수 | 직업           | 누적킬 | 학습비 | 수행 | 잔량 |  cap | floor | 파워 | 권장",
  );
  console.log(
    "  -----+----------------+--------+--------+------+------+------+-------+------+-----",
  );
  for (const r of rows) {
    const flag = r.anchorFloor > r.anchorCap ? " ⚠floor>cap" : "";
    const pflag =
      r.floorMin != null && r.power < r.floorMin ? " ⚠파워<권장" : "";
    console.log(
      `  ${r.tier}차  | ${r.cls.padEnd(14)} | ${String(r.kills).padStart(6)} | ${String(r.learnedCost).padStart(6)} | ${String(r.cultivations).padStart(4)} | ${String(r.usableAfter).padStart(4)} | ${String(r.anchorCap).padStart(4)} | ${String(r.anchorFloor).padStart(5)} | ${String(r.power).padStart(4)} | ${String(r.floorMin ?? "-").padStart(4)}${flag}${pflag}`,
    );
  }
  console.log("");
}
