import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import {
  isDangerousLineId,
  isDangerousReelId,
  isDangerousRodId,
  type DangerousGearKind,
  type DangerousLineId,
  type DangerousReelId,
  type DangerousRodId,
} from "@/adventure/data/v2/dangerousFishing";
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
  type MuseunCosmeticItemId,
} from "@/adventure/data/v2/museunCosmetics";
import {
  DANGEROUS_FISHING_SAVE_KEY,
  parseDangerousFishingState,
  type DangerousFishingState,
} from "@/adventure/v2/dangerousFishingState";
import {
  DANGEROUS_GEAR_ENHANCEMENT_COSTS,
  dangerousGearEnhancementLevel,
  enhanceDangerousGear,
  selectEnhancementMaterials,
  type DangerousGearEnhancementLevel,
} from "@/adventure/v2/dangerousFishingEnhancement";
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

type DangerousGearId = DangerousRodId | DangerousReelId | DangerousLineId;

type UnboundExchangeOperation = {
  id: string;
  completedAt: number;
  action?: undefined;
};

type EnhancementOperation = {
  id: string;
  completedAt: number;
  action: "enhance";
  gearKind: DangerousGearKind;
  gearId: DangerousGearId;
  currentLevel: 0 | 1 | 2;
  nextLevel: DangerousGearEnhancementLevel;
};

type LegacyExchangeOperation = {
  id: string;
  completedAt: number;
  action: "exchange";
  entryId: string;
  batches: number;
  selectedMaterials: Record<string, number> | null;
};

type ExchangeOperation =
  | UnboundExchangeOperation
  | EnhancementOperation
  | LegacyExchangeOperation;
export type DangerousFishingExchangeState = {
  version: 1;
  operations: ExchangeOperation[];
};

type CharacterSave = Record<string, unknown> & {
  materials?: unknown;
  museunCosmetics?: unknown;
};

