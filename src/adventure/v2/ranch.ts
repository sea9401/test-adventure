const HOUR = 60 * 60 * 1000;

export type RanchAnimalId = "chicken" | "cow" | "pig";
export type RanchProductItemId = "egg" | "milk" | "pork";
export type RanchPenId =
  | "coop-1"
  | "coop-2"
  | "cowshed-1"
  | "cowshed-2"
  | "pigsty-1";

export const RANCH_ANIMALS: Record<
  RanchAnimalId,
  {
    name: string;
    outputName: string;
    imageSrc: string;
  }
> = {
  chicken: {
    name: "닭",
    outputName: "달걀",
    imageSrc: "/images/items/farm/chicken.webp",
  },
  cow: {
    name: "소",
    outputName: "우유",
    imageSrc: "/images/items/farm/cow.webp",
  },
  pig: {
    name: "돼지",
    outputName: "돼지고기",
    imageSrc: "/images/items/farm/pig.webp",
  },
};

export type RanchPenDefinition = {
  id: RanchPenId;
  animalId: RanchAnimalId;
  outputItemId: RanchProductItemId;
  cycleMs: number;
  outputAmount: number;
  feedCapacity: number;
  feedPerCycle: number;
  mode: "recurring" | "shipment";
  xpPerCycle: number;
  requiredLevel: number;
  costReputation: number;
};

export const RANCH_PEN_DEFINITIONS: readonly RanchPenDefinition[] = [
  {
    id: "coop-1",
    animalId: "chicken",
    outputItemId: "egg",
    cycleMs: 2 * HOUR,
    outputAmount: 2,
    feedCapacity: 6,
    feedPerCycle: 1,
    mode: "recurring",
    xpPerCycle: 2,
    requiredLevel: 1,
    costReputation: 0,
  },
  {
    id: "coop-2",
    animalId: "chicken",
    outputItemId: "egg",
    cycleMs: 2 * HOUR,
    outputAmount: 2,
    feedCapacity: 6,
    feedPerCycle: 1,
    mode: "recurring",
    xpPerCycle: 2,
    requiredLevel: 10,
    costReputation: 30,
  },
  {
    id: "cowshed-1",
    animalId: "cow",
    outputItemId: "milk",
    cycleMs: 6 * HOUR,
    outputAmount: 3,
    feedCapacity: 2,
    feedPerCycle: 1,
    mode: "recurring",
    xpPerCycle: 6,
    requiredLevel: 20,
    costReputation: 60,
  },
  {
    id: "cowshed-2",
    animalId: "cow",
    outputItemId: "milk",
    cycleMs: 6 * HOUR,
    outputAmount: 3,
    feedCapacity: 2,
    feedPerCycle: 1,
    mode: "recurring",
    xpPerCycle: 6,
    requiredLevel: 35,
    costReputation: 120,
  },
  {
    id: "pigsty-1",
    animalId: "pig",
    outputItemId: "pork",
    cycleMs: 16 * HOUR,
    outputAmount: 8,
    feedCapacity: 4,
    feedPerCycle: 4,
    mode: "shipment",
    xpPerCycle: 16,
    requiredLevel: 50,
    costReputation: 180,
  },
] as const;

export const RANCH_FEED_RECIPE = {
  id: "compound_feed",
  name: "배합 사료",
  outputAmount: 5,
  costs: { wheat: 4, corn: 3, herb: 1 },
} as const;

export type RanchPenState = {
  unlocked: boolean;
  feed: number;
  lastSettledAt: number;
  progressMs: number;
  readyItems: number;
  readyCycles: number;
};

