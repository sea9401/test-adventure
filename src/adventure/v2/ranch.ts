const HOUR = 60 * 60 * 1000;

export type RanchAnimalId = "chicken" | "cow" | "pig";
export type RanchProductItemId = "egg" | "milk" | "pork";
export type RanchSlotId =
  | "slot-1"
  | "slot-2"
  | "slot-3"
  | "slot-4"
  | "slot-5"
  | "slot-6"
  | "slot-7"
  | "slot-8"
  | "slot-9"
  | "slot-10";

export type RanchAnimalDefinition = {
  id: RanchAnimalId;
  name: string;
  buildingName: string;
  outputName: string;
  imageSrc: string;
  outputItemId: RanchProductItemId;
  cycleMs: number;
  outputAmount: number;
  feedCapacity: number;
  feedPerCycle: number;
  mode: "recurring" | "shipment";
  shipmentCapacityCycles?: number;
  xpPerCycle: number;
  requiredLevel: number;
};

export const RANCH_ANIMAL_DEFINITIONS: Record<
  RanchAnimalId,
  RanchAnimalDefinition
> = {
  chicken: {
    id: "chicken",
    name: "닭",
    buildingName: "닭장",
    outputName: "달걀",
    imageSrc: "/images/items/farm/chicken.webp",
    outputItemId: "egg",
    cycleMs: 2 * HOUR,
    outputAmount: 2,
    feedCapacity: 6,
    feedPerCycle: 1,
    mode: "recurring",
    xpPerCycle: 2,
    requiredLevel: 1,
  },
  cow: {
    id: "cow",
    name: "소",
    buildingName: "외양간",
    outputName: "우유",
    imageSrc: "/images/items/farm/cow.webp",
    outputItemId: "milk",
    cycleMs: 6 * HOUR,
    outputAmount: 3,
    feedCapacity: 2,
    feedPerCycle: 1,
    mode: "recurring",
    xpPerCycle: 6,
    requiredLevel: 20,
  },
  pig: {
    id: "pig",
    name: "돼지",
    buildingName: "돼지우리",
    outputName: "돼지고기",
    imageSrc: "/images/items/farm/pig.webp",
    outputItemId: "pork",
    cycleMs: 12 * HOUR,
    outputAmount: 4,
    feedCapacity: 4,
    feedPerCycle: 2,
    mode: "shipment",
    shipmentCapacityCycles: 2,
    xpPerCycle: 8,
    requiredLevel: 50,
  },
};

export const RANCH_ANIMALS: Record<
  RanchAnimalId,
  Pick<RanchAnimalDefinition, "name" | "outputName" | "imageSrc">
> = RANCH_ANIMAL_DEFINITIONS;

export type RanchSlotDefinition = {
  id: RanchSlotId;
  requiredLevel: number;
  costReputation: number;
};

export const RANCH_SLOT_DEFINITIONS: readonly RanchSlotDefinition[] = [
  { id: "slot-1", requiredLevel: 1, costReputation: 0 },
  { id: "slot-2", requiredLevel: 10, costReputation: 30 },
  { id: "slot-3", requiredLevel: 20, costReputation: 60 },
  { id: "slot-4", requiredLevel: 35, costReputation: 120 },
  { id: "slot-5", requiredLevel: 50, costReputation: 180 },
  { id: "slot-6", requiredLevel: 60, costReputation: 1_000 },
  { id: "slot-7", requiredLevel: 70, costReputation: 2_000 },
  { id: "slot-8", requiredLevel: 80, costReputation: 4_000 },
  { id: "slot-9", requiredLevel: 90, costReputation: 8_000 },
  { id: "slot-10", requiredLevel: 100, costReputation: 16_000 },
] as const;

export const RANCH_REBUILD_COSTS: Record<RanchAnimalId, number> = {
  chicken: 500,
  cow: 1_000,
  pig: 2_000,
};

export const RANCH_FEED_RECIPE = {
  id: "compound_feed",
  name: "배합 사료",
  outputAmount: 5,
  ingredientAmount: 5,
} as const;

export const FAILED_DISH_FEED_RECIPE = {
  id: "failed_dish_feed",
  name: "재활용 배합 사료",
  outputAmount: 5,
  failedDishCost: 25,
} as const;

