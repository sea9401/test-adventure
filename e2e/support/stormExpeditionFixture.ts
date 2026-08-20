import type { Page } from "@playwright/test";
import {
  STORM_EXPEDITION_ENTRANCE_NODE_IDS,
  STORM_EXPEDITION_MAP_NODES,
  type StormExpeditionMapNodeId,
} from "../../src/adventure/data/v2/stormExpeditionMap";

type FixtureAction = {
  action?: string;
  mode?: "normal" | "practice";
  targetNodeId?: StormExpeditionMapNodeId;
  choiceId?: string;
  decision?: "accept" | "decline";
  expectedCurrentNodeId?: StormExpeditionMapNodeId;
  expectedEncounterIndex?: number;
};

type FixtureActive = {
  version: 3;
  mode: "normal" | "practice";
  routeId: "gale" | "thunder" | "wreckage";
  currentNodeId: StormExpeditionMapNodeId;
  visitedNodeIds: StormExpeditionMapNodeId[];
  completedNodeIds: StormExpeditionMapNodeId[];
  encounterIndex: number;
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  defeatedCount: number;
  pendingGold: number;
  pendingMaterials: Record<string, number>;
  pendingEquipment: never[];
  boons: string[];
  nextBattleEffects: string[];
  altarOffers: string[];
  chosenChoices: Record<string, string>;
  riskEvent: null;
};

const ROUTES = [
  { id: "gale", name: "칼바람 항로", tagline: "속도", threat: "바람", statTheme: "민첩", accent: "sky" },
  { id: "thunder", name: "뇌운 항로", tagline: "마력", threat: "번개", statTheme: "지능", accent: "violet" },
  { id: "wreckage", name: "잔해 항로", tagline: "방어", threat: "파편", statTheme: "체력", accent: "amber" },
] as const;

const CHOICES = {
  supply: [
    { id: "field_rations", name: "응급 식량", description: "HP 회복" },
    { id: "mana_ampoule", name: "마나 앰풀", description: "MP 회복" },
    { id: "storm_oil", name: "폭풍 기름", description: "다음 전투 강화" },
  ],
  camp: [
    { id: "deep_rest", name: "깊은 휴식", description: "HP 집중 회복" },
    { id: "meditation", name: "명상", description: "MP 집중 회복" },
    { id: "balanced_rest", name: "균형 잡힌 휴식", description: "HP와 MP 회복" },
  ],
  altar: [
    { id: "swift_fate", name: "질풍의 운명", description: "속도와 치명타 강화" },
    { id: "storm_guard", name: "폭풍의 가호", description: "받는 피해 감소" },
    { id: "deep_mana", name: "깊은 마나", description: "최대 MP 증가" },
  ],
  final_prep: [
    { id: "repair_armor", name: "방어구 수리", description: "HP 회복" },
    { id: "focus_mana", name: "마나 집중", description: "MP 회복" },
    { id: "boss_slayer", name: "보스 사냥 준비", description: "최종 전투 강화" },
  ],
};

export async function installStormExpeditionApiFixture(page: Page) {
  const actions: FixtureAction[] = [];
  let active: FixtureActive | null = null;

  await page.route("**/api/v2/storm-expedition", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, json: statusBody(active) });
      return;
    }

    const action = request.postDataJSON() as FixtureAction;
    actions.push(action);
    const response = transition(active, action);
    active = response.active;
    await route.fulfill({ status: 200, json: statusBody(active, response.result) });
  });

  return { actions };
}

