export const TIER7_COMBAT_JOB_IDS = [
  "shadowblade",
  "ruinblade",
  "skyascendant",
  "primordialsage",
] as const;

export type Tier7CombatJobId = (typeof TIER7_COMBAT_JOB_IDS)[number];

export const TIER7_COMBAT_JOB_PREREQS: Record<
  Tier7CombatJobId,
  readonly [string, string]
> = {
  shadowblade: ["swordsaint", "blackmoon"],
  ruinblade: ["swordsaint", "hegemon"],
  skyascendant: ["heavenlybow", "celestialdragon"],
  primordialsage: ["archmage", "primordialmage"],
};

export function tier7CombatJobIdForSkillId(
  skillId: string,
): Tier7CombatJobId | null {
  return (
    TIER7_COMBAT_JOB_IDS.find((jobId) =>
      skillId.startsWith(`v2c_${jobId}_`),
    ) ?? null
  );
}

export type Tier7Mechanic =
  | {
      kind: "shadowStrike";
      recordPct: number;
      refinedRecordPct: number;
    }
  | { kind: "shadowRefine"; refinePctPoints: number; hastePct: number }
  | {
      kind: "shadowCore";
      recordPct: number;
      refinedRecordPct: number;
      nextSingleDamagePct: number;
      pvpScalePct: number;
    }
  | {
      kind: "intentStrike";
      missingHpBonusCapPct: number;
      lowHpThresholdPct: number;
    }
  | {
      kind: "intentCore";
      maxStacks: number;
      damagePctPerStack: number;
      finisherPctPerStack: number;
    }
  | {
      kind: "chargedFinisher";
      currentMissingHpCapPct: number;
      chargeLostHpCapPct: number;
      pvpCapPct: number;
      pvpPenetrationPct: number;
    }
  | { kind: "crossStrike"; family: "ranged" | "martial" }
  | {
      kind: "crossCore";
      captureDamagePct: number;
      captureAccuracyPct: number;
      capturePenetrationPct: number;
      pursuitDamagePct: number;
      pursuitEnemyDelayPct: number;
      hastePct: number;
      pvpCaptureDamagePct: number;
      pvpCapturePenetrationPct: number;
      pvpPursuitDamagePct: number;
      pvpPursuitEnemyDelayPct: number;
      pvpHastePct: number;
    }
  | { kind: "formulaStrike"; stages: 1; completionHastePct: number }
  | {
      kind: "manaOptimization";
      restoreMaxMpPct: number;
      allowCompletionOverdraft: true;
    }
  | {
      kind: "completeFormula";
      directDamagePct: number;
      penetrationPct: number;
      hastePct: number;
      pvpDamagePct: number;
      pvpPenetrationPct: number;
      pvpHastePct: number;
    };

const SCORE = {
  delayedRealization: 0.8,
  alternatingFamilyUptime: 0.75,
  chargedOncePerBattle: 0.65,
} as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function tier7MechanicPower(mechanic: Tier7Mechanic): number {
  let value: number;
  switch (mechanic.kind) {
    case "shadowStrike":
      value =
        (((mechanic.recordPct + mechanic.refinedRecordPct) / 2) / 10) *
        SCORE.delayedRealization *
        0.25;
      break;
    case "shadowRefine":
      value =
        (mechanic.refinePctPoints / 10) *
          SCORE.delayedRealization *
          0.5 +
        (mechanic.hastePct / 20) * 1.4;
      break;
    case "shadowCore":
      value =
        (((mechanic.recordPct + mechanic.refinedRecordPct) / 2) / 10) *
          SCORE.delayedRealization +
        mechanic.nextSingleDamagePct / 10 +
        2;
      break;
    case "intentStrike":
      value =
        mechanic.missingHpBonusCapPct / 30 +
        mechanic.lowHpThresholdPct / 40;
      break;
    case "intentCore":
      value =
        (mechanic.maxStacks * mechanic.damagePctPerStack) / 15 +
        (mechanic.maxStacks * mechanic.finisherPctPerStack) / 40;
      break;
    case "chargedFinisher":
      value =
        ((mechanic.currentMissingHpCapPct + mechanic.chargeLostHpCapPct) /
          20) *
        SCORE.chargedOncePerBattle;
      break;
    case "crossStrike":
      value = 1.5;
      break;
    case "crossCore": {
      const capture =
        mechanic.captureDamagePct / 10 +
        mechanic.captureAccuracyPct / 30 +
        mechanic.capturePenetrationPct / 20;
      const pursuit =
        mechanic.pursuitDamagePct / 10 +
        mechanic.pursuitEnemyDelayPct / 60;
      value =
        ((capture + pursuit) / 2 + mechanic.hastePct / 20) *
          SCORE.alternatingFamilyUptime +
        0.6;
      break;
    }
    case "formulaStrike":
      value =
        mechanic.stages + (mechanic.completionHastePct / 10) * 0.8;
      break;
    case "manaOptimization":
      value =
        (mechanic.restoreMaxMpPct / 10) * 0.5 +
        (mechanic.allowCompletionOverdraft ? 1 : 0);
      break;
    case "completeFormula":
      value =
        (mechanic.directDamagePct / 10) * 0.5 +
        (mechanic.penetrationPct / 20) * 0.75 +
        (mechanic.hastePct / 20) * 0.4;
      break;
  }
  return round2(value);
}

export function validateTier7Package<T extends { spCost?: number }>(
  defs: readonly T[],
  scoreOf: (definition: T) => number,
): { sp: number; score: number; efficiency: number } {
  const sp = defs.reduce((sum, definition) => sum + (definition.spCost ?? 0), 0);
  const score = round2(defs.reduce((sum, definition) => sum + scoreOf(definition), 0));
  const rawEfficiency = sp > 0 ? score / sp : 0;
  const efficiency = round2(rawEfficiency);
  if (sp !== 46) throw new Error(`tier 7 package must cost exactly 46 SP; got ${sp}`);
  if (rawEfficiency < 0.35 || rawEfficiency > 0.4) {
    throw new Error(`tier 7 efficiency must stay within 0.35–0.40; got ${efficiency}`);
  }
  if (score < 16 || score > 18) {
    throw new Error(`tier 7 score must stay within 16–18; got ${score}`);
  }
  return { sp, score, efficiency };
}
