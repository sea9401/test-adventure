import type {
  StormExpeditionBoonId,
  StormExpeditionChoiceKind,
  StormExpeditionMode,
  StormExpeditionRiskEventId,
  StormExpeditionRouteId,
} from "@/adventure/data/v2/stormExpedition";
import type { StormExpeditionMapNodeId } from "@/adventure/data/v2/stormExpeditionMap";

export const STORM_EXPEDITION_AUTOPLAY_PLAN_KEY = "storm-expedition.autoplay-plan.v1";
export const STORM_EXPEDITION_AUTOPLAY_DEFAULTS_KEY = "storm-expedition.autoplay-defaults.v1";

export type StormExpeditionBoonStrategy = "offense" | "survival" | "resource";
export type StormExpeditionRouteStage = "outer" | "middle" | "guardian";
export type StormExpeditionRiskDecision = "accept" | "decline";

export type StormExpeditionAutoplayPlan = {
  version: 1;
  mode: StormExpeditionMode;
  outerRouteId: StormExpeditionRouteId;
  middleRouteId: StormExpeditionRouteId;
  guardianRouteId: StormExpeditionRouteId;
  boonStrategy: StormExpeditionBoonStrategy;
  riskEventDecisions?: Partial<
    Record<StormExpeditionRiskEventId, StormExpeditionRiskDecision>
  >;
};

type StormExpeditionResources = {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
};

export type StormExpeditionPlanStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const ROUTE_IDS = ["gale", "thunder", "wreckage"] as const;
const MODES = ["normal", "practice"] as const;
const BOON_STRATEGIES = ["offense", "survival", "resource"] as const;
const RISK_EVENT_IDS = [
  "rift_cache",
  "storm_contract",
  "unstable_blessing",
  "golden_compass",
] as const satisfies readonly StormExpeditionRiskEventId[];
const RISK_DECISIONS = ["accept", "decline"] as const;
const EPSILON = 1e-9;

const BOON_PRIORITIES: Record<StormExpeditionBoonStrategy, readonly StormExpeditionBoonId[]> = {
  offense: ["tempest_might", "swift_fate", "storm_guard", "victory_vigor", "deep_mana"],
  survival: ["victory_vigor", "storm_guard", "swift_fate", "tempest_might", "deep_mana"],
  resource: ["deep_mana", "victory_vigor", "storm_guard", "tempest_might", "swift_fate"],
};

export function stormExpeditionPlannedNodeId(
  plan: StormExpeditionAutoplayPlan,
  stage: StormExpeditionRouteStage,
): StormExpeditionMapNodeId {
  const routeId = stage === "outer"
    ? plan.outerRouteId
    : stage === "middle"
      ? plan.middleRouteId
      : plan.guardianRouteId;
  return `${routeId}_${stage}`;
}

export function isStormExpeditionPlanCompatible(
  plan: StormExpeditionAutoplayPlan,
  visitedNodeIds: readonly StormExpeditionMapNodeId[],
): boolean {
  return visitedNodeIds.every((nodeId) => {
    if (nodeId.endsWith("_outer")) return nodeId === `${plan.outerRouteId}_outer`;
    if (nodeId.endsWith("_middle")) return nodeId === `${plan.middleRouteId}_middle`;
    if (nodeId.endsWith("_camp")) return nodeId === `${plan.middleRouteId}_camp`;
    if (nodeId.endsWith("_elite")) return nodeId === `${plan.middleRouteId}_elite`;
    if (nodeId.endsWith("_guardian")) return nodeId === `${plan.guardianRouteId}_guardian`;
    return true;
  });
}

export function stormExpeditionRiskDecision(
  plan: StormExpeditionAutoplayPlan,
  eventId: StormExpeditionRiskEventId,
): StormExpeditionRiskDecision {
  return plan.riskEventDecisions?.[eventId] === "accept"
    ? "accept"
    : "decline";
}

