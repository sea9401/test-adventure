export const LIFE_LEGACY_LEVEL_CAP = 50;
export const LIFE_LEVEL_CAP = 100;
export const LIFE_LEVEL_CURVE_VERSION = 2;
export const LIFE_LEVEL_MIGRATION_NOTICE =
  "기존 초과 숙련 경험치의 일부가 신규 성장 구간에 반영되었습니다.";

export function lifeLevelMigrationMessage(
  message: string,
  migrated: boolean,
): string {
  return migrated ? `${LIFE_LEVEL_MIGRATION_NOTICE} · ${message}` : message;
}

export type LegacyLifeXpThreshold = (level: number) => number;

export type LifeXpNormalization = {
  xp: number;
  levelCurveVersion: number;
  migrated: boolean;
};

function finiteNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizedCurveVersion(version: number | undefined): number {
  if (!Number.isFinite(version)) return 1;
  return Math.max(1, Math.floor(version ?? 1));
}

export function extendedLifeXpThreshold(
  level: number,
  legacyThreshold: LegacyLifeXpThreshold,
): number {
  const safeLevel = Math.max(
    1,
    Math.min(LIFE_LEVEL_CAP, Math.floor(level) || 1),
  );
  if (safeLevel <= LIFE_LEGACY_LEVEL_CAP) {
    return finiteNonNegativeInteger(legacyThreshold(safeLevel));
  }

  const level50Xp = finiteNonNegativeInteger(
    legacyThreshold(LIFE_LEGACY_LEVEL_CAP),
  );
  const x = (safeLevel - LIFE_LEGACY_LEVEL_CAP) / 50;
  const curve = 0.5 * x + 0.5 * x ** 3;
  return level50Xp + Math.round(4 * level50Xp * curve);
}

export function extendedLifeLevelForXp(
  xp: number,
  legacyThreshold: LegacyLifeXpThreshold,
): number {
  const safeXp = finiteNonNegativeInteger(xp);
  let low = 1;
  let high = LIFE_LEVEL_CAP;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (extendedLifeXpThreshold(middle, legacyThreshold) <= safeXp) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low;
}

export function normalizeLifeXp({
  xp,
  levelCurveVersion,
  legacyThreshold,
}: {
  xp: number;
  levelCurveVersion?: number;
  legacyThreshold: LegacyLifeXpThreshold;
}): LifeXpNormalization {
  const safeXp = finiteNonNegativeInteger(xp);
  const currentVersion = normalizedCurveVersion(levelCurveVersion);
  const level100Xp = extendedLifeXpThreshold(LIFE_LEVEL_CAP, legacyThreshold);

  if (currentVersion >= LIFE_LEVEL_CURVE_VERSION) {
    return {
      xp: Math.min(safeXp, level100Xp),
      levelCurveVersion: currentVersion,
      migrated: false,
    };
  }

  const level50Xp = extendedLifeXpThreshold(
    LIFE_LEGACY_LEVEL_CAP,
    legacyThreshold,
  );
  if (safeXp <= level50Xp) {
    return {
      xp: safeXp,
      levelCurveVersion: LIFE_LEVEL_CURVE_VERSION,
      migrated: false,
    };
  }

  const level60Xp = extendedLifeXpThreshold(60, legacyThreshold);
  const creditedXp = Math.floor((safeXp - level50Xp) * 0.25);
  return {
    xp: Math.min(level50Xp + creditedXp, level60Xp),
    levelCurveVersion: LIFE_LEVEL_CURVE_VERSION,
    migrated: creditedXp > 0,
  };
}

export function applyLifeXpGain({
  xp,
  gainedXp,
  legacyThreshold,
}: {
  xp: number;
  gainedXp: number;
  legacyThreshold: LegacyLifeXpThreshold;
}): { xp: number; appliedXp: number } {
  const level100Xp = extendedLifeXpThreshold(LIFE_LEVEL_CAP, legacyThreshold);
  const currentXp = Math.min(finiteNonNegativeInteger(xp), level100Xp);
  const safeGain = finiteNonNegativeInteger(gainedXp);
  const nextXp = Math.min(level100Xp, currentXp + safeGain);
  return { xp: nextXp, appliedXp: nextXp - currentXp };
}

export function lifeLevelProgress({
  xp,
  legacyThreshold,
}: {
  xp: number;
  legacyThreshold: LegacyLifeXpThreshold;
}): {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  maxLevel: boolean;
} {
  const level100Xp = extendedLifeXpThreshold(LIFE_LEVEL_CAP, legacyThreshold);
  const safeXp = Math.min(finiteNonNegativeInteger(xp), level100Xp);
  const level = extendedLifeLevelForXp(safeXp, legacyThreshold);
  if (level >= LIFE_LEVEL_CAP) {
    return { level: LIFE_LEVEL_CAP, xpIntoLevel: 0, xpForNext: 0, maxLevel: true };
  }

  const currentThreshold = extendedLifeXpThreshold(level, legacyThreshold);
  const nextThreshold = extendedLifeXpThreshold(level + 1, legacyThreshold);
  return {
    level,
    xpIntoLevel: safeXp - currentThreshold,
    xpForNext: nextThreshold - currentThreshold,
    maxLevel: false,
  };
}