export type RanchState = {
  version: 1;
  pens: Record<RanchPenId, RanchPenState>;
  stats: {
    chickenCycles: number;
    cowCycles: number;
    pigCycles: number;
    eggsCollected: number;
    milkCollected: number;
    porkCollected: number;
  };
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

const DEFINITION_BY_ID = new Map(
  RANCH_PEN_DEFINITIONS.map((definition) => [definition.id, definition]),
);

function safeInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function safeNow(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : Date.now();
}

function emptyPenState(unlocked: boolean, now: number): RanchPenState {
  return {
    unlocked,
    feed: 0,
    lastSettledAt: now,
    progressMs: 0,
    readyItems: 0,
    readyCycles: 0,
  };
}

export function emptyRanchState(now = Date.now()): RanchState {
  const safeTimestamp = safeNow(now);
  return {
    version: 1,
    pens: {
      "coop-1": emptyPenState(true, safeTimestamp),
      "coop-2": emptyPenState(false, safeTimestamp),
      "cowshed-1": emptyPenState(false, safeTimestamp),
      "cowshed-2": emptyPenState(false, safeTimestamp),
      "pigsty-1": emptyPenState(false, safeTimestamp),
    },
    stats: {
      chickenCycles: 0,
      cowCycles: 0,
      pigCycles: 0,
      eggsCollected: 0,
      milkCollected: 0,
      porkCollected: 0,
    },
  };
}

export function parseRanchState(raw: unknown, now = Date.now()): RanchState {
  const safeTimestamp = safeNow(now);
  if (!raw || typeof raw !== "object") return emptyRanchState(safeTimestamp);
  const source = raw as Partial<RanchState>;
  const sourcePens =
    source.pens && typeof source.pens === "object"
      ? (source.pens as Partial<Record<RanchPenId, Partial<RanchPenState>>>)
      : {};
  const base = emptyRanchState(safeTimestamp);
  const pens = { ...base.pens };

  for (const definition of RANCH_PEN_DEFINITIONS) {
    const candidate = sourcePens[definition.id];
    if (!candidate || typeof candidate !== "object") continue;
    const lastSettledAtRaw = Number(candidate.lastSettledAt);
    const lastSettledAt =
      Number.isFinite(lastSettledAtRaw) &&
      lastSettledAtRaw >= 0 &&
      lastSettledAtRaw <= safeTimestamp
        ? Math.floor(lastSettledAtRaw)
        : safeTimestamp;
    const rawFeed = Math.min(
      definition.feedCapacity,
      safeInt(candidate.feed),
    );
    const feed =
      definition.mode === "shipment" && rawFeed !== definition.feedPerCycle
        ? 0
        : rawFeed;
    const readyCycles = safeInt(candidate.readyCycles);
    pens[definition.id] = {
      unlocked:
        definition.id === "coop-1" ? true : candidate.unlocked === true,
      feed,
      lastSettledAt,
      progressMs:
        feed > 0
          ? Math.min(definition.cycleMs - 1, safeInt(candidate.progressMs))
          : 0,
      readyCycles,
      readyItems: readyCycles * definition.outputAmount,
    };
  }

  const statsSource: Partial<RanchState["stats"]> =
    source.stats && typeof source.stats === "object" ? source.stats : {};
  return {
    version: 1,
    pens,
    stats: {
      chickenCycles: safeInt(statsSource.chickenCycles),
      cowCycles: safeInt(statsSource.cowCycles),
      pigCycles: safeInt(statsSource.pigCycles),
      eggsCollected: safeInt(statsSource.eggsCollected),
      milkCollected: safeInt(statsSource.milkCollected),
      porkCollected: safeInt(statsSource.porkCollected),
    },
  };
}

export function settleRanch(state: RanchState, now = Date.now()): RanchState {
  const safeTimestamp = safeNow(now);
  const parsed = parseRanchState(state, safeTimestamp);
  const pens = { ...parsed.pens };
  let chickenCycles = parsed.stats.chickenCycles;
  let cowCycles = parsed.stats.cowCycles;
  let pigCycles = parsed.stats.pigCycles;

  for (const definition of RANCH_PEN_DEFINITIONS) {
    const pen = pens[definition.id];
    const elapsed = Math.max(0, safeTimestamp - pen.lastSettledAt);
    if (!pen.unlocked || pen.feed < definition.feedPerCycle) {
      pens[definition.id] = {
        ...pen,
        lastSettledAt: safeTimestamp,
        progressMs: 0,
      };
      continue;
    }
    const totalProgress = pen.progressMs + elapsed;
    const completed = Math.min(
      Math.floor(pen.feed / definition.feedPerCycle),
      Math.floor(totalProgress / definition.cycleMs),
    );
    const feed = pen.feed - completed * definition.feedPerCycle;
    pens[definition.id] = {
      ...pen,
      feed,
      lastSettledAt: safeTimestamp,
      progressMs:
        feed > 0 ? totalProgress - completed * definition.cycleMs : 0,
      readyItems: pen.readyItems + completed * definition.outputAmount,
      readyCycles: pen.readyCycles + completed,
    };
    if (definition.animalId === "chicken") chickenCycles += completed;
    else if (definition.animalId === "cow") cowCycles += completed;
    else pigCycles += completed;
  }

  return {
    ...parsed,
    pens,
    stats: { ...parsed.stats, chickenCycles, cowCycles, pigCycles },
  };
}

export function addRanchFeed(
  state: RanchState,
  penId: RanchPenId,
  amount: number,
  now = Date.now(),
): RanchState {
  const definition = DEFINITION_BY_ID.get(penId);
  if (!definition) throw new RanchError("pen_not_found");
  const count = Math.floor(Number(amount));
  if (!Number.isFinite(count) || count < 1) {
    throw new RanchError("bad_quantity");
  }
  const settled = settleRanch(state, now);
  const pen = settled.pens[penId];
  if (!pen.unlocked) throw new RanchError("pen_locked");
  if (definition.mode === "shipment") {
    if (pen.readyItems > 0) throw new RanchError("shipment_pending");
    if (pen.feed > 0) throw new RanchError("shipment_in_progress");
    if (count !== definition.feedPerCycle) {
      throw new RanchError("shipment_feed_required");
    }
  }
  if (pen.feed + count > definition.feedCapacity) {
    throw new RanchError("feed_capacity");
  }
  return {
    ...settled,
    pens: {
      ...settled.pens,
      [penId]: { ...pen, feed: pen.feed + count },
    },
  };
}

export function collectRanchProducts(
  state: RanchState,
  now = Date.now(),
): RanchCollection {
  const settled = settleRanch(state, now);
  const pens = { ...settled.pens };
  const items: Partial<Record<RanchProductItemId, number>> = {};
  const cycles: Record<RanchAnimalId, number> = {
    chicken: 0,
    cow: 0,
    pig: 0,
  };
  let farmingXp = 0;

  for (const definition of RANCH_PEN_DEFINITIONS) {
    const pen = pens[definition.id];
    if (pen.readyItems < 1 || pen.readyCycles < 1) continue;
    items[definition.outputItemId] =
      (items[definition.outputItemId] ?? 0) + pen.readyItems;
    cycles[definition.animalId] += pen.readyCycles;
    farmingXp += pen.readyCycles * definition.xpPerCycle;
    pens[definition.id] = { ...pen, readyItems: 0, readyCycles: 0 };
  }

  if (farmingXp < 1) throw new RanchError("nothing_to_collect");
  return {
    ranch: {
      ...settled,
      pens,
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

export function unlockRanchPen(
  state: RanchState,
  penId: RanchPenId,
  farmingLevel: number,
  now = Date.now(),
): { ranch: RanchState; costReputation: number } {
  const index = RANCH_PEN_DEFINITIONS.findIndex(
    (definition) => definition.id === penId,
  );
  const definition = RANCH_PEN_DEFINITIONS[index];
  if (!definition || definition.costReputation < 1) {
    throw new RanchError("pen_not_found");
  }
  const settled = settleRanch(state, now);
  if (settled.pens[penId].unlocked) {
    throw new RanchError("already_unlocked");
  }
  const previous = RANCH_PEN_DEFINITIONS[index - 1];
  if (previous && !settled.pens[previous.id].unlocked) {
    throw new RanchError("pen_locked");
  }
  if (Math.floor(Number(farmingLevel) || 0) < definition.requiredLevel) {
    throw new RanchError("level_required");
  }
  return {
    ranch: {
      ...settled,
      pens: {
        ...settled.pens,
        [penId]: {
          ...settled.pens[penId],
          unlocked: true,
          feed:
            definition.mode === "shipment"
              ? definition.feedPerCycle
              : settled.pens[penId].feed,
        },
      },
    },
    costReputation: definition.costReputation,
  };
}

export function ranchReadyPenCount(state: RanchState): number {
  return RANCH_PEN_DEFINITIONS.filter(
    (definition) => state.pens[definition.id].readyItems > 0,
  ).length;
}