export type RanchSlotState = {
  unlocked: boolean;
  animalId: RanchAnimalId | null;
  feed: number;
  lastSettledAt: number;
  progressMs: number;
  readyItems: number;
  readyCycles: number;
  shipmentStartedAt: number[];
};

export type RanchStats = {
  chickenCycles: number;
  cowCycles: number;
  pigCycles: number;
  eggsCollected: number;
  milkCollected: number;
  porkCollected: number;
};

export type RanchState = {
  version: 3;
  slots: Record<RanchSlotId, RanchSlotState>;
  stats: RanchStats;
};

export type RanchCollection = {
  ranch: RanchState;
  items: Partial<Record<RanchProductItemId, number>>;
  farmingXp: number;
  cycles: Record<RanchAnimalId, number>;
};

export class RanchError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "RanchError";
  }
}

const SLOT_DEFINITION_BY_ID = new Map(
  RANCH_SLOT_DEFINITIONS.map((definition) => [definition.id, definition]),
);

const LEGACY_PEN_MIGRATION = [
  { penId: "coop-1", slotId: "slot-1", animalId: "chicken" },
  { penId: "coop-2", slotId: "slot-2", animalId: "chicken" },
  { penId: "cowshed-1", slotId: "slot-3", animalId: "cow" },
  { penId: "cowshed-2", slotId: "slot-4", animalId: "cow" },
  { penId: "pigsty-1", slotId: "slot-5", animalId: "pig" },
] as const;

export function isRanchSlotId(value: unknown): value is RanchSlotId {
  return typeof value === "string" && SLOT_DEFINITION_BY_ID.has(value as RanchSlotId);
}

export function isRanchAnimalId(value: unknown): value is RanchAnimalId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RANCH_ANIMAL_DEFINITIONS, value)
  );
}

function safeInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function safeNow(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : Date.now();
}

function emptySlotState(
  unlocked: boolean,
  animalId: RanchAnimalId | null,
  now: number,
): RanchSlotState {
  return {
    unlocked,
    animalId,
    feed: 0,
    lastSettledAt: now,
    progressMs: 0,
    readyItems: 0,
    readyCycles: 0,
    shipmentStartedAt: [],
  };
}

function emptyStats(): RanchStats {
  return {
    chickenCycles: 0,
    cowCycles: 0,
    pigCycles: 0,
    eggsCollected: 0,
    milkCollected: 0,
    porkCollected: 0,
  };
}

export function emptyRanchState(now = Date.now()): RanchState {
  const safeTimestamp = safeNow(now);
  const slots = Object.fromEntries(
    RANCH_SLOT_DEFINITIONS.map((definition) => [
      definition.id,
      emptySlotState(
        definition.id === "slot-1",
        definition.id === "slot-1" ? "chicken" : null,
        safeTimestamp,
      ),
    ]),
  ) as Record<RanchSlotId, RanchSlotState>;
  return { version: 3, slots, stats: emptyStats() };
}

