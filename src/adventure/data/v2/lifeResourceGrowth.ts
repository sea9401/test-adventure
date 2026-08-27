export type V2LifeResourceGrowth = {
  version: 1;
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

function growthStep(value: number, baseline: number): number {
  return Math.floor(Math.max(0, value - baseline) / 10);
}

export function lifeResourceRanges(
  input: PermanentResourceStats,
): V2LifeResourceRanges {
  const str = growthStep(input.strFloor, 15);
  const spi = growthStep(input.spiFloor, 15);
  const vit = growthStep(input.vitCap, 60);
  const int = growthStep(input.intCap, 60);
  const hpMin = 150 + 2 * str;
  const mpMin = 65 + spi;
  const hpLevelMin = 8 + str;
  const mpLevelMin = 3 + spi;

  return {
    baseHp: { min: hpMin, max: hpMin + 30 + 2 * vit },
    baseMp: { min: mpMin, max: mpMin + 30 + int },
    hpPerLevel: { min: hpLevelMin, max: hpLevelMin + 4 + vit },
    mpPerLevel: { min: mpLevelMin, max: mpLevelMin + 2 + int },
  };
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
    version: 1,
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
  if (record.rolledLevel !== startLevel) {
    throw new Error("life_resource_level_mismatch");
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
      ...record,
      rolledLevel: startLevel + count,
      gainedHp: record.gainedHp + hpGain,
      gainedMp: record.gainedMp + mpGain,
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
  if (obj.version !== 1) return null;
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
  return { version: 1, rolledLevel, baseHp, baseMp, gainedHp, gainedMp };
}
