import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import {
  DANGEROUS_FISHING_EXCHANGE_ENTRIES,
  DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID,
  eligibleCatchMaterialIds,
  validateCatchSelection,
  type DangerousFishingExchangeEntry,
} from "@/adventure/v2/dangerousFishingExchange";
import {
  isMuseunCosmeticItemId,
  parseMuseunCosmetics,
  unlockPermanentMuseunCosmetic,
} from "@/adventure/data/v2/museunCosmetics";
import {
  DANGEROUS_FISHING_SAVE_KEY,
  parseDangerousFishingState,
  type DangerousFishingState,
} from "@/adventure/v2/dangerousFishingState";
import {
  FISHING_PROGRESS_KEY,
  emptyFishingProgression,
  fishingLevelForXp,
  parseFishingProgression,
} from "@/adventure/v2/fishingProgression";
import {
  FISHING_WALLET_KEY,
  fishingWalletWithCoins,
  walletCoins,
} from "@/lib/server/fishing/coins";
import {
  grantTitleIfMissingInTx,
  ownedTitleIdsOf,
} from "@/lib/server/grantTitle";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";

export const DANGEROUS_FISHING_EXCHANGE_STATE_KEY =
  "dangerous-fishing-exchange.v1";
export const DANGEROUS_FISHING_EXCHANGE_MIN_LEVEL = 15;
export const DANGEROUS_FISHING_EXCHANGE_MAX_BATCHES = 100;
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_OPERATION_IDS = 128;

type ExchangeOperation = { id: string; completedAt: number };
export type DangerousFishingExchangeState = {
  version: 1;
  operations: ExchangeOperation[];
};

type CharacterSave = Record<string, unknown> & {
  materials?: unknown;
  museunCosmetics?: unknown;
};

type ExchangeRequest = {
  operationId: unknown;
  entryId: unknown;
  batches: unknown;
  selectedMaterials?: unknown;
  now: number;
};

type ExchangeFailure = {
  ok: false;
  error: string;
  status: number;
  [key: string]: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(error: string, status: number, detail = {}): ExchangeFailure {
  return { ok: false, error, status, ...detail };
}

function positiveMaterials(raw: unknown): Record<string, number> {
  const materials: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return materials;
  for (const [materialId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    const count = Math.floor(Number(value));
    if (Number.isSafeInteger(count) && count > 0) materials[materialId] = count;
  }
  return materials;
}

function selectedMaterials(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const selected: Record<string, number> = {};
  for (const [materialId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) return null;
    selected[materialId] = Number(value);
  }
  return selected;
}

const relevantMaterialIds = [
  ...new Set(
    DANGEROUS_FISHING_EXCHANGE_ENTRIES.flatMap((entry) =>
      entry.cost.kind === "catch"
        ? eligibleCatchMaterialIds(entry.cost.rarity)
        : Object.keys(entry.cost.materials),
    ),
  ),
];

function materialView(materials: Record<string, number>) {
  return Object.fromEntries(
    relevantMaterialIds
      .filter((materialId) => (materials[materialId] ?? 0) > 0)
      .map((materialId) => [materialId, materials[materialId]]),
  );
}

export function parseDangerousFishingExchangeState(
  raw: unknown,
  now: number,
): DangerousFishingExchangeState {
  const operations: ExchangeOperation[] = [];
  const seen = new Set<string>();
  const rawOperations =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as { operations?: unknown }).operations
      : null;
  if (Array.isArray(rawOperations)) {
    for (const item of rawOperations) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const { id, completedAt } = item as {
        id?: unknown;
        completedAt?: unknown;
      };
      if (
        typeof id !== "string" ||
        !UUID_PATTERN.test(id) ||
        !Number.isSafeInteger(completedAt) ||
        Number(completedAt) <= now - IDEMPOTENCY_WINDOW_MS ||
        Number(completedAt) > now ||
        seen.has(id)
      ) {
        continue;
      }
      seen.add(id);
      operations.push({ id, completedAt: Number(completedAt) });
    }
  }
  operations.sort((left, right) => right.completedAt - left.completedAt);
  return { version: 1, operations: operations.slice(0, MAX_OPERATION_IDS) };
}