function normalizeSlot(
  candidate: unknown,
  animalId: RanchAnimalId,
  now: number,
  sourceVersion: 1 | 2 | 3,
): RanchSlotState {
  if (!candidate || typeof candidate !== "object") {
    return emptySlotState(false, null, now);
  }
  const source = candidate as Partial<RanchSlotState>;
  if (source.unlocked !== true) return emptySlotState(false, null, now);

  const definition = RANCH_ANIMAL_DEFINITIONS[animalId];
  const lastSettledAtRaw = Number(source.lastSettledAt);
  const lastSettledAt =
    Number.isFinite(lastSettledAtRaw) &&
    lastSettledAtRaw >= 0 &&
    lastSettledAtRaw <= now
      ? Math.floor(lastSettledAtRaw)
      : now;

  if (definition.mode === "shipment") {
    const capacity = definition.shipmentCapacityCycles ?? 1;
    const parsedReadyCycles = safeInt(source.readyCycles);
    const readyCycles =
      sourceVersion === 3
        ? Math.min(capacity, parsedReadyCycles)
        : parsedReadyCycles > 0
          ? capacity
          : 0;
    const remainingCapacity = capacity - readyCycles;
    let shipmentStartedAt: number[] = [];

    if (sourceVersion === 3 && Array.isArray(source.shipmentStartedAt)) {
      shipmentStartedAt = source.shipmentStartedAt
        .map(Number)
        .filter(
          (startedAt) =>
            Number.isFinite(startedAt) && startedAt >= 0 && startedAt <= now,
        )
        .map(Math.floor)
        .sort((left, right) => left - right)
        .slice(0, remainingCapacity);
    } else if (remainingCapacity > 0 && safeInt(source.feed) >= 4) {
      const legacyProgressMs = Math.min(
        definition.cycleMs - 1,
        safeInt(source.progressMs),
      );
      const startedAt = Math.max(0, lastSettledAt - legacyProgressMs);
      shipmentStartedAt = Array.from(
        { length: remainingCapacity },
        () => startedAt,
      );
    }

    return {
      unlocked: true,
      animalId,
      feed: 0,
      lastSettledAt: now,
      progressMs: 0,
      readyItems: readyCycles * definition.outputAmount,
      readyCycles,
      shipmentStartedAt,
    };
  }

  const parsedReadyCycles = safeInt(source.readyCycles);
  const readyCycles = parsedReadyCycles;
  const rawFeed = Math.min(
    definition.feedCapacity,
    safeInt(source.feed),
  );
  const feed = rawFeed;
  return {
    unlocked: true,
    animalId,
    feed,
    lastSettledAt,
    progressMs:
      feed > 0
        ? Math.min(definition.cycleMs - 1, safeInt(source.progressMs))
        : 0,
    readyItems: readyCycles * definition.outputAmount,
    readyCycles,
    shipmentStartedAt: [],
  };
}

function parseStats(raw: unknown): RanchStats {
  const source = raw && typeof raw === "object" ? (raw as Partial<RanchStats>) : {};
  return {
    chickenCycles: safeInt(source.chickenCycles),
    cowCycles: safeInt(source.cowCycles),
    pigCycles: safeInt(source.pigCycles),
    eggsCollected: safeInt(source.eggsCollected),
    milkCollected: safeInt(source.milkCollected),
    porkCollected: safeInt(source.porkCollected),
  };
}

export function parseRanchState(raw: unknown, now = Date.now()): RanchState {
  const safeTimestamp = safeNow(now);
  const base = emptyRanchState(safeTimestamp);
  if (!raw || typeof raw !== "object") return base;

  const source = raw as {
    version?: unknown;
    slots?: unknown;
    pens?: unknown;
    stats?: unknown;
  };
  const slots = { ...base.slots };

  if (
    (source.version === 2 || source.version === 3) &&
    source.slots &&
    typeof source.slots === "object"
  ) {
    const sourceSlots = source.slots as Partial<Record<RanchSlotId, unknown>>;
    for (const definition of RANCH_SLOT_DEFINITIONS) {
      const candidate = sourceSlots[definition.id];
      if (!candidate || typeof candidate !== "object") continue;
      const candidateAnimalId = (candidate as { animalId?: unknown }).animalId;
      const animalId = isRanchAnimalId(candidateAnimalId)
        ? candidateAnimalId
        : definition.id === "slot-1"
          ? "chicken"
          : null;
      slots[definition.id] = animalId
        ? normalizeSlot(
            candidate,
            animalId,
            safeTimestamp,
            source.version,
          )
        : emptySlotState(false, null, safeTimestamp);
    }
  } else if (source.pens && typeof source.pens === "object") {
    const sourcePens = source.pens as Record<string, unknown>;
    for (const migration of LEGACY_PEN_MIGRATION) {
      const candidate = sourcePens[migration.penId];
      if (!candidate || typeof candidate !== "object") continue;
      slots[migration.slotId] = normalizeSlot(
        candidate,
        migration.animalId,
        safeTimestamp,
        1,
      );
    }
  }

  slots["slot-1"] = slots["slot-1"].unlocked
    ? slots["slot-1"]
    : emptySlotState(true, "chicken", safeTimestamp);

  return { version: 3, slots, stats: parseStats(source.stats) };
}

