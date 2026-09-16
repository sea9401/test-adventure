import {
  STORM_EXPEDITION_ALTAR_CHOICES, STORM_EXPEDITION_CAMP_CHOICES,
  STORM_EXPEDITION_FINAL_PREP_CHOICES, STORM_EXPEDITION_SUPPLY_CHOICES,
  createStormAltarOffers, parseStormExpeditionState, stormExpeditionEnemy,
  type StormExpeditionActive, type StormExpeditionState,
} from "./stormExpedition";
import { stormExpeditionMapNode, type StormExpeditionMapNode, type StormExpeditionMapNodeId } from "./stormExpeditionMap";
import { parseUnexploredSave, canChangeUnexploredNodes } from "./unexploredState";
import { parseEmblemState, type Emblem } from "./emblems";

export const SANCTUARY_SAVE_KEY = "sanctuary-dungeon.v1";
export const SANCTUARY_DAILY_ATTEMPTS = 3;
export const SANCTUARY_NAME = "태초의 성소";
const STEPS = [
  ["wreckage_outer", "성소 외곽"], ["supply", "탐험대 보급품"],
  ["wreckage_middle", "각인의 회랑"], ["wreckage_camp", "고요한 샘"],
  ["wreckage_elite", "문장의 파수꾼"], ["altar", "태초의 제단"],
  ["wreckage_guardian", "성소 수호자"], ["final_prep", "최종 정비"],
  ["storm_heart", "태초의 문지기"],
] as const satisfies readonly (readonly [StormExpeditionMapNodeId, string])[];
export const SANCTUARY_NODES: readonly StormExpeditionMapNode[] = STEPS.map(([id, name], index) => ({
  ...stormExpeditionMapNode(id)!, id, name, x: index * 100, y: 0,
  description: index === 8 ? "최종 보스 · 문장 1개 확정" : stormExpeditionMapNode(id)!.description.replace("항로", "성소").replace("폭풍의 심장", "최종 보스"),
  nextNodeIds: index < STEPS.length - 1 ? [STEPS[index + 1][0]] : [],
}));
export type SanctuaryState = StormExpeditionState & { revision: number; pendingEmblems: Emblem[] };

export function canEnterSanctuary(character: { level?: unknown; unexplored?: unknown }): boolean {
  // Reincarnation already preserves the first exploration point in character.unexplored.
  return canChangeUnexploredNodes(Number(character.level)) || parseUnexploredSave(character.unexplored).xpPoints >= 1;
}

export function parseSanctuaryState(raw: unknown, date?: string): SanctuaryState {
  const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const state = parseStormExpeditionState(raw, date);
  let active = state.active;
  if (active) {
    const index = SANCTUARY_NODES.findIndex((node) => node.id === active!.currentNodeId);
    const expectedPath = SANCTUARY_NODES.slice(0, index + 1).map((node) => node.id);
    if (index < 0 || active.routeId !== "wreckage" || active.mode !== "normal" || active.visitedNodeIds.join() !== expectedPath.join()) active = null;
  }
  return {
    ...state, active,
    revision: typeof obj.revision === "number" && Number.isSafeInteger(obj.revision) && obj.revision >= 0 ? obj.revision : 0,
    pendingEmblems: active ? parseEmblemState({ owned: obj.pendingEmblems }).owned : [],
  };
}

export function createSanctuaryActive(maxHp: number, maxMp: number, rng: () => number = Math.random): StormExpeditionActive {
  return {
    version: 3, mode: "normal", routeId: "wreckage", currentNodeId: "wreckage_outer",
    visitedNodeIds: ["wreckage_outer"], completedNodeIds: [], encounterIndex: 0,
    hp: maxHp, mp: maxMp, maxHp, maxMp, defeatedCount: 0,
    pendingGold: 0, pendingMaterials: {}, pendingEquipment: [], boons: [],
    nextBattleEffects: [], usedRecoverySkillIds: [], altarOffers: createStormAltarOffers(rng),
    chosenChoices: {}, riskEvent: null,
  };
}

export function sanctuaryNode(active: Pick<StormExpeditionActive, "currentNodeId">): StormExpeditionMapNode {
  const node = SANCTUARY_NODES.find((entry) => entry.id === active.currentNodeId);
  if (!node) throw new Error("invalid_node");
  return node;
}

/** There is no client-selected move: finishing an encounter/choice advances along the single path. */
export function advanceSanctuary(active: StormExpeditionActive): StormExpeditionActive | null {
  const node = sanctuaryNode(active);
  if (node.kind === "battle" && active.encounterIndex + 1 < (node.encounterCount ?? 1)) return { ...active, encounterIndex: active.encounterIndex + 1 };
  const nextId = node.nextNodeIds[0];
  if (!nextId) return null;
  return {
    ...active, currentNodeId: nextId, encounterIndex: 0,
    completedNodeIds: [...new Set([...active.completedNodeIds, node.id])],
    visitedNodeIds: [...active.visitedNodeIds, nextId],
  };
}

export function sanctuaryChoices(active: StormExpeditionActive) {
  const kind = sanctuaryNode(active).kind;
  const choices = kind === "supply" ? STORM_EXPEDITION_SUPPLY_CHOICES.filter((choice) => choice.id !== "scavenged_coffer")
    : kind === "camp" ? STORM_EXPEDITION_CAMP_CHOICES
    : kind === "altar" ? active.altarOffers.map((id) => STORM_EXPEDITION_ALTAR_CHOICES.find((choice) => choice.id === id)!)
    : kind === "final_prep" ? STORM_EXPEDITION_FINAL_PREP_CHOICES : [];
  return choices.map((choice) => ({ ...choice, name: choice.name.replaceAll("폭풍", "태초").replace("심장 파쇄", "문지기 공략"), description: choice.description.replaceAll("원정", "던전") }));
}

export function sanctuaryEnemy(active: StormExpeditionActive) {
  const node = sanctuaryNode(active);
  if (!node.encounterKind) throw new Error("battle_required");
  const monster = stormExpeditionEnemy("wreckage", node.encounterKind, active.encounterIndex);
  const name = node.encounterKind === "early_trash" ? ["각인석 정찰병", "성소 석상"][active.encounterIndex]
    : node.encounterKind === "late_trash" ? ["문장 회수자", "태초의 석병"][active.encounterIndex] : node.name;
  return { ...monster, name };
}
