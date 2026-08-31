import {
  SETTLEMENT_RESOURCE_KEYS,
  nextSettlementBuildingUpgrade,
  type AnySettlementBuildingUpgradeDef,
  type SettlementBuildingId,
  type SettlementBuildingUpgradeCost,
  type SettlementResources,
} from "./settlement";

export const ADVENTURER_ASSOCIATION_FACILITY_IDS = [
  "guild_smithy",
  "training_ground",
  "exploration_hq",
  "alchemy_workshop",
  "dining_hall",
  "trade_post",
] as const satisfies readonly SettlementBuildingId[];

export type AdventurerAssociationFacilityId =
  (typeof ADVENTURER_ASSOCIATION_FACILITY_IDS)[number];

export type AdventurerAssociationFacilityProgress = {
  buildingId: AdventurerAssociationFacilityId;
  level: number;
  targetLevel: number | null;
  materials: SettlementResources;
  gold: number;
};

// 공공시설은 길드보다 참여 인원이 훨씬 많다. 재료 목표는 10배, 골드는 3배로
// 잡고 길드에서 사용하던 명성은 1점당 100,000G로 환산한다.
export const ASSOCIATION_MATERIAL_COST_MULTIPLIER = 10;
export const ASSOCIATION_GOLD_COST_MULTIPLIER = 3;
export const ASSOCIATION_FAME_TO_GOLD = 100_000;

export function isAdventurerAssociationFacilityId(
  value: unknown,
): value is AdventurerAssociationFacilityId {
  return (
    typeof value === "string" &&
    (ADVENTURER_ASSOCIATION_FACILITY_IDS as readonly string[]).includes(value)
  );
}

export function associationUpgradeCost(
  upgrade: AnySettlementBuildingUpgradeDef,
): SettlementBuildingUpgradeCost {
  const result: SettlementBuildingUpgradeCost = {};
  for (const key of SETTLEMENT_RESOURCE_KEYS) {
    const amount = Math.max(0, Math.floor(upgrade.cost[key] ?? 0));
    if (amount > 0) {
      result[key] = amount * ASSOCIATION_MATERIAL_COST_MULTIPLIER;
    }
  }
  const guildGold = Math.max(0, Math.floor(upgrade.cost.gold ?? 0));
  const guildFame = Math.max(0, Math.floor(upgrade.cost.fame ?? 0));
  result.gold =
    guildGold * ASSOCIATION_GOLD_COST_MULTIPLIER +
    guildFame * ASSOCIATION_FAME_TO_GOLD;
  return result;
}

export function nextAssociationFacilityUpgrade(
  buildingId: AdventurerAssociationFacilityId,
  level: number,
): (AnySettlementBuildingUpgradeDef & { associationCost: SettlementBuildingUpgradeCost }) | null {
  const next = nextSettlementBuildingUpgrade(buildingId, level);
  return next ? { ...next, associationCost: associationUpgradeCost(next) } : null;
}

export function associationFacilityMaterialsComplete(
  donated: SettlementResources,
  required: SettlementBuildingUpgradeCost,
): boolean {
  return SETTLEMENT_RESOURCE_KEYS.every(
    (key) =>
      Math.max(0, Math.floor(donated[key] ?? 0)) >=
      Math.max(0, Math.floor(required[key] ?? 0)),
  );
}

export type WeeklyFacilitySource = "guild" | "association";

export type WeeklyFacilitySourceSelection = {
  weekKey: string;
  source: WeeklyFacilitySource;
  guildId?: number;
};

export const WEEKLY_FACILITY_SOURCE_SAVE_KEY =
  "facility-weekly-source.v1" as const;

export type WeeklyFacilitySourceState = Partial<
  Record<AdventurerAssociationFacilityId, WeeklyFacilitySourceSelection>
>;

const ASSOCIATION_TO_GUILD_TRANSFER_FACILITIES = new Set<AdventurerAssociationFacilityId>([
  "guild_smithy",
  "training_ground",
  "alchemy_workshop",
  "dining_hall",
]);

function positiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseWeeklyFacilitySourceState(
  raw: unknown,
): WeeklyFacilitySourceState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: WeeklyFacilitySourceState = {};
  for (const facilityId of ADVENTURER_ASSOCIATION_FACILITY_IDS) {
    const value = (raw as Record<string, unknown>)[facilityId];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (
      typeof row.weekKey === "string" &&
      (row.source === "guild" || row.source === "association")
    ) {
      const guildId = row.source === "guild" ? positiveInt(row.guildId) : undefined;
      result[facilityId] = {
        weekKey: row.weekKey,
        source: row.source,
        ...(guildId ? { guildId } : {}),
      };
    }
  }
  return result;
}

export function resolveWeeklyFacilitySourceClaim(
  facilityId: AdventurerAssociationFacilityId,
  current: WeeklyFacilitySourceSelection | undefined,
  request: WeeklyFacilitySourceSelection,
):
  | { ok: true; selection: WeeklyFacilitySourceSelection }
  | { ok: false; selected: WeeklyFacilitySource } {
  const requestedGuildId =
    request.source === "guild" ? positiveInt(request.guildId) : undefined;
  const selection: WeeklyFacilitySourceSelection = {
    weekKey: request.weekKey,
    source: request.source,
    ...(requestedGuildId ? { guildId: requestedGuildId } : {}),
  };
  if (!current || current.weekKey !== request.weekKey) {
    return { ok: true, selection };
  }
  if (current.source === request.source) {
    if (
      request.source === "guild" &&
      current.guildId != null &&
      requestedGuildId !== current.guildId
    ) {
      return { ok: false, selected: current.source };
    }
    return { ok: true, selection: { ...current, ...selection } };
  }
  if (
    current.source === "association" &&
    request.source === "guild" &&
    ASSOCIATION_TO_GUILD_TRANSFER_FACILITIES.has(facilityId)
  ) {
    return { ok: true, selection };
  }
  return { ok: false, selected: current.source };
}

export function weeklyFacilitySourcesAfterGuildJoin(
  state: WeeklyFacilitySourceState,
  weekKey: string,
  guildId: number,
): {
  state: WeeklyFacilitySourceState;
  transferred: AdventurerAssociationFacilityId[];
} {
  const next = { ...state };
  const transferred: AdventurerAssociationFacilityId[] = [];
  for (const facilityId of ASSOCIATION_TO_GUILD_TRANSFER_FACILITIES) {
    const current = state[facilityId];
    if (current?.weekKey !== weekKey || current.source !== "association") continue;
    next[facilityId] = { weekKey, source: "guild", guildId };
    transferred.push(facilityId);
  }
  return { state: next, transferred };
}
