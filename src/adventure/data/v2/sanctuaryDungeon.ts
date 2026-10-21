import {
  STORM_EXPEDITION_ALTAR_CHOICES, STORM_EXPEDITION_CAMP_CHOICES,
  STORM_EXPEDITION_FINAL_PREP_CHOICES, STORM_EXPEDITION_SUPPLY_CHOICES,
  createStormAltarOffers, parseStormExpeditionState, stormExpeditionEnemy,
  type StormExpeditionActive, type StormExpeditionChoice, type StormExpeditionChoiceKind, type StormExpeditionState,
} from "./stormExpedition";
import { stormExpeditionMapNode, type StormExpeditionMapNode, type StormExpeditionMapNodeId } from "./stormExpeditionMap";
import { parseUnexploredSave, canChangeUnexploredNodes } from "./unexploredState";
import { EMBLEM_DIFFICULTIES, parseEmblemState, type Emblem, type EmblemDifficulty } from "./emblems";

export const SANCTUARY_SAVE_KEY = "sanctuary-dungeon.v1";
export const SANCTUARY_DAILY_ATTEMPTS = 3;
export const SANCTUARY_NAME = "태초의 성소";
export type SanctuaryDifficulty = EmblemDifficulty;
export const SANCTUARY_DIFFICULTIES = EMBLEM_DIFFICULTIES;
export const SANCTUARY_DIFFICULTY_LABELS: Record<SanctuaryDifficulty, string> = { normal: "노말", hard: "하드" };
/** 하드 적의 몬스터 깊이 가산치. 운영 상위 캐릭터 시뮬로 맞춘다. */
export const SANCTUARY_HARD_DEPTH_BONUS = 10;
export function parseSanctuaryDifficulty(raw: unknown): SanctuaryDifficulty | null {
  return (SANCTUARY_DIFFICULTIES as readonly unknown[]).includes(raw) ? raw as SanctuaryDifficulty : null;
}
const STEPS = [
  ["wreckage_outer", "성소 외곽"], ["supply", "탐험대 보급품"],
  ["wreckage_middle", "각인의 회랑"], ["wreckage_camp", "고요한 샘"],
  ["wreckage_elite", "문장의 파수꾼"], ["altar", "태초의 제단"],
  ["wreckage_guardian", "성소 수호자"], ["final_prep", "최종 정비"],
  ["storm_heart", "태초의 문지기"],
] as const satisfies readonly (readonly [StormExpeditionMapNodeId, string])[];
export const SANCTUARY_NODES: readonly StormExpeditionMapNode[] = STEPS.map(([id, name], index) => ({
  ...stormExpeditionMapNode(id)!, id, name, x: index * 100, y: 0,
  description: index === 8 ? "최종 보스 · 문장 확정 지급" : stormExpeditionMapNode(id)!.description.replace("항로", "성소").replace("폭풍의 심장", "최종 보스"),
  nextNodeIds: index < STEPS.length - 1 ? [STEPS[index + 1][0]] : [],
}));
export type SanctuaryState = StormExpeditionState & {
  revision: number;
  /** 진행 중인 탐험의 난이도. 진행 중인 탐험이 없으면 normal. */
  difficulty: SanctuaryDifficulty;
  pendingEmblems: Emblem[];
  autoPreferences: SanctuaryAutoPreferences;
};

export const SANCTUARY_AUTO_CHOICE_KINDS = ["supply", "camp", "altar", "final_prep"] as const satisfies readonly StormExpeditionChoiceKind[];
export type SanctuaryAutoChoiceKind = StormExpeditionChoiceKind;
/** 일괄 진행에서 선택 지점마다 고를 효과의 선호 순서. 항상 그 지점의 모든 효과를 한 번씩 담는다. */
export type SanctuaryAutoPreferences = Record<SanctuaryAutoChoiceKind, string[]>;