type ExchangeRequest = {
  action?: unknown;
  operationId: unknown;
  entryId?: unknown;
  batches?: unknown;
  selectedMaterials?: unknown;
  gearKind?: unknown;
  gearId?: unknown;
  expectedCurrentLevel?: unknown;
  expectedNextLevel?: unknown;
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

function canonicalMaterials(
  materials: Record<string, number> | null,
): Record<string, number> | null {
  if (!materials) return null;
  return Object.fromEntries(
    Object.entries(materials).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function sameMaterials(
  left: Record<string, number> | null,
  right: Record<string, number> | null,
): boolean {
  if (left === null || right === null) return left === right;
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([materialId, count]) => right[materialId] === count)
  );
}

function validEnhancementTarget(
  kind: DangerousGearKind,
  gearId: unknown,
): gearId is DangerousGearId {
  if (kind === "rod") return isDangerousRodId(gearId);
  if (kind === "reel") return isDangerousReelId(gearId);
  return isDangerousLineId(gearId);
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
      const base = { id, completedAt: Number(completedAt) };
      const record = item as Record<string, unknown>;
      if (
        record.action === "enhance" &&
        (record.gearKind === "rod" ||
          record.gearKind === "reel" ||
          record.gearKind === "line") &&
        validEnhancementTarget(record.gearKind, record.gearId) &&
        (record.nextLevel === 1 ||
          record.nextLevel === 2 ||
          record.nextLevel === 3)
      ) {
        const derivedCurrentLevel = (record.nextLevel - 1) as 0 | 1 | 2;
        if (
          record.currentLevel !== undefined &&
          record.currentLevel !== derivedCurrentLevel
        ) {
          operations.push(base);
          continue;
        }
        operations.push({
          ...base,
          action: "enhance",
          gearKind: record.gearKind,
          gearId: record.gearId,
          currentLevel: derivedCurrentLevel,
          nextLevel: record.nextLevel,
        });
        continue;
      }
      if (record.action === "exchange") {
        const entry =
          typeof record.entryId === "string"
            ? DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID.get(record.entryId)
            : undefined;
        const batches = record.batches;
        const selection = selectedMaterials(record.selectedMaterials);
        if (
          entry &&
          typeof batches === "number" &&
          Number.isSafeInteger(batches) &&
          batches >= 1 &&
          batches <= DANGEROUS_FISHING_EXCHANGE_MAX_BATCHES &&
          (entry.repeatable || batches === 1) &&
          (entry.cost.kind !== "catch" ||
            (selection !== null &&
              validateCatchSelection(
                entry.cost.rarity,
                entry.cost.count * batches,
                selection,
              )))
        ) {
          operations.push({
            ...base,
            action: "exchange",
            entryId: entry.id,
            batches,
            selectedMaterials:
              entry.cost.kind === "catch"
                ? canonicalMaterials(selection)
                : null,
          });
          continue;
        }
      }
      // Task 2 이전 ID-only 레코드와 손상된 신규 intent는 재차감을 막기
      // 위해 보존하되, 아래 duplicate 처리에서 강화 성공으로 인정하지 않는다.
      operations.push(base);
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
  const enhancementItems = [
    ...args.dangerous.ownedGear.rods.map((gearId) => ({
      gearKind: "rod" as const,
      gearId,
    })),
    ...args.dangerous.ownedGear.reels.map((gearId) => ({
      gearKind: "reel" as const,
      gearId,
    })),
    ...args.dangerous.ownedGear.lines.map((gearId) => ({
      gearKind: "line" as const,
      gearId,
    })),
  ].map(({ gearKind, gearId }) => {
    const level = dangerousGearEnhancementLevel(
      args.dangerous,
      gearKind,
      gearId,
    );
    if (level >= 3) {
      return { gearKind, gearId, level, nextEnhancement: null };
    }
    const nextLevel = (level + 1) as DangerousGearEnhancementLevel;
    const cost = DANGEROUS_GEAR_ENHANCEMENT_COSTS[nextLevel];
    return {
      gearKind,
      gearId,
      level,
      nextEnhancement: {
        level: nextLevel,
        cost,
        affordable:
          unlocked &&
          fishingCoins >= cost.fishingCoins &&
          selectEnhancementMaterials(materials, nextLevel) !== null,
      },
    };
  });
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
      gearEnhancements: args.dangerous.gearEnhancements,
    },
    enhancementCosts: DANGEROUS_GEAR_ENHANCEMENT_COSTS,
    enhancementItems,
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
  const isEnhancement = request.action === "enhance";
  if (request.action !== undefined && !isEnhancement) {
    return fail("bad_request", 400);
  }
  let enhancementTarget:
    | {
        gearKind: DangerousGearKind;
        gearId: DangerousGearId;
        currentLevel: 0 | 1 | 2 | 3;
        nextLevel: DangerousGearEnhancementLevel;
      }
    | null = null;
  if (isEnhancement) {
    if (
      request.gearKind !== "rod" &&
      request.gearKind !== "reel" &&
      request.gearKind !== "line"
    ) {
      return fail("invalid_kind", 400);
    }
    if (!validEnhancementTarget(request.gearKind, request.gearId)) {
      return fail("invalid_item", 400);
    }
    if (
      !Number.isSafeInteger(request.expectedCurrentLevel) ||
      !Number.isSafeInteger(request.expectedNextLevel) ||
      (request.expectedCurrentLevel !== 0 &&
        request.expectedCurrentLevel !== 1 &&
        request.expectedCurrentLevel !== 2 &&
        request.expectedCurrentLevel !== 3) ||
      (request.expectedNextLevel !== 1 &&
        request.expectedNextLevel !== 2 &&
        request.expectedNextLevel !== 3) ||
      (request.expectedCurrentLevel < 3 &&
        request.expectedNextLevel !== request.expectedCurrentLevel + 1) ||
      (request.expectedCurrentLevel === 3 && request.expectedNextLevel !== 3)
    ) {
      return fail("invalid_level", 400);
    }
    enhancementTarget = {
      gearKind: request.gearKind,
      gearId: request.gearId,
      currentLevel: request.expectedCurrentLevel,
      nextLevel: request.expectedNextLevel,
    };
  }
  const entry =
    !isEnhancement && typeof request.entryId === "string"
      ? DANGEROUS_FISHING_EXCHANGE_ENTRY_BY_ID.get(request.entryId)
      : undefined;
  let batches = 0;
  let selection: Record<string, number> | null = null;
  let cosmeticItemId: MuseunCosmeticItemId | null = null;
  if (!isEnhancement) {
    if (!entry) return fail("invalid_entry", 400);
    if (
      !Number.isSafeInteger(request.batches) ||
      Number(request.batches) < 1 ||
      Number(request.batches) > DANGEROUS_FISHING_EXCHANGE_MAX_BATCHES ||
      (!entry.repeatable && Number(request.batches) !== 1)
    ) {
      return fail("invalid_quantity", 400);
    }
    batches = Number(request.batches);
    selection =
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
    cosmeticItemId =
      entry.output.kind === "cosmetic" &&
      isMuseunCosmeticItemId(entry.output.itemId)
        ? entry.output.itemId
        : null;
    if (entry.output.kind === "cosmetic" && cosmeticItemId === null) {
      return fail("invalid_entry", 400);
    }
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

  const processedOperation = exchangeState.operations.find(
    (operation) => operation.id === request.operationId,
  );
  if (processedOperation) {
    if (processedOperation.action === undefined) {
      if (isEnhancement) return fail("operation_conflict", 409);
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
    if (processedOperation.action === "enhance") {
      if (
        !enhancementTarget ||
        processedOperation.gearKind !== enhancementTarget.gearKind ||
        processedOperation.gearId !== enhancementTarget.gearId ||
        processedOperation.currentLevel !== enhancementTarget.currentLevel ||
        processedOperation.nextLevel !== enhancementTarget.nextLevel
      ) {
        return fail("operation_conflict", 409);
      }
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
        gearKind: processedOperation.gearKind,
        gearId: processedOperation.gearId,
        nextLevel: processedOperation.nextLevel,
      };
    }
    if (
      isEnhancement ||
      !entry ||
      processedOperation.entryId !== entry.id ||
      processedOperation.batches !== batches ||
      !sameMaterials(
        processedOperation.selectedMaterials,
        entry.cost.kind === "catch" ? canonicalMaterials(selection) : null,
      )
    ) {
      return fail("operation_conflict", 409);
    }
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
      entryId: processedOperation.entryId,
      batches: processedOperation.batches,
    };
  }

  if (isEnhancement) {
    if (!enhancementTarget) return fail("invalid_item", 400);
    const materials = positiveMaterials(character.materials);
    const fishingCoins = walletCoins(walletRaw);
    const currentLevel = dangerousGearEnhancementLevel(
      dangerous,
      request.gearKind,
      request.gearId,
    );
    if (currentLevel !== enhancementTarget.currentLevel) {
      const view = buildView({
        fishingLevel,
        character,
        walletRaw,
        dangerous,
        adventureLogRaw,
      });
      return {
        ...view,
        ok: false as const,
        error: "stale_enhancement",
        status: 409,
      };
    }
    const enhanced = enhanceDangerousGear(
      dangerous,
      enhancementTarget.nextLevel,
      request.gearKind,
      request.gearId,
      { materials, fishingCoins },
    );
    if (!enhanced.ok) {
      if (enhanced.error === "insufficient_fishing_coins") {
        return fail("insufficient_coins", 402, { fishingCoins });
      }
      if (enhanced.error === "insufficient_materials") {
        return fail("insufficient_materials", 402, {
          materials: materialView(materials),
        });
      }
      if (enhanced.error === "not_owned" || enhanced.error === "max_level") {
        return fail(enhanced.error, 409);
      }
      return fail(enhanced.error, 400);
    }

    const nextCharacter: CharacterSave = {
      ...character,
      materials: positiveMaterials(enhanced.materials),
    };
    const nextWallet = fishingWalletWithCoins(walletRaw, enhanced.fishingCoins!);
    const completedOperation: EnhancementOperation = {
      id: request.operationId,
      completedAt: request.now,
      action: "enhance",
      gearKind: enhancementTarget.gearKind,
      gearId: enhancementTarget.gearId,
      currentLevel: enhancementTarget.currentLevel as 0 | 1 | 2,
      nextLevel: enhanced.nextLevel,
    };
    const nextExchangeState: DangerousFishingExchangeState = {
      version: 1,
      operations: [
        completedOperation,
        ...exchangeState.operations.filter(
          (operation) => operation.id !== request.operationId,
        ),
      ].slice(0, MAX_OPERATION_IDS),
    };

    await upsertSave(tx, userId, "character.v2", nextCharacter);
    await upsertSave(
      tx,
      userId,
      DANGEROUS_FISHING_SAVE_KEY,
      enhanced.state,
    );
    await upsertSave(tx, userId, FISHING_WALLET_KEY, nextWallet);
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
        dangerous: enhanced.state,
        adventureLogRaw,
      }),
      status: 200,
      alreadyProcessed: false as const,
      operationId: request.operationId,
      gearKind: enhancementTarget.gearKind,
      gearId: enhancementTarget.gearId,
      nextLevel: enhanced.nextLevel,
    };
  }
  if (!entry) return fail("invalid_entry", 400);

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
  const completedOperation: LegacyExchangeOperation = {
    id: request.operationId,
    completedAt: request.now,
    action: "exchange",
    entryId: entry.id,
    batches,
    selectedMaterials:
      entry.cost.kind === "catch" ? canonicalMaterials(selection) : null,
  };
  const nextExchangeState: DangerousFishingExchangeState = {
    version: 1,
    operations: [
      completedOperation,
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