function ownsEntryOutput(
  entry: DangerousFishingExchangeEntry,
  dangerous: DangerousFishingState,
  ownedTitleIds: readonly string[],
  ownedCosmeticIds: readonly string[],
): boolean {
  const output = entry.output;
  if (output.kind === "gear") {
    const key =
      output.gearKind === "rod"
        ? "rods"
        : output.gearKind === "reel"
          ? "reels"
          : "lines";
    return (dangerous.ownedGear[key] as readonly string[]).includes(
      output.gearId,
    );
  }
  if (output.kind === "title") return ownedTitleIds.includes(output.titleId);
  if (output.kind === "cosmetic") {
    return ownedCosmeticIds.includes(output.itemId);
  }
  return false;
}

function affordableBatches(
  entry: DangerousFishingExchangeEntry,
  materials: Record<string, number>,
  fishingCoins: number,
): number {
  if (entry.cost.kind === "catch") {
    const total = eligibleCatchMaterialIds(entry.cost.rarity).reduce(
      (sum, materialId) => sum + (materials[materialId] ?? 0),
      0,
    );
    return Math.floor(total / entry.cost.count);
  }
  const limits = Object.entries(entry.cost.materials).map(
    ([materialId, count]) => Math.floor((materials[materialId] ?? 0) / count),
  );
  if (entry.cost.fishingCoins > 0) {
    limits.push(Math.floor(fishingCoins / entry.cost.fishingCoins));
  }
  return limits.length > 0 ? Math.min(...limits) : 0;
}

function buildView(args: {
  fishingLevel: number;
  character: CharacterSave;
  walletRaw: unknown;
  dangerous: DangerousFishingState;
  adventureLogRaw: unknown;
}) {
  const materials = positiveMaterials(args.character.materials);
  const fishingCoins = walletCoins(args.walletRaw);
  const cosmetics = parseMuseunCosmetics(args.character.museunCosmetics);
  const ownedTitleIds = ownedTitleIdsOf(args.adventureLogRaw);
  const ownedCosmeticIds = cosmetics.owned;
  const unlocked = args.fishingLevel >= DANGEROUS_FISHING_EXCHANGE_MIN_LEVEL;
  return {
    ok: true as const,
    unlocked,
    requiredLevel: DANGEROUS_FISHING_EXCHANGE_MIN_LEVEL,
    fishingLevel: args.fishingLevel,
    materials: materialView(materials),
    fishingCoins,
    state: {
      ownedGear: args.dangerous.ownedGear,
      baitCounts: args.dangerous.baitCounts,
    },
    ownedTitleIds,
    ownedCosmeticIds,
    entries: DANGEROUS_FISHING_EXCHANGE_ENTRIES.map((entry) => {
      const alreadyOwned = ownsEntryOutput(
        entry,
        args.dangerous,
        ownedTitleIds,
        ownedCosmeticIds,
      );
      const affordable = affordableBatches(entry, materials, fishingCoins);
      return {
        ...entry,
        alreadyOwned,
        maxBatches: unlocked
          ? Math.min(
              DANGEROUS_FISHING_EXCHANGE_MAX_BATCHES,
              entry.repeatable ? affordable : alreadyOwned ? 0 : Math.min(1, affordable),
            )
          : 0,
      };
    }),
  };
}

export async function readDangerousFishingExchangeView(
  executor: DbExecutor,
  userId: string,
) {
  const [character, walletRaw, dangerousRaw, progressRaw, adventureLogRaw] =
    await Promise.all([
      readSave<CharacterSave>(executor, userId, "character.v2", {}),
      readSave(executor, userId, FISHING_WALLET_KEY, {}),
      readSave(executor, userId, DANGEROUS_FISHING_SAVE_KEY, {}),
      readSave(
        executor,
        userId,
        FISHING_PROGRESS_KEY,
        emptyFishingProgression(),
      ),
      readSave(executor, userId, "adventure-log.v2", {}),
    ]);
  return buildView({
    fishingLevel: fishingLevelForXp(parseFishingProgression(progressRaw).xp),
    character,
    walletRaw,
    dangerous: parseDangerousFishingState(dangerousRaw),
    adventureLogRaw,
  });
}