const SANCTUARY_CHOICE_CATALOG: Record<SanctuaryAutoChoiceKind, readonly StormExpeditionChoice[]> = {
  supply: STORM_EXPEDITION_SUPPLY_CHOICES.filter((choice) => choice.id !== "scavenged_coffer"),
  camp: STORM_EXPEDITION_CAMP_CHOICES,
  altar: STORM_EXPEDITION_ALTAR_CHOICES,
  final_prep: STORM_EXPEDITION_FINAL_PREP_CHOICES,
};

function sanctuaryChoiceText(choice: StormExpeditionChoice): StormExpeditionChoice {
  return { ...choice, name: choice.name.replaceAll("폭풍", "태초").replace("심장 파쇄", "문지기 공략"), description: choice.description.replaceAll("원정", "던전") };
}

/** 선택 지점 종류별 전체 효과 목록(성소 이름으로 바꾼 문구). */
export function sanctuaryChoiceCatalog(kind: SanctuaryAutoChoiceKind): StormExpeditionChoice[] {
  return SANCTUARY_CHOICE_CATALOG[kind].map(sanctuaryChoiceText);
}

export const DEFAULT_SANCTUARY_AUTO_PREFERENCES: SanctuaryAutoPreferences = Object.fromEntries(
  SANCTUARY_AUTO_CHOICE_KINDS.map((kind) => [kind, SANCTUARY_CHOICE_CATALOG[kind].map((choice) => choice.id)]),
) as SanctuaryAutoPreferences;

/** 일괄 진행 결과의 탐험 1회. endedAt은 클리어면 최종 보스, 패배면 진 상대 이름. */
export type SanctuaryAutoRun = { difficulty: SanctuaryDifficulty; cleared: boolean; endedAt: string; gainedEmblems: Emblem[]; lostEmblems: number };

export function parseSanctuaryAutoPreferences(raw: unknown): SanctuaryAutoPreferences {
  const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return Object.fromEntries(SANCTUARY_AUTO_CHOICE_KINDS.map((kind) => {
    const all = DEFAULT_SANCTUARY_AUTO_PREFERENCES[kind];
    const given = Array.isArray(obj[kind]) ? (obj[kind] as unknown[]).filter((id): id is string => typeof id === "string" && all.includes(id)) : [];
    return [kind, [...new Set([...given, ...all])]];
  })) as SanctuaryAutoPreferences;
}

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
    difficulty: active ? parseSanctuaryDifficulty(obj.difficulty) ?? "normal" : "normal",
    pendingEmblems: active ? parseEmblemState({ owned: obj.pendingEmblems }).owned : [],
    autoPreferences: parseSanctuaryAutoPreferences(obj.autoPreferences),
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
  const choices = kind === "altar" ? active.altarOffers.map((id) => STORM_EXPEDITION_ALTAR_CHOICES.find((choice) => choice.id === id)!)
    : kind === "battle" ? [] : SANCTUARY_CHOICE_CATALOG[kind];
  return choices.map(sanctuaryChoiceText);
}

/** 현재 선택 지점에서 제시된 효과 중 선호 순서가 가장 앞선 것. 전투 지점이면 null. */
export function pickSanctuaryAutoChoice(active: StormExpeditionActive, preferences: SanctuaryAutoPreferences): string | null {
  const kind = sanctuaryNode(active).kind;
  if (kind === "battle") return null;
  const offered = sanctuaryChoices(active).map((choice) => choice.id);
  return preferences[kind].find((id) => offered.includes(id)) ?? offered[0] ?? null;
}

export function sanctuaryEnemy(active: StormExpeditionActive, difficulty: SanctuaryDifficulty = "normal") {
  const node = sanctuaryNode(active);
  if (!node.encounterKind) throw new Error("battle_required");
  const monster = stormExpeditionEnemy("wreckage", node.encounterKind, active.encounterIndex, difficulty === "hard" ? SANCTUARY_HARD_DEPTH_BONUS : 0);
  const name = node.encounterKind === "early_trash" ? ["각인석 정찰병", "성소 석상"][active.encounterIndex]
    : node.encounterKind === "late_trash" ? ["문장 회수자", "태초의 석병"][active.encounterIndex] : node.name;
  return { ...monster, name };
}
