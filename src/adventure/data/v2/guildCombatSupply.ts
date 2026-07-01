export const GUILD_COMBAT_SUPPLY_MAX_LEVEL = 10;

export const GUILD_COMBAT_SUPPLY_LEVEL_COSTS = [
  200, 400, 700, 1100, 1600, 2300, 3200, 4400, 6000, 8000,
] as const;

export const GUILD_COMBAT_SUPPLY_IDS = [
  "combat_gold",
  "combat_exp",
  "combat_proficiency",
] as const;

export type GuildCombatSupplyId = (typeof GUILD_COMBAT_SUPPLY_IDS)[number];

export type GuildCombatSupplyLevels = Record<GuildCombatSupplyId, number>;

export type GuildCombatSupplyBuffSlot = {
  buffId: string;
  tier: number;
  installedAt: string;
};

export type GuildCombatSupplyDef = {
  id: GuildCombatSupplyId;
  name: string;
  shortName: string;
  description: string;
  effectLabel: (level: number) => string;
};

export const EMPTY_GUILD_COMBAT_SUPPLY_LEVELS: GuildCombatSupplyLevels = {
  combat_gold: 0,
  combat_exp: 0,
  combat_proficiency: 0,
};

export const GUILD_COMBAT_SUPPLY_DEFS: Record<
  GuildCombatSupplyId,
  GuildCombatSupplyDef
> = {
  combat_gold: {
    id: "combat_gold",
    name: "골드 보급",
    shortName: "골드",
    description: "사냥 골드 획득량 증가",
    effectLabel: (level) => `골드 +${goldSupplyBonusPct(level)}%`,
  },
  combat_exp: {
    id: "combat_exp",
    name: "EXP 보급",
    shortName: "EXP",
    description: "사냥 경험치 획득량 증가",
    effectLabel: (level) => `EXP +${expSupplyBonusPct(level)}%`,
  },
  combat_proficiency: {
    id: "combat_proficiency",
    name: "숙달 보급",
    shortName: "숙달",
    description: "사냥 승리 시 추가 숙달 포인트 획득 확률",
    effectLabel: (level) => `+1 숙달 ${proficiencySupplyChancePct(level)}%`,
  },
};

export const GUILD_COMBAT_SUPPLY_LIST = GUILD_COMBAT_SUPPLY_IDS.map(
  (id) => GUILD_COMBAT_SUPPLY_DEFS[id],
);

export function isGuildCombatSupplyId(
  value: unknown,
): value is GuildCombatSupplyId {
  return (
    typeof value === "string" &&
    (GUILD_COMBAT_SUPPLY_IDS as readonly string[]).includes(value)
  );
}

export function clampGuildCombatSupplyLevel(level: unknown): number {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(GUILD_COMBAT_SUPPLY_MAX_LEVEL, n));
}

function parseExistingBuffTier(level: unknown): number {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

export function parseGuildCombatSupplyLevels(
  rawBuffs: unknown,
): GuildCombatSupplyLevels {
  const levels: GuildCombatSupplyLevels = {
    ...EMPTY_GUILD_COMBAT_SUPPLY_LEVELS,
  };
  if (!Array.isArray(rawBuffs)) return levels;
  for (const raw of rawBuffs) {
    if (typeof raw !== "object" || raw === null) continue;
    const slot = raw as { buffId?: unknown; tier?: unknown };
    if (!isGuildCombatSupplyId(slot.buffId)) continue;
    levels[slot.buffId] = Math.max(
      levels[slot.buffId],
      clampGuildCombatSupplyLevel(slot.tier),
    );
  }
  return levels;
}

export function guildCombatSupplyNextCost(level: number): number | null {
  const safeLevel = clampGuildCombatSupplyLevel(level);
  if (safeLevel >= GUILD_COMBAT_SUPPLY_MAX_LEVEL) return null;
  return GUILD_COMBAT_SUPPLY_LEVEL_COSTS[safeLevel] ?? null;
}

export function goldSupplyBonusPct(level: number): number {
  return clampGuildCombatSupplyLevel(level);
}

export function expSupplyBonusPct(level: number): number {
  return clampGuildCombatSupplyLevel(level);
}

export function proficiencySupplyChancePct(level: number): number {
  return clampGuildCombatSupplyLevel(level) * 5;
}

export function guildCombatSupplyBonuses(levels: GuildCombatSupplyLevels): {
  goldPct: number;
  expPct: number;
  proficiencyChancePct: number;
} {
  return {
    goldPct: goldSupplyBonusPct(levels.combat_gold),
    expPct: expSupplyBonusPct(levels.combat_exp),
    proficiencyChancePct: proficiencySupplyChancePct(
      levels.combat_proficiency,
    ),
  };
}

export function applyGuildCombatRewardBonus(
  amount: number,
  bonusPct: number,
): number {
  const safeAmount = Math.max(0, Math.floor(amount));
  const safePct = Math.max(0, Math.floor(bonusPct));
  if (safeAmount <= 0 || safePct <= 0) return safeAmount;
  return Math.floor((safeAmount * (100 + safePct)) / 100);
}

export function rollGuildCombatProficiencyBonus(
  chancePct: number,
  rng: () => number,
): number {
  const safeChance = Math.max(0, Math.min(100, chancePct));
  if (safeChance <= 0) return 0;
  return rng() < safeChance / 100 ? 1 : 0;
}

export function upsertGuildCombatSupplyBuff(
  rawBuffs: unknown,
  supplyId: GuildCombatSupplyId,
  nextLevel: number,
  installedAt: string,
): GuildCombatSupplyBuffSlot[] {
  const existing = Array.isArray(rawBuffs)
    ? rawBuffs
        .filter(
          (raw) =>
            typeof raw === "object" &&
            raw !== null &&
            typeof (raw as { buffId?: unknown }).buffId === "string",
        )
        .map((raw) => {
          const slot = raw as {
            buffId: string;
            tier?: unknown;
            installedAt?: unknown;
          };
          return {
            buffId: slot.buffId,
            tier: parseExistingBuffTier(slot.tier),
            installedAt:
              typeof slot.installedAt === "string"
                ? slot.installedAt
                : installedAt,
          };
        })
    : [];
  const safeLevel = clampGuildCombatSupplyLevel(nextLevel);
  let updated = false;
  const next = existing.map((slot) => {
    if (slot.buffId !== supplyId) return slot;
    updated = true;
    return {
      ...slot,
      tier: safeLevel,
      installedAt: slot.installedAt ?? installedAt,
    };
  });
  if (!updated) {
    next.push({ buffId: supplyId, tier: safeLevel, installedAt });
  }
  return next;
}
