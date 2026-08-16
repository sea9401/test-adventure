function safeLifeLevel(level: number): number {
  return Math.max(1, Math.min(100, Math.floor(Number(level) || 1)));
}

function post50Levels(level: number): number {
  return Math.max(0, safeLifeLevel(level) - 50);
}

function roundHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

export function farmingPost50Bonuses(level: number): {
  yieldBonusPct: number;
  rareChancePct: number;
} {
  const safeLevel = safeLifeLevel(level);
  const rareChancePct =
    safeLevel >= 100
      ? 1
      : safeLevel >= 90
        ? 0.75
        : safeLevel >= 75
          ? 0.5
          : safeLevel >= 60
            ? 0.25
            : 0;
  return {
    yieldBonusPct: roundHundredth(post50Levels(safeLevel) * 0.1),
    rareChancePct,
  };
}

export function woodcuttingPost50Bonuses(level: number): {
  bonusLogChancePct: number;
  seedChancePct: number;
  rareResultChancePct: number;
} {
  const safeLevel = safeLifeLevel(level);
  return {
    bonusLogChancePct: roundHundredth(post50Levels(safeLevel) * 0.1),
    seedChancePct: safeLevel >= 60 ? 0.5 : 0,
    rareResultChancePct: safeLevel >= 90 ? 1 : 0,
  };
}

export function miningPost50Bonuses(level: number): {
  bonusOreChancePct: number;
  byproductChancePct: number;
  rareByproductChancePct: number;
} {
  const safeLevel = safeLifeLevel(level);
  return {
    bonusOreChancePct: roundHundredth(post50Levels(safeLevel) * 0.1),
    byproductChancePct: safeLevel >= 60 ? 0.5 : 0,
    rareByproductChancePct: safeLevel >= 90 ? 1 : 0,
  };
}

export function fishingPost50Bonuses(level: number): {
  sizeBonusPct: number;
  specialWeightPct: number;
  rareSizeBonusPct: number;
  bigCatchSizeBonusPct: number;
} {
  const safeLevel = safeLifeLevel(level);
  const sizeBonusPct =
    safeLevel <= 50
      ? 0
      : safeLevel <= 60
        ? (safeLevel - 50) / 10
        : 1 + (safeLevel - 60) * 0.05;
  const specialWeightPct =
    safeLevel <= 50
      ? 0
      : safeLevel <= 75
        ? (safeLevel - 50) * 0.12
        : 3 + (safeLevel - 75) * 0.08;
  return {
    sizeBonusPct: roundHundredth(sizeBonusPct),
    specialWeightPct: roundHundredth(specialWeightPct),
    rareSizeBonusPct: safeLevel >= 90 ? 1 : 0,
    bigCatchSizeBonusPct: safeLevel >= 100 ? 1 : 0,
  };
}

export function cookingPost50Bonuses(level: number): {
  masterpieceChancePct: number;
  materialReductionPct: number;
  rareIngredientSaveChancePct: number;
} {
  const safeLevel = safeLifeLevel(level);
  return {
    masterpieceChancePct: roundHundredth(post50Levels(safeLevel) * 0.1),
    materialReductionPct: safeLevel >= 75 ? 2 : 0,
    rareIngredientSaveChancePct: safeLevel >= 90 ? 2 : 0,
  };
}
