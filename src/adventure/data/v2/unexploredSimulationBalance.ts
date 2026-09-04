import {
  actionInterval,
  actionRate,
  depthSpdCorrection,
  effectiveMonsterSpd,
} from "@/adventure/v2/combat/combatTimeline";

export const UNEXPLORED_SIMULATION_DIFFICULTIES = [
  90, 95, 100, 105, 110, 115, 120,
] as const;
export type UnexploredSimulationDifficulty =
  (typeof UNEXPLORED_SIMULATION_DIFFICULTIES)[number];

export const UNEXPLORED_SPEED_BANDS = [
  "slow",
  "normal",
  "fast",
  "extreme",
] as const;
export type UnexploredSpeedBand = (typeof UNEXPLORED_SPEED_BANDS)[number];

const UNEXPLORED_RAW_SPD_ANCHORS = {
  90: { slow: 10, normal: 15, fast: 42, extreme: 62 },
  95: { slow: 13, normal: 20, fast: 54, extreme: 83 },
  100: { slow: 17, normal: 27, fast: 71, extreme: 107 },
  105: { slow: 19, normal: 31, fast: 78, extreme: 116 },
  110: { slow: 21, normal: 34, fast: 83, extreme: 122 },
  115: { slow: 23, normal: 36, fast: 86, extreme: 126 },
  120: { slow: 24, normal: 38, fast: 88, extreme: 129 },
} as const satisfies Record<
  UnexploredSimulationDifficulty,
  Record<UnexploredSpeedBand, number>
>;

const CALIBRATION_PLAYER_SPD = 930;
const SOURCE_MEDIAN_RAW_MONSTER_SPD = 9;

function assertSupportedDifficulty(difficulty: number): void {
  if (!Number.isInteger(difficulty) || difficulty < 90 || difficulty > 120) {
    throw new Error(`Unsupported unexplored difficulty: ${difficulty}`);
  }
}

function interpolateDifficultyAnchor(
  difficulty: number,
  valueAt: (anchor: UnexploredSimulationDifficulty) => number,
): number {
  assertSupportedDifficulty(difficulty);
  const upperIndex = UNEXPLORED_SIMULATION_DIFFICULTIES.findIndex(
    (anchor) => anchor >= difficulty,
  );
  const upper = UNEXPLORED_SIMULATION_DIFFICULTIES[upperIndex];
  if (upper === difficulty || upperIndex === 0) return valueAt(upper);
  const lower = UNEXPLORED_SIMULATION_DIFFICULTIES[upperIndex - 1];
  const progress = (difficulty - lower) / (upper - lower);
  return valueAt(lower) + (valueAt(upper) - valueAt(lower)) * progress;
}

function unexploredPressureMultiplier(difficulty: number): number {
  if (difficulty >= 100) return 1.15;
  return interpolateDifficultyAnchor(difficulty, (anchor) => {
    if (anchor === 90) return 1.05;
    if (anchor === 95) return 1.1;
    return 1.15;
  });
}

function convertedMonsterSpd(
  difficulty: number,
  rawSpd: number,
): number {
  assertSupportedDifficulty(difficulty);
  return effectiveMonsterSpd(rawSpd, depthSpdCorrection(difficulty));
}

export function unexploredRawSpd(
  difficulty: number,
  band: UnexploredSpeedBand,
): number {
  return Math.round(
    interpolateDifficultyAnchor(
      difficulty,
      (anchor) => UNEXPLORED_RAW_SPD_ANCHORS[anchor][band],
    ),
  );
}

export type UnexploredHighDifficultyMultipliers = {
  hp: number;
  atk: number;
  def: number;
};

const UNEXPLORED_RESOURCE_GROWTH_COMPENSATION = {
  90: { hp: 1, atk: 1, def: 1 },
  95: { hp: 1.75, atk: 1.5, def: 1.12 },
  100: { hp: 1.9, atk: 1.55, def: 1.14 },
  105: { hp: 1.3, atk: 1.18, def: 1.06 },
  110: { hp: 1, atk: 1, def: 1 },
  115: { hp: 1, atk: 1, def: 1 },
  120: { hp: 1, atk: 1, def: 1 },
} as const satisfies Record<
  UnexploredSimulationDifficulty,
  UnexploredHighDifficultyMultipliers
>;

export function unexploredResourceGrowthCompensation(
  difficulty: number,
): UnexploredHighDifficultyMultipliers {
  const stable = (value: number) => Number(value.toFixed(8));
  return {
    hp: stable(
      interpolateDifficultyAnchor(
        difficulty,
        (anchor) => UNEXPLORED_RESOURCE_GROWTH_COMPENSATION[anchor].hp,
      ),
    ),
    atk: stable(
      interpolateDifficultyAnchor(
        difficulty,
        (anchor) => UNEXPLORED_RESOURCE_GROWTH_COMPENSATION[anchor].atk,
      ),
    ),
    def: stable(
      interpolateDifficultyAnchor(
        difficulty,
        (anchor) => UNEXPLORED_RESOURCE_GROWTH_COMPENSATION[anchor].def,
      ),
    ),
  };
}

export function unexploredHighDifficultyMultipliers(
  difficulty: number,
): UnexploredHighDifficultyMultipliers {
  assertSupportedDifficulty(difficulty);
  if (difficulty <= 100) return { hp: 1, atk: 1, def: 1 };
  const progress = (difficulty - 100) / 20;
  const progressSquared = progress * progress;
  const progressCubed = progressSquared * progress;
  const stable = (value: number) => Number(value.toFixed(8));
  return {
    hp: stable(1 + 2 * progress + progressSquared + 3 * progressCubed),
    atk: stable(
      1 + 1.5 * progress + 0.5 * progressSquared + 1.5 * progressCubed,
    ),
    def: stable(1 + 0.1 * progress + 0.2 * progressSquared),
  };
}

export function unexploredCalibratedActionRatio(
  difficulty: number,
  band: UnexploredSpeedBand,
): number {
  const monsterSpd = convertedMonsterSpd(
    difficulty,
    unexploredRawSpd(difficulty, band),
  );
  return actionInterval(monsterSpd) / actionInterval(CALIBRATION_PLAYER_SPD);
}

export function unexploredAttackCompensation(
  difficulty: number,
  band: UnexploredSpeedBand,
): number {
  const sourceRate = actionRate(
    convertedMonsterSpd(difficulty, SOURCE_MEDIAN_RAW_MONSTER_SPD),
  );
  const targetRate = actionRate(
    convertedMonsterSpd(
      difficulty,
      unexploredRawSpd(difficulty, band),
    ),
  );
  return (
    (sourceRate / targetRate) * unexploredPressureMultiplier(difficulty)
  );
}

export type UnexploredTempoRow = {
  difficulty: UnexploredSimulationDifficulty;
  band: UnexploredSpeedBand;
  rawSpd: number;
  playerActionsPerMonsterAction: number;
};

export function unexploredTempoRows(): UnexploredTempoRow[] {
  return UNEXPLORED_SIMULATION_DIFFICULTIES.flatMap((difficulty) =>
    UNEXPLORED_SPEED_BANDS.map((band) => ({
      difficulty,
      band,
      rawSpd: unexploredRawSpd(difficulty, band),
      playerActionsPerMonsterAction: unexploredCalibratedActionRatio(
        difficulty,
        band,
      ),
    })),
  );
}
