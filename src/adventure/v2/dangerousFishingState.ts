import {
  DANGEROUS_FISH,
  dangerousCatchMaterialId,
  isDangerousBaitId,
  isDangerousBossId,
  isDangerousDepthId,
  isDangerousFishId,
  isDangerousLineId,
  isDangerousReelId,
  isDangerousRodId,
  isDangerousZoneId,
  type DangerousBaitId,
  type DangerousBossId,
  type DangerousDepthId,
  type DangerousFishBehavior,
  type DangerousFishId,
  type DangerousLineId,
  type DangerousReelId,
  type DangerousRodId,
  type DangerousZoneId,
} from "@/adventure/data/v2/dangerousFishing";
import type {
  DangerousEncounter,
  DangerousEncounterEvent,
  DangerousEncounterTransition,
} from "./dangerousFishingEncounter";

export const DANGEROUS_FISHING_SAVE_KEY = "dangerous-fishing.v1";
export const DANGEROUS_FISHING_STATE_VERSION = 1 as const;

export type DangerousCargoStack = {
  fishId: DangerousFishId;
  materialId: string;
  quantity: number;
  totalValue: number;
};

export type DangerousFishCodexEntry = {
  caughtCount: number;
  bestSizeCm: number;
  firstCaughtAt: number;
  bestCaughtAt: number;
};

export type DangerousBossCodexEntry = {
  defeats: number;
  firstDefeatedAt: number;
  lastDefeatedAt: number;
  bestContribution: number;
};

export type DangerousBossAttempt = {
  eventId: string;
  encounter: DangerousEncounter;
};

export type DangerousFishingVoyage = {
  id: string;
  zoneId: DangerousZoneId;
  depthId: DangerousDepthId;
  risk: number;
  startedAt: number;
  cargo: DangerousCargoStack[];
  encounter: DangerousEncounter | null;
};

export type DangerousFishingState = {
  version: typeof DANGEROUS_FISHING_STATE_VERSION;
  ownedGear: {
    rods: DangerousRodId[];
    reels: DangerousReelId[];
    lines: DangerousLineId[];
  };
  loadout: {
    rodId: DangerousRodId;
    reelId: DangerousReelId;
    lineId: DangerousLineId;
    baitId: DangerousBaitId;
  };
  baitCounts: Partial<Record<DangerousBaitId, number>>;
  codex: Partial<Record<DangerousFishId, DangerousFishCodexEntry>>;
  bossCodex: Partial<Record<DangerousBossId, DangerousBossCodexEntry>>;
  bossTraces: Partial<Record<DangerousBossId, number>>;
  bossAttempt: DangerousBossAttempt | null;
  resolvedEncounterIds: string[];
  voyage: DangerousFishingVoyage | null;
};

export type DangerousFishingReturn = {
  state: DangerousFishingState;
  incident: boolean;
  returned: boolean;
  lostValue: number;
  lostCargo: Record<string, number>;
  materials: Record<string, number>;
};

export type DangerousRiskPreview = {
  risk: number;
  accidentChance: number;
  maxLossFraction: number;
};

