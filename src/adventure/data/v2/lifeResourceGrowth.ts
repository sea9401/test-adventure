export const LIFE_RESOURCE_GROWTH_VERSION = 2 as const;
export type V2LifeResourceGrowthVersion =
  | 1
  | typeof LIFE_RESOURCE_GROWTH_VERSION;

export type V2LifeResourceGrowth = {
  version: V2LifeResourceGrowthVersion;
  rolledLevel: number;
  baseHp: number;
  baseMp: number;
  gainedHp: number;
  gainedMp: number;
};

export type V2ResourceRange = {
  min: number;
  max: number;
};

export type V2LifeResourceRanges = {
  baseHp: V2ResourceRange;
  baseMp: V2ResourceRange;
  hpPerLevel: V2ResourceRange;
  mpPerLevel: V2ResourceRange;
};

export type PermanentResourceStats = {
  strFloor: number;
  vitCap: number;
  spiFloor: number;
  intCap: number;
};

export const MP_LEVEL_STEP_SCALE = 0.4;

function growthStep(value: number, baseline: number): number {
  return Math.floor(Math.max(0, value - baseline) / 10);
}

export function lifeResourceRanges(
  input: PermanentResourceStats,
  version: V2LifeResourceGrowthVersion = LIFE_RESOURCE_GROWTH_VERSION,
): V2LifeResourceRanges {
  const str = growthStep(input.strFloor, 15);
  const spi = growthStep(input.spiFloor, 15);
  const vit = growthStep(input.vitCap, 60);
  const int = growthStep(input.intCap, 60);
  const spiLevelStep =
    version === 1 ? spi : Math.floor(spi * MP_LEVEL_STEP_SCALE);
  const intLevelStep =
    version === 1 ? int : Math.floor(int * MP_LEVEL_STEP_SCALE);
  const hpMin = 150 + 2 * str;
  const mpMin = 65 + spi;
  const hpLevelMin = 8 + str;
  const mpLevelMin = 3 + spiLevelStep;

  return {
    baseHp: { min: hpMin, max: hpMin + 30 + 2 * vit },
    baseMp: { min: mpMin, max: mpMin + 30 + int },
    hpPerLevel: { min: hpLevelMin, max: hpLevelMin + 4 + vit },
    mpPerLevel: {
      min: mpLevelMin,
      max: mpLevelMin + 2 + intLevelStep,
    },
  };
}

export function trainedIntSpiMpBonus(stats: {
  int: number;
  spi: number;
}): number {
  const trainedAboveBaseline = (value: number): number => {
    const normalized = Number.isFinite(value) ? Math.floor(value) : 0;
    return Math.max(0, normalized - 15);
  };
  return trainedAboveBaseline(stats.int) + trainedAboveBaseline(stats.spi);
}

function rollRange(range: V2ResourceRange, rng: () => number): number {
  const raw = rng();
  const normalized = Number.isFinite(raw)
    ? Math.max(0, Math.min(1 - Number.EPSILON, raw))
    : 0;
  return range.min + Math.floor(normalized * (range.max - range.min + 1));
}

export function rollInitialLifeResourceGrowth(
  ranges: V2LifeResourceRanges,
  rng: () => number = Math.random,
): V2LifeResourceGrowth {
  return {
    version: LIFE_RESOURCE_GROWTH_VERSION,
    rolledLevel: 1,
    baseHp: rollRange(ranges.baseHp, rng),
    baseMp: rollRange(ranges.baseMp, rng),
    gainedHp: 0,
    gainedMp: 0,
  };
}

export function rollLifeResourceLevels(
  record: V2LifeResourceGrowth,
  currentLevel: number,
  levelsGained: number,
  ranges: V2LifeResourceRanges,
  rng: () => number = Math.random,
): { record: V2LifeResourceGrowth; hpGain: number; mpGain: number } {
  const startLevel = Math.max(1, Math.floor(currentLevel));
  // 과거 전직 경로가 레벨만 1로 내린 저장값은 같은 Lv.1 기본 굴림을 보존한 채 누적만
  // 초기화한다. 반대로 기록이 뒤처졌다면 빠진 레벨을 먼저 채워 이후 레벨업이 막히지 않게 한다.
  // 복구분은 이번 레벨업 표시값(hpGain/mpGain)에는 포함하지 않는다.
  let alignedRecord =
    record.rolledLevel > startLevel
      ? resetLifeResourceLevels(record)
      : record;
  if (alignedRecord.rolledLevel < startLevel) {
    let missingHp = 0;
    let missingMp = 0;
    for (
      let level = alignedRecord.rolledLevel;
      level < startLevel;
      level += 1
    ) {
      missingHp += rollRange(ranges.hpPerLevel, rng);
      missingMp += rollRange(ranges.mpPerLevel, rng);
    }
    alignedRecord = {
      ...alignedRecord,
      rolledLevel: startLevel,
      gainedHp: alignedRecord.gainedHp + missingHp,
      gainedMp: alignedRecord.gainedMp + missingMp,
    };
  }

  const count = Math.max(0, Math.floor(levelsGained));
  let hpGain = 0;
  let mpGain = 0;
  for (let i = 0; i < count; i += 1) {
    hpGain += rollRange(ranges.hpPerLevel, rng);
    mpGain += rollRange(ranges.mpPerLevel, rng);
  }

  return {
    record: {
      ...alignedRecord,
      rolledLevel: startLevel + count,
      gainedHp: alignedRecord.gainedHp + hpGain,
      gainedMp: alignedRecord.gainedMp + mpGain,
    },
    hpGain,
    mpGain,
  };
}

export function resetLifeResourceLevels(
  record: V2LifeResourceGrowth,
): V2LifeResourceGrowth {
  return {
    ...record,
    rolledLevel: 1,
    gainedHp: 0,
    gainedMp: 0,
  };
}

function nonNegativeInt(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0
    ? raw
    : null;
}

export function parseLifeResourceGrowth(
  raw: unknown,
): V2LifeResourceGrowth | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const version = obj.version;
  if (version !== 1 && version !== LIFE_RESOURCE_GROWTH_VERSION) return null;
  const rolledLevel = nonNegativeInt(obj.rolledLevel);
  const baseHp = nonNegativeInt(obj.baseHp);
  const baseMp = nonNegativeInt(obj.baseMp);
  const gainedHp = nonNegativeInt(obj.gainedHp);
  const gainedMp = nonNegativeInt(obj.gainedMp);
  if (
    rolledLevel == null ||
    rolledLevel < 1 ||
    baseHp == null ||
    baseHp < 1 ||
    baseMp == null ||
    baseMp < 1 ||
    gainedHp == null ||
    gainedMp == null
  ) {
    return null;
  }
  return { version, rolledLevel, baseHp, baseMp, gainedHp, gainedMp };
}