function transition(
  active: FixtureActive | null,
  action: FixtureAction,
): { active: FixtureActive | null; result?: Record<string, unknown> } {
  if (action.action === "start" && action.targetNodeId) {
    const routeId = routeIdFromNode(action.targetNodeId) ?? "gale";
    return {
      active: {
        version: 3,
        mode: action.mode ?? "normal",
        routeId,
        currentNodeId: action.targetNodeId,
        visitedNodeIds: [action.targetNodeId],
        completedNodeIds: [],
        encounterIndex: 0,
        hp: 1_000,
        mp: 800,
        maxHp: 1_000,
        maxMp: 800,
        defeatedCount: 0,
        pendingGold: 0,
        pendingMaterials: {},
        pendingEquipment: [],
        boons: [],
        nextBattleEffects: [],
        altarOffers: ["swift_fate", "storm_guard", "deep_mana"],
        chosenChoices: {},
        riskEvent: null,
      },
    };
  }
  if (!active) return { active: null, result: { ok: false, error: "no_active" } };
  if (action.expectedCurrentNodeId !== active.currentNodeId || action.expectedEncounterIndex !== active.encounterIndex) {
    return { active, result: { ok: false, error: "stale_state" } };
  }

  if (action.action === "move" && action.targetNodeId) {
    return {
      active: {
        ...active,
        routeId: routeIdFromNode(action.targetNodeId) ?? active.routeId,
        currentNodeId: action.targetNodeId,
        visitedNodeIds: [...active.visitedNodeIds, action.targetNodeId],
        encounterIndex: 0,
      },
    };
  }
  if (action.action === "choose" && action.choiceId) {
    return {
      active: {
        ...active,
        completedNodeIds: appendUnique(active.completedNodeIds, active.currentNodeId),
        chosenChoices: { ...active.chosenChoices, [currentNodeKind(active.currentNodeId)]: action.choiceId },
        boons: active.currentNodeId === "altar"
          ? appendUnique(active.boons, action.choiceId)
          : active.boons,
      },
      result: { choiceApplied: true, choiceId: action.choiceId },
    };
  }
  if (action.action === "risk_event" && action.decision) {
    return { active, result: { riskEventResolved: true, riskEventAccepted: action.decision === "accept" } };
  }
  if (action.action === "fight") {
    const nodeId = active.currentNodeId;
    if (nodeId === "storm_heart") {
      return {
        active: null,
        result: {
          success: true,
          bossClear: true,
          claimedRewards: active.mode === "normal",
          practice: active.mode === "practice",
          practiceCompleted: active.mode === "practice",
          currentNodeId: nodeId,
          enemyName: "폭풍의 심장",
          gainedGold: active.mode === "normal" ? active.pendingGold + 5_000 : 0,
          gainedMaterials: active.mode === "normal" ? { storm_fragment: 5 } : {},
          gainedEquipment: [],
        },
      };
    }
    return {
      active: {
        ...active,
        completedNodeIds: appendUnique(active.completedNodeIds, nodeId),
        defeatedCount: active.defeatedCount + 1,
        pendingGold: active.pendingGold + 1_000,
        pendingMaterials: { storm_fragment: (active.pendingMaterials.storm_fragment ?? 0) + 1 },
      },
      result: {
        success: true,
        currentNodeId: nodeId,
        enemyName: "원정의 적",
        droppedMaterials: { storm_fragment: 1 },
      },
    };
  }
  return { active, result: { ok: false, error: "invalid_decision" } };
}

function statusBody(active: FixtureActive | null, result: Record<string, unknown> = {}) {
  return {
    ok: result.ok ?? true,
    unlocked: true,
    unlockDepth: 72,
    frontierDepth: 72,
    attemptsLeft: 3,
    nodeCount: 9,
    gold: 50_000,
    state: { clears: 0, active, spFruitPity: 0, spFruitObtained: 0 },
    routes: ROUTES,
    nodes: STORM_EXPEDITION_MAP_NODES,
    entranceNodeIds: STORM_EXPEDITION_ENTRANCE_NODE_IDS,
    availableNextNodeIds: availableNextNodeIds(active),
    choices: CHOICES,
    ...result,
  };
}

function availableNextNodeIds(active: FixtureActive | null): readonly StormExpeditionMapNodeId[] {
  if (!active || !active.completedNodeIds.includes(active.currentNodeId)) return [];
  return STORM_EXPEDITION_MAP_NODES.find((node) => node.id === active.currentNodeId)?.nextNodeIds
    .filter((nodeId) => !active.visitedNodeIds.includes(nodeId)) ?? [];
}

function routeIdFromNode(nodeId: StormExpeditionMapNodeId): FixtureActive["routeId"] | null {
  if (nodeId.startsWith("gale_")) return "gale";
  if (nodeId.startsWith("thunder_")) return "thunder";
  if (nodeId.startsWith("wreckage_")) return "wreckage";
  return null;
}

function currentNodeKind(nodeId: StormExpeditionMapNodeId): string {
  return STORM_EXPEDITION_MAP_NODES.find((node) => node.id === nodeId)?.kind ?? "unknown";
}

function appendUnique<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? [...values] : [...values, value];
}