export function emptyDangerousFishingState(): DangerousFishingState {
  return {
    version: DANGEROUS_FISHING_STATE_VERSION,
    ownedGear: {
      rods: ["starter_rod"],
      reels: ["starter_reel"],
      lines: ["starter_line"],
    },
    loadout: {
      rodId: "starter_rod",
      reelId: "starter_reel",
      lineId: "starter_line",
      baitId: "basic_bait",
    },
    baitCounts: {},
      codex: {},
      bossCodex: {},
      bossTraces: {},
      bossAttempt: null,
    resolvedEncounterIds: [],
    voyage: null,
  };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function safeInt(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.floor(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniqueGear<T extends string>(
  raw: unknown,
  guard: (value: unknown) => value is T,
  starter: T,
): T[] {
  const values = Array.isArray(raw) ? raw.filter(guard) : [];
  return [starter, ...values.filter((value) => value !== starter)].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
}

const BEHAVIORS = new Set<DangerousFishBehavior>([
  "charge",
  "thrash",
  "turn",
  "dive",
]);

function parseEncounter(raw: unknown): DangerousEncounter | null {
  const value = objectRecord(raw);
  if (!value || typeof value.id !== "string" || value.id.length === 0) return null;
  const targetKind = value.targetKind;
  const targetId = value.targetId;
  if (
    (targetKind !== "fish" && targetKind !== "boss") ||
    typeof targetId !== "string" ||
    (targetKind === "fish"
      ? !isDangerousFishId(targetId)
      : !isDangerousBossId(targetId))
  ) {
    return null;
  }
  if (
    value.status !== "active" &&
    value.status !== "caught" &&
    value.status !== "failed"
  ) {
    return null;
  }
  const behaviorPattern = Array.isArray(value.behaviorPattern)
    ? value.behaviorPattern.filter(
        (behavior): behavior is DangerousFishBehavior =>
          typeof behavior === "string" &&
          BEHAVIORS.has(behavior as DangerousFishBehavior),
      )
    : [];
  if (behaviorPattern.length === 0) return null;

  const maxTension = Math.max(20, safeInt(value.maxTension, 100));
  const maxStamina = Math.max(1, safeInt(value.maxStamina, 1));
  const startDistance = Math.max(1, safeInt(value.startDistance, 1));
  return {
    id: value.id,
    targetKind,
    targetId,
    status: value.status,
    tension: Math.max(0, safeInt(value.tension)),
    maxTension,
    stamina: clamp(safeInt(value.stamina), 0, maxStamina),
    maxStamina,
    distance: clamp(safeInt(value.distance), 0, startDistance * 2),
    startDistance,
    slackTurns: Math.max(0, safeInt(value.slackTurns)),
    slackTolerance: Math.max(0, safeInt(value.slackTolerance)),
    step: Math.max(0, safeInt(value.step)),
    revision: Math.max(0, safeInt(value.revision)),
    nextActionAt: Math.max(0, safeInt(value.nextActionAt)),
    expiresAt: Math.max(0, safeInt(value.expiresAt)),
    patternSeed: safeInt(value.patternSeed),
    behaviorPattern,
    reelPowerBonus: safeInt(value.reelPowerBonus),
    staminaDamageBonus: safeInt(value.staminaDamageBonus),
    tensionControlBonus: safeInt(value.tensionControlBonus),
    telegraphSteps: clamp(safeInt(value.telegraphSteps), 0, 2),
  };
}

function parseCargo(raw: unknown): DangerousCargoStack[] {
  if (!Array.isArray(raw)) return [];
  const byFish = new Map<DangerousFishId, DangerousCargoStack>();
  for (const item of raw) {
    const value = objectRecord(item);
    if (!value || !isDangerousFishId(value.fishId)) continue;
    const quantity = Math.max(0, safeInt(value.quantity));
    const totalValue = Math.max(0, safeInt(value.totalValue));
    const materialId = dangerousCatchMaterialId(value.fishId);
    if (quantity === 0 || totalValue === 0 || value.materialId !== materialId) continue;
    const previous = byFish.get(value.fishId);
    byFish.set(value.fishId, {
      fishId: value.fishId,
      materialId,
      quantity: quantity + (previous?.quantity ?? 0),
      totalValue: totalValue + (previous?.totalValue ?? 0),
    });
  }
  return [...byFish.values()];
}

function parseCodex(
  raw: unknown,
): Partial<Record<DangerousFishId, DangerousFishCodexEntry>> {
  const record = objectRecord(raw);
  const codex: Partial<Record<DangerousFishId, DangerousFishCodexEntry>> = {};
  if (!record) return codex;
  for (const [id, rawEntry] of Object.entries(record)) {
    if (!isDangerousFishId(id)) continue;
    const entry = objectRecord(rawEntry);
    if (!entry) continue;
    const caughtCount = Math.max(0, safeInt(entry.caughtCount));
    const bestSizeCm = Math.max(0, safeInt(entry.bestSizeCm));
    if (caughtCount === 0 || bestSizeCm === 0) continue;
    codex[id] = {
      caughtCount,
      bestSizeCm,
      firstCaughtAt: Math.max(0, safeInt(entry.firstCaughtAt)),
      bestCaughtAt: Math.max(0, safeInt(entry.bestCaughtAt)),
    };
  }
  return codex;
}

function parseBossCodex(
  raw: unknown,
): Partial<Record<DangerousBossId, DangerousBossCodexEntry>> {
  const record = objectRecord(raw);
  const codex: Partial<Record<DangerousBossId, DangerousBossCodexEntry>> = {};
  if (!record) return codex;
  for (const [id, rawEntry] of Object.entries(record)) {
    if (!isDangerousBossId(id)) continue;
    const entry = objectRecord(rawEntry);
    if (!entry) continue;
    const defeats = Math.max(0, safeInt(entry.defeats));
    if (defeats === 0) continue;
    codex[id] = {
      defeats,
      firstDefeatedAt: Math.max(0, safeInt(entry.firstDefeatedAt)),
      lastDefeatedAt: Math.max(0, safeInt(entry.lastDefeatedAt)),
      bestContribution: Math.max(0, safeInt(entry.bestContribution)),
    };
  }
  return codex;
}

function parseBossAttempt(raw: unknown): DangerousBossAttempt | null {
  const value = objectRecord(raw);
  if (!value || typeof value.eventId !== "string" || value.eventId.length === 0) {
    return null;
  }
  const encounter = parseEncounter(value.encounter);
  if (!encounter || encounter.targetKind !== "boss") return null;
  return { eventId: value.eventId, encounter };
}

function parseVoyage(raw: unknown): DangerousFishingVoyage | null {
  const value = objectRecord(raw);
  if (
    !value ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    !isDangerousZoneId(value.zoneId) ||
    !isDangerousDepthId(value.depthId)
  ) {
    return null;
  }
  return {
    id: value.id,
    zoneId: value.zoneId,
    depthId: value.depthId,
    risk: clamp(safeInt(value.risk), 0, 5),
    startedAt: Math.max(0, safeInt(value.startedAt)),
    cargo: parseCargo(value.cargo),
    encounter: parseEncounter(value.encounter),
  };
}

export function parseDangerousFishingState(raw: unknown): DangerousFishingState {
  const fallback = emptyDangerousFishingState();
  const value = objectRecord(raw);
  if (!value) return fallback;
  const rawOwned = objectRecord(value.ownedGear);
  const rods = uniqueGear(rawOwned?.rods, isDangerousRodId, "starter_rod");
  const reels = uniqueGear(rawOwned?.reels, isDangerousReelId, "starter_reel");
  const lines = uniqueGear(rawOwned?.lines, isDangerousLineId, "starter_line");

  const baitCounts: Partial<Record<DangerousBaitId, number>> = {};
  const rawBaits = objectRecord(value.baitCounts);
  if (rawBaits) {
    for (const [id, amount] of Object.entries(rawBaits)) {
      if (!isDangerousBaitId(id) || id === "basic_bait") continue;
      const count = Math.max(0, safeInt(amount));
      if (count > 0) baitCounts[id] = count;
    }
  }

  const rawLoadout = objectRecord(value.loadout);
  const rodId =
    isDangerousRodId(rawLoadout?.rodId) && rods.includes(rawLoadout.rodId)
      ? rawLoadout.rodId
      : "starter_rod";
  const reelId =
    isDangerousReelId(rawLoadout?.reelId) && reels.includes(rawLoadout.reelId)
      ? rawLoadout.reelId
      : "starter_reel";
  const lineId =
    isDangerousLineId(rawLoadout?.lineId) && lines.includes(rawLoadout.lineId)
      ? rawLoadout.lineId
      : "starter_line";
  const baitId =
    isDangerousBaitId(rawLoadout?.baitId) &&
    (rawLoadout.baitId === "basic_bait" || (baitCounts[rawLoadout.baitId] ?? 0) > 0)
      ? rawLoadout.baitId
      : "basic_bait";

  const bossTraces: Partial<Record<DangerousBossId, number>> = {};
  const rawTraces = objectRecord(value.bossTraces);
  if (rawTraces) {
    for (const [id, amount] of Object.entries(rawTraces)) {
      if (!isDangerousBossId(id)) continue;
      const count = Math.max(0, safeInt(amount));
      if (count > 0) bossTraces[id] = count;
    }
  }

  const resolvedEncounterIds = Array.isArray(value.resolvedEncounterIds)
    ? value.resolvedEncounterIds
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .filter((id, index, all) => all.indexOf(id) === index)
        .slice(-32)
    : [];

  return {
    version: DANGEROUS_FISHING_STATE_VERSION,
    ownedGear: { rods, reels, lines },
    loadout: { rodId, reelId, lineId, baitId },
    baitCounts,
    codex: parseCodex(value.codex),
    bossCodex: parseBossCodex(value.bossCodex),
    bossTraces,
    bossAttempt: parseBossAttempt(value.bossAttempt),
    resolvedEncounterIds,
    voyage: parseVoyage(value.voyage),
  };
}

export function startDangerousVoyage(
  state: DangerousFishingState,
  args: {
    id: string;
    zoneId: DangerousZoneId;
    depthId: DangerousDepthId;
    risk: number;
    startedAt: number;
  },
):
  | { ok: true; state: DangerousFishingState }
  | { ok: false; error: "voyage_active"; state: DangerousFishingState } {
  if (state.voyage) return { ok: false, error: "voyage_active", state };
  return {
    ok: true,
    state: {
      ...state,
      voyage: {
        id: args.id,
        zoneId: args.zoneId,
        depthId: args.depthId,
        risk: clamp(safeInt(args.risk), 0, 5),
        startedAt: Math.max(0, safeInt(args.startedAt)),
        cargo: [],
        encounter: null,
      },
    },
  };
}

export function startPersonalEncounter(
  state: DangerousFishingState,
  encounter: DangerousEncounter,
):
  | { ok: true; state: DangerousFishingState }
  | {
      ok: false;
      error: "no_voyage" | "encounter_active";
      state: DangerousFishingState;
    } {
  if (!state.voyage) return { ok: false, error: "no_voyage", state };
  if (state.voyage.encounter) {
    return { ok: false, error: "encounter_active", state };
  }
  return {
    ok: true,
    state: {
      ...state,
      voyage: { ...state.voyage, encounter },
    },
  };
}

function withResolvedId(state: DangerousFishingState, encounterId: string): string[] {
  return [...state.resolvedEncounterIds.filter((id) => id !== encounterId), encounterId].slice(
    -32,
  );
}

export function resolvePersonalEncounter(
  state: DangerousFishingState,
  transition: DangerousEncounterTransition,
  now: number,
  caught?: {
    fishId: DangerousFishId;
    sizeCm: number;
    quantity: number;
  },
): {
  state: DangerousFishingState;
  outcome: "progress" | "caught" | "failed" | "duplicate" | "no_encounter";
  event?: DangerousEncounterEvent;
} {
  const encounterId = transition.encounter.id;
  if (state.resolvedEncounterIds.includes(encounterId)) {
    return { state, outcome: "duplicate", event: transition.event };
  }
  if (!state.voyage?.encounter || state.voyage.encounter.id !== encounterId) {
    return { state, outcome: "no_encounter", event: transition.event };
  }
  if (transition.event === "progress") {
    return {
      state: {
        ...state,
        voyage: { ...state.voyage, encounter: transition.encounter },
      },
      outcome: "progress",
      event: transition.event,
    };
  }
  if (transition.event === "too_fast" || transition.event === "stale") {
    return { state, outcome: "progress", event: transition.event };
  }

  const resolvedEncounterIds = withResolvedId(state, encounterId);
  const clearedVoyage = { ...state.voyage, encounter: null };
  if (
    transition.event !== "caught" ||
    !caught ||
    transition.encounter.targetKind !== "fish" ||
    transition.encounter.targetId !== caught.fishId
  ) {
    return {
      state: {
        ...state,
        resolvedEncounterIds,
        voyage: clearedVoyage,
      },
      outcome: "failed",
      event: transition.event,
    };
  }

  const fish = DANGEROUS_FISH[caught.fishId];
  const quantity = Math.max(1, safeInt(caught.quantity, 1));
  const sizeCm = clamp(safeInt(caught.sizeCm, fish.minSizeCm), fish.minSizeCm, fish.maxSizeCm);
  const materialId = dangerousCatchMaterialId(caught.fishId);
  const cargo = [...clearedVoyage.cargo];
  const cargoIndex = cargo.findIndex((item) => item.fishId === caught.fishId);
  if (cargoIndex >= 0) {
    const previous = cargo[cargoIndex];
    cargo[cargoIndex] = {
      ...previous,
      quantity: previous.quantity + quantity,
      totalValue: previous.totalValue + fish.cargoValue * quantity,
    };
  } else {
    cargo.push({
      fishId: caught.fishId,
      materialId,
      quantity,
      totalValue: fish.cargoValue * quantity,
    });
  }

  const previousCodex = state.codex[caught.fishId];
  const isBest = !previousCodex || sizeCm > previousCodex.bestSizeCm;
  const codexEntry: DangerousFishCodexEntry = {
    caughtCount: (previousCodex?.caughtCount ?? 0) + quantity,
    bestSizeCm: isBest ? sizeCm : (previousCodex?.bestSizeCm ?? sizeCm),
    firstCaughtAt: previousCodex?.firstCaughtAt ?? Math.max(0, safeInt(now)),
    bestCaughtAt: isBest
      ? Math.max(0, safeInt(now))
      : (previousCodex?.bestCaughtAt ?? Math.max(0, safeInt(now))),
  };
  return {
    state: {
      ...state,
      codex: { ...state.codex, [caught.fishId]: codexEntry },
      resolvedEncounterIds,
      voyage: {
        ...clearedVoyage,
        risk: clamp(clearedVoyage.risk + 1, 0, 5),
        cargo,
      },
    },
    outcome: "caught",
    event: transition.event,
  };
}

export function dangerousRiskPreview(risk: number): DangerousRiskPreview {
  const normalized = clamp(safeInt(risk), 0, 5);
  if (normalized <= 2) {
    return { risk: normalized, accidentChance: 0, maxLossFraction: 0 };
  }
  if (normalized === 3) {
    return { risk: 3, accidentChance: 0.12, maxLossFraction: 0.2 };
  }
  if (normalized === 4) {
    return { risk: 4, accidentChance: 0.22, maxLossFraction: 0.35 };
  }
  return { risk: 5, accidentChance: 0.32, maxLossFraction: 0.5 };
}

function settledMaterials(cargo: readonly DangerousCargoStack[]): Record<string, number> {
  const materials: Record<string, number> = {};
  for (const item of cargo) {
    materials[item.materialId] = (materials[item.materialId] ?? 0) + item.quantity;
  }
  return materials;
}

export function returnDangerousVoyage(
  state: DangerousFishingState,
): DangerousFishingReturn {
  if (!state.voyage) {
    return {
      state,
      incident: false,
      returned: false,
      lostValue: 0,
      lostCargo: {},
      materials: {},
    };
  }
  return {
    state: { ...state, voyage: null },
    incident: false,
    returned: true,
    lostValue: 0,
    lostCargo: {},
    materials: settledMaterials(state.voyage.cargo),
  };
}

export function applyDangerousAccidentAndReturn(
  state: DangerousFishingState,
  roll: number,
  cargoProtectionPct = 0,
): DangerousFishingReturn {
  if (!state.voyage) return returnDangerousVoyage(state);
  const preview = dangerousRiskPreview(state.voyage.risk);
  const normalizedRoll = Number.isFinite(roll) ? clamp(roll, 0, 1) : 1;
  if (preview.accidentChance === 0 || normalizedRoll >= preview.accidentChance) {
    return {
      state,
      incident: false,
      returned: false,
      lostValue: 0,
      lostCargo: {},
      materials: {},
    };
  }

  const cargo = state.voyage.cargo;
  const totalValue = cargo.reduce((sum, item) => sum + item.totalValue, 0);
  const protection = clamp(
    Number.isFinite(cargoProtectionPct) ? cargoProtectionPct : 0,
    0,
    100,
  );
  const lossBudget = Math.floor(
    totalValue * preview.maxLossFraction * (1 - protection / 100),
  );
  const lostCargo: Record<string, number> = {};
  const retainedCargo: DangerousCargoStack[] = [];
  let lostValue = 0;

  for (const item of cargo) {
    const proportionalBudget =
      totalValue > 0 ? Math.floor((lossBudget * item.totalValue) / totalValue) : 0;
    const unitValue = item.totalValue / item.quantity;
    const lostQuantity = Math.min(
      item.quantity,
      unitValue > 0 ? Math.floor(proportionalBudget / unitValue) : 0,
    );
    const itemLostValue = Math.floor(
      (item.totalValue * lostQuantity) / item.quantity,
    );
    lostValue += itemLostValue;
    if (lostQuantity > 0) lostCargo[item.materialId] = lostQuantity;
    const retainedQuantity = item.quantity - lostQuantity;
    if (retainedQuantity > 0) {
      retainedCargo.push({
        ...item,
        quantity: retainedQuantity,
        totalValue: item.totalValue - itemLostValue,
      });
    }
  }

  return {
    state: { ...state, voyage: null },
    incident: true,
    returned: true,
    lostValue,
    lostCargo,
    materials: settledMaterials(retainedCargo),
  };
}