export function settleRanch(state: RanchState, now = Date.now()): RanchState {
  const safeTimestamp = safeNow(now);
  const parsed = parseRanchState(state, safeTimestamp);
  const slots = { ...parsed.slots };
  const stats = { ...parsed.stats };

  for (const slotDefinition of RANCH_SLOT_DEFINITIONS) {
    const slot = slots[slotDefinition.id];
    const animal = slot.animalId
      ? RANCH_ANIMAL_DEFINITIONS[slot.animalId]
      : null;
    if (slot.unlocked && animal?.mode === "shipment") {
      const shipmentStartedAt = slot.shipmentStartedAt.filter(
        (startedAt) => startedAt + animal.cycleMs > safeTimestamp,
      );
      const completed = slot.shipmentStartedAt.length - shipmentStartedAt.length;
      slots[slotDefinition.id] = {
        ...slot,
        feed: 0,
        lastSettledAt: safeTimestamp,
        progressMs: 0,
        readyItems: slot.readyItems + completed * animal.outputAmount,
        readyCycles: slot.readyCycles + completed,
        shipmentStartedAt,
      };
      stats.pigCycles += completed;
      continue;
    }
    const elapsed = Math.max(0, safeTimestamp - slot.lastSettledAt);
    if (!slot.unlocked || !animal || slot.feed < animal.feedPerCycle) {
      slots[slotDefinition.id] = {
        ...slot,
        lastSettledAt: safeTimestamp,
        progressMs: 0,
      };
      continue;
    }

    const totalProgress = slot.progressMs + elapsed;
    const completed = Math.min(
      Math.floor(slot.feed / animal.feedPerCycle),
      Math.floor(totalProgress / animal.cycleMs),
    );
    const feed = slot.feed - completed * animal.feedPerCycle;
    slots[slotDefinition.id] = {
      ...slot,
      feed,
      lastSettledAt: safeTimestamp,
      progressMs: feed > 0 ? totalProgress - completed * animal.cycleMs : 0,
      readyItems: slot.readyItems + completed * animal.outputAmount,
      readyCycles: slot.readyCycles + completed,
    };
    if (animal.id === "chicken") stats.chickenCycles += completed;
    else if (animal.id === "cow") stats.cowCycles += completed;
    else stats.pigCycles += completed;
  }

  return { ...parsed, slots, stats };
}

export function addRanchFeed(
  state: RanchState,
  slotId: RanchSlotId,
  amount: number,
  now = Date.now(),
): RanchState {
  if (!isRanchSlotId(slotId)) throw new RanchError("slot_not_found");
  const count = Math.floor(Number(amount));
  if (!Number.isFinite(count) || count < 1) throw new RanchError("bad_quantity");

  const settled = settleRanch(state, now);
  const slot = settled.slots[slotId];
  if (!slot.unlocked || !slot.animalId) throw new RanchError("slot_locked");
  const animal = RANCH_ANIMAL_DEFINITIONS[slot.animalId];
  if (animal.mode === "shipment") {
    if (count !== animal.feedPerCycle) {
      throw new RanchError("shipment_feed_required");
    }
    const occupiedCycles = slot.readyCycles + slot.shipmentStartedAt.length;
    if (occupiedCycles >= (animal.shipmentCapacityCycles ?? 1)) {
      throw new RanchError("shipment_capacity");
    }
    return {
      ...settled,
      slots: {
        ...settled.slots,
        [slotId]: {
          ...slot,
          shipmentStartedAt: [...slot.shipmentStartedAt, safeNow(now)],
        },
      },
    };
  }
  if (slot.feed + count > animal.feedCapacity) {
    throw new RanchError("feed_capacity");
  }
  return {
    ...settled,
    slots: {
      ...settled.slots,
      [slotId]: { ...slot, feed: slot.feed + count },
    },
  };
}