export function stormExpeditionVisitedRouteId(
  visitedNodeIds: readonly StormExpeditionMapNodeId[],
  stage: StormExpeditionRouteStage,
): StormExpeditionRouteId | null {
  const suffixes = stage === "outer"
    ? ["_outer"]
    : stage === "middle"
      ? ["_middle", "_camp", "_elite"]
      : ["_guardian"];
  for (const routeId of ROUTE_IDS) {
    if (visitedNodeIds.some((nodeId) =>
      suffixes.some((suffix) => nodeId === `${routeId}${suffix}`)
    )) {
      return routeId;
    }
  }
  return null;
}

export function alignStormExpeditionPlanToVisitedRoutes(
  plan: StormExpeditionAutoplayPlan,
  visitedNodeIds: readonly StormExpeditionMapNodeId[],
): StormExpeditionAutoplayPlan {
  const outerRouteId = stormExpeditionVisitedRouteId(visitedNodeIds, "outer");
  const middleRouteId = stormExpeditionVisitedRouteId(visitedNodeIds, "middle");
  const guardianRouteId = stormExpeditionVisitedRouteId(visitedNodeIds, "guardian");
  return {
    ...plan,
    ...(outerRouteId ? { outerRouteId } : {}),
    ...(middleRouteId ? { middleRouteId } : {}),
    ...(guardianRouteId ? { guardianRouteId } : {}),
  };
}

export function chooseStormExpeditionBoon(
  strategy: StormExpeditionBoonStrategy,
  offered: readonly StormExpeditionBoonId[],
  owned: readonly StormExpeditionBoonId[],
): StormExpeditionBoonId | null {
  const offeredSet = new Set(offered);
  const ownedSet = new Set(owned);
  return BOON_PRIORITIES[strategy].find((boonId) => offeredSet.has(boonId) && !ownedSet.has(boonId)) ?? null;
}

export function chooseStormExpeditionCheckpointChoice(
  kind: Exclude<StormExpeditionChoiceKind, "altar">,
  input: StormExpeditionResources,
): string {
  const hpRatio = resourceRatio(input.hp, input.maxHp);
  const mpRatio = resourceRatio(input.mp, input.maxMp);

  if (kind === "supply") {
    const needsHp = hpRatio <= 0.85;
    const needsMp = mpRatio <= 0.8;
    if (needsHp && needsMp) return hpRatio <= mpRatio ? "field_rations" : "mana_ampoule";
    if (needsHp) return "field_rations";
    if (needsMp) return "mana_ampoule";
    return "storm_oil";
  }

  if (kind === "final_prep") {
    const needsHp = hpRatio <= 0.75;
    const needsMp = mpRatio <= 0.65;
    if (needsHp && needsMp) return hpRatio <= mpRatio ? "repair_armor" : "focus_mana";
    if (needsHp) return "repair_armor";
    if (needsMp) return "focus_mana";
    return "boss_slayer";
  }

  return chooseCampRecovery(hpRatio, mpRatio);
}

export function parseStoredStormExpeditionPlan(raw: string | null): StormExpeditionAutoplayPlan | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    if (source.version !== 1) return null;
    if (!includes(MODES, source.mode)) return null;
    if (!includes(ROUTE_IDS, source.outerRouteId)) return null;
    if (!includes(ROUTE_IDS, source.middleRouteId)) return null;
    if (!includes(ROUTE_IDS, source.guardianRouteId)) return null;
    if (!includes(BOON_STRATEGIES, source.boonStrategy)) return null;
    const rawRiskDecisions = source.riskEventDecisions;
    const riskEventDecisions = rawRiskDecisions && typeof rawRiskDecisions === "object"
      ? Object.fromEntries(
          RISK_EVENT_IDS.flatMap((eventId) => {
            const decision = (rawRiskDecisions as Record<string, unknown>)[eventId];
            return includes(RISK_DECISIONS, decision) ? [[eventId, decision]] : [];
          }),
        ) as Partial<Record<StormExpeditionRiskEventId, StormExpeditionRiskDecision>>
      : {};
    return {
      version: 1,
      mode: source.mode,
      outerRouteId: source.outerRouteId,
      middleRouteId: source.middleRouteId,
      guardianRouteId: source.guardianRouteId,
      boonStrategy: source.boonStrategy,
      ...(Object.keys(riskEventDecisions).length > 0 ? { riskEventDecisions } : {}),
    };
  } catch {
    return null;
  }
}