function subtractMaterials(
  materials: Record<string, number>,
  costs: Record<string, number>,
) {
  const next = { ...materials };
  for (const [materialId, count] of Object.entries(costs)) {
    const remaining = (next[materialId] ?? 0) - count;
    if (remaining > 0) next[materialId] = remaining;
    else delete next[materialId];
  }
  return next;
}

function grantDangerousOutput(
  dangerous: DangerousFishingState,
  entry: DangerousFishingExchangeEntry,
  batches: number,
): DangerousFishingState {
  const output = entry.output;
  if (output.kind === "bait") {
    return {
      ...dangerous,
      baitCounts: {
        ...dangerous.baitCounts,
        [output.baitId]:
          (dangerous.baitCounts[output.baitId] ?? 0) + output.count * batches,
      },
    };
  }
  if (output.kind !== "gear") return dangerous;
  const key =
    output.gearKind === "rod"
      ? "rods"
      : output.gearKind === "reel"
        ? "reels"
        : "lines";
  return {
    ...dangerous,
    ownedGear: {
      ...dangerous.ownedGear,
      [key]: [...dangerous.ownedGear[key], output.gearId],
    },
  } as DangerousFishingState;
}

export async function exchangeDangerousFishingInTx(
  tx: DbExecutor,
  userId: string,
  request: ExchangeRequest,
) {
  if (
    typeof request.operationId !== "string" ||
    !UUID_PATTERN.test(request.operationId)
  ) {
    return fail("bad_request", 400);
  }
  const entry =
    typeof request.entryId === "string"
      ? DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID.get(request.entryId)
      : undefined;
  if (!entry) return fail("invalid_entry", 400);
  if (
    !Number.isSafeInteger(request.batches) ||
    Number(request.batches) < 1 ||
    Number(request.batches) > DANGEROUS_FISHING_EXCHANGE_MAX_BATCHES ||
    (!entry.repeatable && Number(request.batches) !== 1)
  ) {
    return fail("invalid_quantity", 400);
  }
  const batches = Number(request.batches);
  const selection =
    entry.cost.kind === "catch"
      ? selectedMaterials(request.selectedMaterials)
      : null;
  if (
    entry.cost.kind === "catch" &&
    (!selection ||
      !validateCatchSelection(
        entry.cost.rarity,
        entry.cost.count * batches,
        selection,
      ))
  ) {
    return fail("invalid_material_selection", 400);
  }
  const cosmeticItemId =
    entry.output.kind === "cosmetic" &&
    isMuseunCosmeticItemId(entry.output.itemId)
      ? entry.output.itemId
      : null;
  if (entry.output.kind === "cosmetic" && cosmeticItemId === null) {
    return fail("invalid_entry", 400);
  }

  // 사용자 행은 항상 존재하며, 저장 행이 아직 없는 첫 교환도 같은 사용자끼리 직렬화한다.
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("update")
    .limit(1);

  const dangerous = parseDangerousFishingState(
    await lockSaveForUpdate(tx, userId, DANGEROUS_FISHING_SAVE_KEY, {}),
  );
  const progress = parseFishingProgression(
    await lockSaveForUpdate(
      tx,
      userId,
      FISHING_PROGRESS_KEY,
      emptyFishingProgression(),
    ),
  );
  const character = await lockSaveForUpdate<CharacterSave>(
    tx,
    userId,
    "character.v2",
    {},
  );
  const walletRaw = await lockSaveForUpdate(
    tx,
    userId,
    FISHING_WALLET_KEY,
    {},
  );
  const exchangeState = parseDangerousFishingExchangeState(
    await lockSaveForUpdate(
      tx,
      userId,
      DANGEROUS_FISHING_EXCHANGE_STATE_KEY,
      {},
    ),
    request.now,
  );
  const adventureLogRaw = await readSave(tx, userId, "adventure-log.v2", {});
  const fishingLevel = fishingLevelForXp(progress.xp);
  if (fishingLevel < DANGEROUS_FISHING_EXCHANGE_MIN_LEVEL) {
    return fail("fishing_level_locked", 403, {
      requiredLevel: DANGEROUS_FISHING_EXCHANGE_MIN_LEVEL,
      fishingLevel,
    });
  }

  if (
    exchangeState.operations.some(
      (operation) => operation.id === request.operationId,
    )
  ) {
    return {
      ...buildView({
        fishingLevel,
        character,
        walletRaw,
        dangerous,
        adventureLogRaw,
      }),
      status: 200,
      alreadyProcessed: true as const,
      operationId: request.operationId,
    };
  }

  const materials = positiveMaterials(character.materials);
  const costs =
    entry.cost.kind === "catch"
      ? selection!
      : Object.fromEntries(
          Object.entries(entry.cost.materials).map(([materialId, count]) => [
            materialId,
            count * batches,
          ]),
        );
  if (
    Object.entries(costs).some(
      ([materialId, count]) => (materials[materialId] ?? 0) < count,
    )
  ) {
    return fail("insufficient_materials", 402, {
      materials: materialView(materials),
    });
  }
  const fishingCoins = walletCoins(walletRaw);
  const coinCost =
    entry.cost.kind === "materials"
      ? entry.cost.fishingCoins * batches
      : 0;
  if (fishingCoins < coinCost) {
    return fail("insufficient_coins", 402, { fishingCoins });
  }

  const cosmetics = parseMuseunCosmetics(character.museunCosmetics);
  const ownedTitleIds = ownedTitleIdsOf(adventureLogRaw);
  if (
    !entry.repeatable &&
    ownsEntryOutput(entry, dangerous, ownedTitleIds, cosmetics.owned)
  ) {
    return fail("already_owned", 409);
  }

  let nextAdventureLogRaw = adventureLogRaw;
  if (entry.output.kind === "title") {
    const granted = await grantTitleIfMissingInTx(
      tx,
      userId,
      entry.output.titleId,
      request.now,
    );
    if (!granted) return fail("already_owned", 409);
    nextAdventureLogRaw = {
      ...(adventureLogRaw as Record<string, unknown>),
      titles: {
        ...((adventureLogRaw as { titles?: Record<string, unknown> }).titles ?? {}),
        [entry.output.titleId]: { obtainedAt: request.now },
      },
    };
  }

  const nextMaterials = subtractMaterials(materials, costs);
  const nextDangerous = grantDangerousOutput(dangerous, entry, batches);
  const nextCosmetics =
    entry.output.kind === "cosmetic"
      ? unlockPermanentMuseunCosmetic(
          cosmetics,
          cosmeticItemId!,
        ).state
      : cosmetics;
  const nextCharacter: CharacterSave = {
    ...character,
    materials: nextMaterials,
    ...(entry.output.kind === "cosmetic"
      ? { museunCosmetics: nextCosmetics }
      : {}),
  };
  const nextWallet = fishingWalletWithCoins(walletRaw, fishingCoins - coinCost);
  const nextExchangeState: DangerousFishingExchangeState = {
    version: 1,
    operations: [
      { id: request.operationId, completedAt: request.now },
      ...exchangeState.operations.filter(
        (operation) => operation.id !== request.operationId,
      ),
    ].slice(0, MAX_OPERATION_IDS),
  };

  await upsertSave(tx, userId, "character.v2", nextCharacter);
  if (entry.output.kind === "bait" || entry.output.kind === "gear") {
    await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, nextDangerous);
  }
  if (coinCost > 0) {
    await upsertSave(tx, userId, FISHING_WALLET_KEY, nextWallet);
  }
  await upsertSave(
    tx,
    userId,
    DANGEROUS_FISHING_EXCHANGE_STATE_KEY,
    nextExchangeState,
  );

  return {
    ...buildView({
      fishingLevel,
      character: nextCharacter,
      walletRaw: nextWallet,
      dangerous: nextDangerous,
      adventureLogRaw: nextAdventureLogRaw,
    }),
    status: 200,
    alreadyProcessed: false as const,
    operationId: request.operationId,
    entryId: entry.id,
    batches,
  };
}