export function collectRanchProducts(
  state: RanchState,
  now = Date.now(),
): RanchCollection {
  const settled = settleRanch(state, now);
  const slots = { ...settled.slots };
  const items: Partial<Record<RanchProductItemId, number>> = {};
  const cycles: Record<RanchAnimalId, number> = { chicken: 0, cow: 0, pig: 0 };
  let farmingXp = 0;

  for (const slotDefinition of RANCH_SLOT_DEFINITIONS) {
    const slot = slots[slotDefinition.id];
    if (!slot.animalId || slot.readyItems < 1 || slot.readyCycles < 1) continue;
    const animal = RANCH_ANIMAL_DEFINITIONS[slot.animalId];
    items[animal.outputItemId] =
      (items[animal.outputItemId] ?? 0) + slot.readyItems;
    cycles[animal.id] += slot.readyCycles;
    farmingXp += slot.readyCycles * animal.xpPerCycle;
    slots[slotDefinition.id] = { ...slot, readyItems: 0, readyCycles: 0 };
  }

  if (farmingXp < 1) throw new RanchError("nothing_to_collect");
  return {
    ranch: {
      ...settled,
      slots,
      stats: {
        ...settled.stats,
        eggsCollected: settled.stats.eggsCollected + (items.egg ?? 0),
        milkCollected: settled.stats.milkCollected + (items.milk ?? 0),
        porkCollected: settled.stats.porkCollected + (items.pork ?? 0),
      },
    },
    items,
    farmingXp,
    cycles,
  };
}

export function unlockRanchSlot(
  state: RanchState,
  slotId: RanchSlotId,
  animalId: RanchAnimalId,
  farmingLevel: number,
  now = Date.now(),
): { ranch: RanchState; costReputation: number } {
  if (!isRanchSlotId(slotId)) throw new RanchError("slot_not_found");
  if (!isRanchAnimalId(animalId)) throw new RanchError("animal_not_found");
  const index = RANCH_SLOT_DEFINITIONS.findIndex((entry) => entry.id === slotId);
  const slotDefinition = RANCH_SLOT_DEFINITIONS[index];
  const settled = settleRanch(state, now);
  if (settled.slots[slotId].unlocked) throw new RanchError("already_unlocked");
  const previous = RANCH_SLOT_DEFINITIONS[index - 1];
  if (previous && !settled.slots[previous.id].unlocked) {
    throw new RanchError("slot_locked");
  }

  const level = Math.floor(Number(farmingLevel) || 0);
  if (level < slotDefinition.requiredLevel) throw new RanchError("level_required");
  const animal = RANCH_ANIMAL_DEFINITIONS[animalId];
  if (level < animal.requiredLevel) throw new RanchError("animal_level_required");

  return {
    ranch: {
      ...settled,
      slots: {
        ...settled.slots,
        [slotId]: {
          ...emptySlotState(true, animalId, safeNow(now)),
          shipmentStartedAt:
            animal.mode === "shipment" ? [safeNow(now)] : [],
        },
      },
    },
    costReputation: slotDefinition.costReputation,
  };
}

export function rebuildRanchSlot(
  state: RanchState,
  slotId: RanchSlotId,
  animalId: RanchAnimalId,
  farmingLevel: number,
  now = Date.now(),
): { ranch: RanchState; costReputation: number } {
  if (!isRanchSlotId(slotId)) throw new RanchError("slot_not_found");
  if (!isRanchAnimalId(animalId)) throw new RanchError("animal_not_found");
  const settled = settleRanch(state, now);
  const slot = settled.slots[slotId];
  if (!slot.unlocked || !slot.animalId) throw new RanchError("slot_locked");
  if (slot.animalId === animalId) throw new RanchError("same_animal");
  const animal = RANCH_ANIMAL_DEFINITIONS[animalId];
  const level = Math.floor(Number(farmingLevel) || 0);
  if (level < animal.requiredLevel) throw new RanchError("animal_level_required");
  if (
    slot.feed > 0 ||
    slot.progressMs > 0 ||
    slot.readyItems > 0 ||
    slot.readyCycles > 0 ||
    slot.shipmentStartedAt.length > 0
  ) {
    throw new RanchError("slot_not_empty");
  }

  return {
    ranch: {
      ...settled,
      slots: {
        ...settled.slots,
        [slotId]: {
          ...emptySlotState(true, animalId, safeNow(now)),
          shipmentStartedAt:
            animal.mode === "shipment" ? [safeNow(now)] : [],
        },
      },
    },
    costReputation: RANCH_REBUILD_COSTS[animalId],
  };
}

export function ranchReadySlotCount(state: RanchState): number {
  return RANCH_SLOT_DEFINITIONS.filter(
    (definition) => state.slots[definition.id].readyItems > 0,
  ).length;
}