export function serializeStormExpeditionPlan(plan: StormExpeditionAutoplayPlan): string {
  return JSON.stringify(plan);
}

export function storeStormExpeditionAutoplayPlan(
  storage: StormExpeditionPlanStorage,
  plan: StormExpeditionAutoplayPlan,
): void {
  const serialized = serializeStormExpeditionPlan(plan);
  storage.setItem(STORM_EXPEDITION_AUTOPLAY_PLAN_KEY, serialized);
  storage.setItem(STORM_EXPEDITION_AUTOPLAY_DEFAULTS_KEY, serialized);
}

export function loadStormExpeditionAutoplayDefaults(
  storage: Pick<StormExpeditionPlanStorage, "getItem">,
): StormExpeditionAutoplayPlan | null {
  return parseStoredStormExpeditionPlan(storage.getItem(STORM_EXPEDITION_AUTOPLAY_DEFAULTS_KEY));
}

export function loadStormExpeditionResumePlan(
  storage: Pick<StormExpeditionPlanStorage, "getItem" | "removeItem">,
  visitedNodeIds: readonly StormExpeditionMapNodeId[],
): StormExpeditionAutoplayPlan | null {
  const raw = storage.getItem(STORM_EXPEDITION_AUTOPLAY_PLAN_KEY);
  const plan = parseStoredStormExpeditionPlan(raw);
  if (plan && isStormExpeditionPlanCompatible(plan, visitedNodeIds)) return plan;
  if (raw !== null) storage.removeItem(STORM_EXPEDITION_AUTOPLAY_PLAN_KEY);
  return null;
}

export function clearStormExpeditionAutoplayPlan(
  storage: Pick<StormExpeditionPlanStorage, "removeItem">,
): void {
  storage.removeItem(STORM_EXPEDITION_AUTOPLAY_PLAN_KEY);
}

function resourceRatio(current: number, maximum: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return 1;
  return Math.max(0, Math.min(1, current / maximum));
}

function chooseCampRecovery(hpRatio: number, mpRatio: number): string {
  const hpMissing = 1 - hpRatio;
  const mpMissing = 1 - mpRatio;
  const choices = [
    { id: "deep_rest", hp: 0.35, mp: 0 },
    { id: "meditation", hp: 0, mp: 0.45 },
    { id: "balanced_rest", hp: 0.2, mp: 0.25 },
  ] as const;
  const scored = choices.map((choice) => ({
    ...choice,
    score: Math.min(hpMissing, choice.hp) + Math.min(mpMissing, choice.mp),
  }));
  const bestScore = Math.max(...scored.map((choice) => choice.score));
  const tied = scored.filter((choice) => Math.abs(choice.score - bestScore) <= EPSILON);

  if (tied.length === 1) return tied[0].id;
  if (hpRatio < mpRatio) {
    const maxHpRecovery = Math.max(...tied.map((choice) => choice.hp));
    const hpChoice = tied.find((choice) => choice.hp === maxHpRecovery);
    if (hpChoice) return hpChoice.id;
  }
  if (mpRatio < hpRatio) {
    const maxMpRecovery = Math.max(...tied.map((choice) => choice.mp));
    const mpChoice = tied.find((choice) => choice.mp === maxMpRecovery);
    if (mpChoice) return mpChoice.id;
  }
  return tied.find((choice) => choice.id === "balanced_rest")?.id ?? tied[0].id;
}

function includes<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}
