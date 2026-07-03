// 사냥 승리/레벨업의 숙련도·성장 적립 — runOneHunt 에서 추출한 순수 헬퍼(DB 미접촉).
// 적립(숙달 포인트·직업 숙련도)과 레벨업 랜덤 스탯 성장을 한 번에 계산하고,
// 쓰기(proficiency.v2 upsert)는 라우트가 반환값(nextProficiency)으로 수행한다.
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  addCumLevel,
  addJobCumLevel,
  addPoints,
  groupCumLevel,
  parseProficiencyForChar,
  proficiencyPerKillAtDepth,
  setGrown,
} from "@/adventure/data/v2/proficiency";
import {
  V2_JOB_CATALOG,
  cumLevelForJob,
  isFishingJobId,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  applyPostCapGrowth,
  rollLevelGrowth,
} from "@/adventure/data/v2/statGrowth";
import { V2_STAT_KEYS, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import { equippedProfPerKillBonus } from "@/adventure/data/v2/v2Skills";
import { rollGuildCombatProficiencyBonus } from "@/adventure/data/v2/guildCombatSupply";

export type HuntProficiencyResult = {
  /** 갱신된 proficiency — null 이면 쓰기 불필요(패배·무성장: readout 만 산출). */
  nextProficiency: ReturnType<typeof parseProficiencyForChar> | null;
  /** 전투 결과 표시용 — 이번 승리로 적립된 숙달 포인트. */
  proficiencyGained: number;
  /** 승리 시 현재 직업 숙련도(+1). 전직/스킬포인트 게이트 입력. */
  masteryGained: number;
  /** 상시 카드 readout — 이 사냥 후 현재 직업 숙련도(none=null). */
  masteryAfter: number | null;
  /** deprecated — 숙련도 마일스톤 SP 지급 제거로 항상 0. */
  spMilestonesGained: number;
  /** 레벨업 랜덤 성장으로 오른 1차 스탯 — 결과 카드 표시용. */
  statGains: Partial<Record<V2StatKey, number>>;
};

export function applyHuntProficiency(params: {
  won: boolean;
  depth: number;
  charSave: { class?: unknown; specChoice?: unknown; [k: string]: unknown };
  proficiencyRaw: unknown;
  /** v2Skills.equipped — 착용 패시브(수련 등)의 킬당 보너스 산출용. */
  equippedSkills: Parameters<typeof equippedProfPerKillBonus>[0];
  /** 길드 전투 보급 — 숙련도 보너스 확률(%). */
  proficiencyChancePct: number;
  levelsGained: number;
  /** 사냥 후 레벨(expResult.level) — 만렙 post-cap 성장 판정용. */
  levelAfter: number;
  levelCap: number;
  rng?: () => number;
}): HuntProficiencyResult {
  const {
    won,
    depth,
    charSave,
    proficiencyRaw,
    equippedSkills,
    proficiencyChancePct,
    levelsGained,
    levelAfter,
    levelCap,
    rng = Math.random,
  } = params;

  let proficiencyGained = 0;
  let masteryGained = 0;
  let masteryAfter: number | null = null;
  const spMilestonesGained = 0;
  const statGains: Partial<Record<V2StatKey, number>> = {};

  if (won || levelsGained > 0) {
    const playerClass = parseV2Class(charSave.class);
    const group = tier1ClassOf(playerClass);
    const v2JobId = jobIdFromLegacy(
      playerClass,
      typeof charSave.specChoice === "string" ? charSave.specChoice : null,
    );
    let prof = parseProficiencyForChar(proficiencyRaw, charSave);
    // 적립 — 승리 시. 숙달 포인트는 깊이 밴드 비례(2~3), 직업 숙련도는 승리당 +1.
    //   none(모험가)은 숙달 포인트만 적립하고, 직업 숙련도/정복 게이트는 제외한다.
    if (won) {
      // 승리당 숙달 포인트 = 깊이 밴드(2~3) + 착용 패시브 보너스(수련 = +1).
      const perKill =
        proficiencyPerKillAtDepth(depth) +
        equippedProfPerKillBonus(equippedSkills) +
        rollGuildCombatProficiencyBonus(proficiencyChancePct, rng);
      const nextProf = addPoints(prof, group, perKill);
      if (nextProf !== prof) {
        prof = nextProf;
        proficiencyGained = perKill;
      }
      if (group !== "none" && !isFishingJobId(v2JobId)) {
        prof = addCumLevel(prof, group, 1);
        prof = addJobCumLevel(prof, v2JobId, 1);
        masteryGained = 1;
      }
    }
    // 레벨업 시 — 랜덤 스탯 성장. 직업 숙련도는 레벨업이 아니라 사냥 승리에서 적립한다.
    if (levelsGained > 0) {
      // 랜덤 레벨 성장 — 레벨업 수만큼 굴린다(cap 은 prof.caps, 수행 전 기본 60).
      const grownBefore = prof.grown; // rollLevelGrowth 는 비파괴 — 시작 맵 보존 안전.
      let grown = grownBefore;
      for (let i = 0; i < levelsGained; i++) {
        grown = rollLevelGrowth(grown, playerClass, prof, rng, {
          currentJobId: v2JobId,
        });
      }
      prof = setGrown(prof, grown);
      // grown 1포인트 = 해당 스탯 +1. 레벨업 전후 delta 가 곧 오른 스탯.
      for (const k of V2_STAT_KEYS) {
        const d = (grown[k] ?? 0) - (grownBefore[k] ?? 0);
        if (d > 0) statGains[k] = d;
      }
    } else if (won && levelAfter >= levelCap) {
      const postCap = applyPostCapGrowth(prof, playerClass, rng, {
        currentJobId: v2JobId,
      });
      prof = postCap.proficiency;
      for (const k of V2_STAT_KEYS) {
        const d = postCap.statGains[k] ?? 0;
        if (d > 0) statGains[k] = (statGains[k] ?? 0) + d;
      }
    }
    // 직업 숙련도(상시 카드 readout) — 현재 전직 중인 구체 직업 기준. none=숙련도 없음.
    const currentJob = V2_JOB_CATALOG[v2JobId];
    masteryAfter =
      group !== "none"
        ? currentJob
          ? cumLevelForJob(prof, currentJob)
          : groupCumLevel(prof, group)
        : null;
    return {
      nextProficiency: prof,
      proficiencyGained,
      masteryGained,
      masteryAfter,
      spMilestonesGained,
      statGains,
    };
  }

  // 패배(승리·레벨업 없음) — 숙련도 불변. 상시 카드 readout 용 현재값만 산출(쓰기 없음).
  const lossClass = parseV2Class(charSave.class);
  const lossGroup = tier1ClassOf(lossClass);
  if (lossGroup !== "none") {
    const lossJobId = jobIdFromLegacy(
      lossClass,
      typeof charSave.specChoice === "string" ? charSave.specChoice : null,
    );
    const lossJob = V2_JOB_CATALOG[lossJobId];
    const lossProf = parseProficiencyForChar(proficiencyRaw, charSave);
    masteryAfter = lossJob
      ? cumLevelForJob(lossProf, lossJob)
      : groupCumLevel(lossProf, lossGroup);
  }
  return {
    nextProficiency: null,
    proficiencyGained,
    masteryGained,
    masteryAfter,
    spMilestonesGained,
    statGains,
  };
}
