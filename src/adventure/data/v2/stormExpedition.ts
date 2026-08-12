import type { Monster } from "@/adventure/data/monsters/types";
import { scaleMonsterForFloor } from "./monsterScale";
import {
  parseEquipmentSave,
  type V2EquipInstance,
} from "./v2Equipment";
import {
  LIMITED_RECOVERY_SKILL_IDS,
  type LimitedRecoverySkillId,
} from "./v2Skills";

export const STORM_EXPEDITION_SAVE_KEY = "storm-expedition.v1";
export const STORM_EXPEDITION_UNLOCK_DEPTH = 72;
export const STORM_EXPEDITION_DAILY_ATTEMPTS = 3;
export const STORM_EXPEDITION_NODE_COUNT = 9;
/** 이전 화면/매뉴얼 import 호환용. 이제 전투 수가 아니라 지도 노드 수다. */
export const STORM_EXPEDITION_STAGE_COUNT = STORM_EXPEDITION_NODE_COUNT;

export type StormExpeditionMode = "normal" | "practice";
export type StormExpeditionRouteId = "gale" | "thunder" | "wreckage";
export type StormExpeditionNodeId =
  | "early_battle"
  | "supply"
  | "late_battle"
  | "camp"
  | "elite"
  | "altar"
  | "guardian"
  | "final_prep"
  | "storm_heart";
export type StormExpeditionEncounterKind =
  | "early_trash"
  | "late_trash"
  | "elite"
  | "guardian"
  | "final_boss";
export type StormExpeditionChoiceKind = "supply" | "camp" | "altar" | "final_prep";
export type StormExpeditionBoonId =
  | "tempest_might"
  | "storm_guard"
  | "swift_fate"
  | "victory_vigor"
  | "deep_mana";
export type StormExpeditionBattleEffectId =
  | "next_guard"
  | "next_assault"
  | "heart_assault"
  | "risk_enemy_fury";
export type StormExpeditionRiskEventId =
  | "rift_cache"
  | "storm_contract"
  | "unstable_blessing"
  | "golden_compass";
export type StormExpeditionRiskCurseId =
  | "raging_current"
  | "dulled_senses"
  | "mana_fracture";
export type StormExpeditionRiskEventOffer = {
  id: StormExpeditionRiskEventId;
  nodeIndex: 1 | 3 | 5;
  status: "offered" | "accepted" | "declined";
  boonId: StormExpeditionBoonId | null;
  curseId: StormExpeditionRiskCurseId | null;
};

export type StormExpeditionRoute = {
  id: StormExpeditionRouteId;
  name: string;
  tagline: string;
  threat: string;
  statTheme: string;
  accent: "sky" | "violet" | "amber";
};

export const STORM_EXPEDITION_ROUTES: StormExpeditionRoute[] = [
  {
    id: "gale",
    name: "칼바람 항로",
    tagline: "빠른 적을 뚫고 가장 날카로운 기류를 거슬러 오릅니다.",
    threat: "높은 속도 · 회피 · 치명타",
    statTheme: "민첩 · 행운",
    accent: "sky",
  },
  {
    id: "thunder",
    name: "뇌운 항로",
    tagline: "마력이 요동치는 구름층을 정면으로 가릅니다.",
    threat: "마법 공격 · 연속 스킬",
    statTheme: "지능 · 정신",
    accent: "violet",
  },
  {
    id: "wreckage",
    name: "부유 잔해지",
    tagline: "무너진 섬의 잔해 사이를 묵직하게 돌파합니다.",
    threat: "높은 방어 · 관통 · 강타",
    statTheme: "힘 · 활력",
    accent: "amber",
  },
];

export type StormExpeditionNode = {
  id: StormExpeditionNodeId;
  name: string;
  kind: "battle" | StormExpeditionChoiceKind;
  encounterKind?: StormExpeditionEncounterKind;
  encounterCount?: number;
  description: string;
};

export const STORM_EXPEDITION_NODES: readonly StormExpeditionNode[] = [
  { id: "early_battle", name: "폭풍 외곽", kind: "battle", encounterKind: "early_trash", encounterCount: 2, description: "잡몹 2연전" },
  { id: "supply", name: "표류 보급품", kind: "supply", description: "회복 또는 다음 전투 준비" },
  { id: "late_battle", name: "폭풍 중층", kind: "battle", encounterKind: "late_trash", encounterCount: 2, description: "강화 잡몹 2연전" },
  { id: "camp", name: "고요한 눈", kind: "camp", description: "HP·MP 정비" },
  { id: "elite", name: "정예의 길목", kind: "battle", encounterKind: "elite", encounterCount: 1, description: "항로 정예 전투" },
  { id: "altar", name: "폭풍 제단", kind: "altar", description: "원정 전용 능력 하나 획득" },
  { id: "guardian", name: "항로 수호자", kind: "battle", encounterKind: "guardian", encounterCount: 1, description: "항로별 수호자" },
  { id: "final_prep", name: "최종 정비", kind: "final_prep", description: "폭풍의 심장 진입 준비" },
  { id: "storm_heart", name: "폭풍의 심장", kind: "battle", encounterKind: "final_boss", encounterCount: 1, description: "모든 항로의 공통 최종 보스" },
] as const;

export type StormExpeditionChoice = {
  id: string;
  name: string;
  description: string;
};

export const STORM_EXPEDITION_SUPPLY_CHOICES: readonly StormExpeditionChoice[] = [
  { id: "field_rations", name: "응급 식량", description: "최대 HP의 15% 회복" },
  { id: "mana_ampoule", name: "마력 앰풀", description: "최대 MP의 20% 회복" },
  { id: "wind_barrier", name: "바람막이 장막", description: "다음 전투 받는 피해 15% 감소" },
  { id: "storm_oil", name: "폭풍 연마유", description: "다음 전투 공격력·마법공격력 12% 증가" },
  { id: "scavenged_coffer", name: "떠밀려온 금고", description: "미확정 골드 25,000G 획득" },
] as const;

export const STORM_EXPEDITION_CAMP_CHOICES: readonly StormExpeditionChoice[] = [
  { id: "deep_rest", name: "깊은 휴식", description: "최대 HP의 35% 회복" },
  { id: "meditation", name: "마력 명상", description: "최대 MP의 45% 회복" },
  { id: "balanced_rest", name: "균형 정비", description: "HP 20%와 MP 25% 회복" },
] as const;

export const STORM_EXPEDITION_ALTAR_CHOICES: readonly StormExpeditionChoice[] = [
  { id: "tempest_might", name: "폭풍의 완력", description: "이번 원정 공격력·마법공격력 12% 증가" },
  { id: "storm_guard", name: "폭풍의 가호", description: "이번 원정 받는 피해 10% 감소" },
  { id: "swift_fate", name: "질풍의 운명", description: "이번 원정 속도 12%·치명타 5%p 증가" },
  { id: "victory_vigor", name: "승리의 숨결", description: "전투 승리 때마다 최대 HP의 8% 회복" },
  { id: "deep_mana", name: "깊은 마나", description: "최대 MP 20% 증가 및 증가분만큼 즉시 회복" },
] as const;

export const STORM_EXPEDITION_FINAL_PREP_CHOICES: readonly StormExpeditionChoice[] = [
  { id: "repair_armor", name: "갑주 수리", description: "최대 HP의 25% 회복" },
  { id: "focus_mana", name: "마력 집중", description: "최대 MP의 35% 회복" },
  { id: "boss_slayer", name: "심장 파쇄 준비", description: "최종 보스전 공격력·마법공격력 15% 증가" },
] as const;

export const STORM_EXPEDITION_RISK_EVENTS: Record<
  StormExpeditionRiskEventId,
  StormExpeditionChoice & { nodeIndex: 1 | 3 | 5; cost: string }
> = {
  rift_cache: {
    id: "rift_cache",
    name: "균열 상자",
    description: "항로 재료 2개를 즉시 임시 가방에 넣습니다.",
    cost: "다음 적의 공격력 20% 증가",
    nodeIndex: 1,
  },
  storm_contract: {
    id: "storm_contract",
    name: "폭풍 계약",
    description: "남은 전투의 6티어 장비 드롭 확률이 2배가 됩니다.",
    cost: "남은 모든 적의 공격력 10% 증가",
    nodeIndex: 1,
  },
  unstable_blessing: {
    id: "unstable_blessing",
    name: "불안정한 축복",
    description: "출발 시 정해진 강한 제단 축복 하나를 즉시 얻습니다.",
    cost: "출발 시 정해진 약화 효과 하나를 함께 받음",
    nodeIndex: 5,
  },
  golden_compass: {
    id: "golden_compass",
    name: "황금 나침반",
    description: "남은 전투의 골드 보상이 35% 증가합니다.",
    cost: "이번 야영지의 회복 선택을 포기하고 즉시 다음 구간으로 이동",
    nodeIndex: 3,
  },
};

export const STORM_EXPEDITION_RISK_CURSES: Record<
  StormExpeditionRiskCurseId,
  StormExpeditionChoice
> = {
  raging_current: { id: "raging_current", name: "격앙된 기류", description: "남은 모든 적의 공격력 12% 증가" },
  dulled_senses: { id: "dulled_senses", name: "둔화된 감각", description: "이번 원정 속도 12% 감소" },
  mana_fracture: { id: "mana_fracture", name: "마력 균열", description: "이번 원정 최대 MP 15% 감소" },
};

export type StormExpeditionActive = {
  version: 2;
  mode: StormExpeditionMode;
  routeId: StormExpeditionRouteId;
  /** 다음에 처리할 0-based 지도 노드. */
  nodeIndex: number;
  /** 2연전 노드 안에서 다음에 싸울 적 번호. */
  encounterIndex: number;
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  defeatedCount: number;
  pendingGold: number;
  pendingMaterials: Record<string, number>;
  /** 드롭 순간 옵션까지 확정한 미수령 장비. */
  pendingEquipment: V2EquipInstance[];
  boons: StormExpeditionBoonId[];
  nextBattleEffects: StormExpeditionBattleEffectId[];
  /** 이번 원정에서 이미 사용한 무자원 생존 회복기. 재접속해도 유지된다. */
  usedRecoverySkillIds: LimitedRecoverySkillId[];
  altarOffers: StormExpeditionBoonId[];
  chosenChoices: Partial<Record<StormExpeditionChoiceKind, string>>;
  /** 출발 시 결과까지 고정되는 선택형 위험 이벤트. 기존 진행 중 원정에는 null. */
  riskEvent: StormExpeditionRiskEventOffer | null;
};

export type StormExpeditionState = {
  date: string;
  attemptsUsed: number;
  active: StormExpeditionActive | null;
  clears: number;
  /** 항로 공용 SP 열매 미획득 완주 횟수. 획득 시 0으로 초기화된다. */
  spFruitPity: number;
  /** 이 원정에서 누적 획득한 SP 열매 수. */
  spFruitObtained: number;
};

export function stormExpeditionDateKey(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function parseStormExpeditionState(raw: unknown, date = stormExpeditionDateKey()): StormExpeditionState {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    date,
    attemptsUsed: source.date === date
      ? clampInt(source.attemptsUsed, 0, STORM_EXPEDITION_DAILY_ATTEMPTS)
      : 0,
    // 자정이 지나도 진행 중 원정은 사라지지 않는다. 새 입장 횟수만 갱신한다.
    active: parseActive(source.active),
    clears: clampInt(source.clears, 0, Number.MAX_SAFE_INTEGER),
    spFruitPity: clampInt(source.spFruitPity, 0, 24),
    spFruitObtained: clampInt(source.spFruitObtained, 0, 3),
  };
}

export function stormExpeditionRoute(id: unknown): StormExpeditionRoute | null {
  return STORM_EXPEDITION_ROUTES.find((route) => route.id === id) ?? null;
}

export function stormExpeditionNode(active: Pick<StormExpeditionActive, "nodeIndex">): StormExpeditionNode {
  return STORM_EXPEDITION_NODES[clampInt(active.nodeIndex, 0, STORM_EXPEDITION_NODE_COUNT - 1)];
}

export function stormExpeditionBattleReward(kind: StormExpeditionEncounterKind, encounterIndex = 0): number {
  if (kind === "early_trash") return encounterIndex === 0 ? 12_000 : 14_000;
  if (kind === "late_trash") return encounterIndex === 0 ? 18_000 : 20_000;
  if (kind === "elite") return 38_000;
  if (kind === "guardian") return 65_000;
  return 95_000;
}

/** 구형 호출 호환용. 새 코드에서는 stormExpeditionBattleReward를 사용한다. */
export function stormExpeditionStageReward(stage: number): number {
  const rewards = [12_000, 14_000, 18_000, 20_000, 38_000, 0, 65_000, 0, 95_000];
  return rewards[clampInt(stage, 0, rewards.length - 1)] ?? 0;
}

/**
 * 원정 전투의 몬스터 스케일 기준 깊이.
 * 초반 연전의 누적 소모는 낮추되 최종 보스의 기준은 유지한다.
 */
export function stormExpeditionEncounterDepth(
  kind: StormExpeditionEncounterKind,
  encounterIndex = 0,
): number {
  if (kind === "early_trash") return 65 + clampInt(encounterIndex, 0, 1);
  if (kind === "late_trash") return 67 + clampInt(encounterIndex, 0, 1);
  if (kind === "elite") return 71;
  if (kind === "guardian") return 74;
  return 76;
}

export function stormExpeditionEnemy(
  routeId: StormExpeditionRouteId,
  kindOrLegacyStage: StormExpeditionEncounterKind | number,
  encounterIndex = 0,
): Monster {
  const kind = typeof kindOrLegacyStage === "number"
    ? (["early_trash", "late_trash", "elite", "guardian"] as const)[clampInt(kindOrLegacyStage, 0, 3)]
    : kindOrLegacyStage;
  const depth = stormExpeditionEncounterDepth(kind, encounterIndex);
  return scaleMonsterForFloor(stormExpeditionEnemyBase(routeId, kind, encounterIndex), depth);
}

export function createStormAltarOffers(rng: () => number = Math.random): StormExpeditionBoonId[] {
  const pool = STORM_EXPEDITION_ALTAR_CHOICES.map((choice) => choice.id as StormExpeditionBoonId);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export function defaultStormAltarOffers(routeId: StormExpeditionRouteId): StormExpeditionBoonId[] {
  if (routeId === "gale") return ["swift_fate", "victory_vigor", "storm_guard"];
  if (routeId === "thunder") return ["deep_mana", "tempest_might", "storm_guard"];
  return ["tempest_might", "storm_guard", "victory_vigor"];
}

export function createStormRiskEvent(
  rng: () => number = Math.random,
): StormExpeditionRiskEventOffer {
  const ids = Object.keys(STORM_EXPEDITION_RISK_EVENTS) as StormExpeditionRiskEventId[];
  const id = ids[Math.min(ids.length - 1, Math.max(0, Math.floor(rng() * ids.length)))];
  const definition = STORM_EXPEDITION_RISK_EVENTS[id];
  const boonIds = STORM_EXPEDITION_ALTAR_CHOICES.map((choice) => choice.id as StormExpeditionBoonId);
  const selectedBoon = id === "unstable_blessing"
    ? boonIds[Math.min(boonIds.length - 1, Math.max(0, Math.floor(rng() * boonIds.length)))]
    : null;
  const curseIds = (Object.keys(STORM_EXPEDITION_RISK_CURSES) as StormExpeditionRiskCurseId[])
    .filter((curseId) => !(selectedBoon === "deep_mana" && curseId === "mana_fracture"))
    .filter((curseId) => !(selectedBoon === "swift_fate" && curseId === "dulled_senses"));
  return {
    id,
    nodeIndex: definition.nodeIndex,
    status: "offered",
    boonId: selectedBoon,
    curseId: id === "unstable_blessing"
      ? curseIds[Math.min(curseIds.length - 1, Math.max(0, Math.floor(rng() * curseIds.length)))]
      : null,
  };
}

function stormExpeditionEnemyBase(
  routeId: StormExpeditionRouteId,
  kind: StormExpeditionEncounterKind,
  encounterIndex: number,
): Monster {
  if (kind === "final_boss") {
    const routeWeakness: Partial<Monster> = routeId === "gale"
      ? {
          statusDamageReductionPct: 0,
          evasionPct: 16,
          v2Skills: undefined,
          v2MaxMp: 0,
          skill: { kind: "pierce", name: "심장부 칼바람", armorPierce: 9 },
          bonusAttackChancePct: 25,
        }
      : routeId === "thunder"
        ? { hp: 800, magicDef: 6 }
        : {
            hp: 700,
            atk: 30,
            def: 6,
            spd: 8,
            armorVulnerable: 0.4,
            playerDefVulnerable: 0.04,
            v2Skills: undefined,
            v2MaxMp: 0,
            skill: { kind: "heavy_blow", name: "심장부 붕괴", everyPhases: 3, multiplier: 1.25 },
            bonusAttackChancePct: 10,
          };
    return {
      name: "폭풍의 심장",
      tags: ["spirit", "golem"],
      hp: 900,
      atk: 43,
      def: 14,
      magicDef: 14,
      spd: 13,
      accuracy: 68,
      evasionPct: 22,
      critPct: 34,
      statusDamageReductionPct: 20,
      element: "lightning",
      exp: 0,
      drops: [],
      armorVulnerable: 0.22,
      playerDefVulnerable: 0.1,
      v2Skills: { learned: ["mob_arcane_burst", "mob_arcane_nova"], equipped: ["mob_arcane_nova", "mob_arcane_burst"] },
      v2MaxMp: 260,
      bonusAttackChancePct: 15,
      ...routeWeakness,
    };
  }

  const rank = kind === "early_trash" ? encounterIndex : kind === "late_trash" ? 2 + encounterIndex : kind === "elite" ? 4 : 5;
  const guardian = kind === "guardian";
  const elite = kind === "elite";
  const common = {
    tags: (guardian || elite ? ["spirit", "golem"] : ["spirit"]) as Monster["tags"],
    exp: 0,
    drops: [],
    armorVulnerable: guardian ? 0.22 : elite ? 0.17 : 0.12,
  };

  if (routeId === "gale") {
    const names = ["돌개바람 사냥꾼", "절벽의 칼깃", "칼날구름 정찰자", "폭풍 추격자", "질풍의 선봉장", "폭풍날개 라자크"];
    return {
      ...common,
      name: names[rank], hp: [410, 460, 520, 590, 760, 980][rank], atk: [38, 40, 42, 44, 47, 48][rank],
      def: [11, 12, 14, 15, 18, 18][rank], spd: [11, 12, 14, 15, 17, 18][rank],
      accuracy: [32, 38, 44, 50, 59, 68][rank], evasionPct: [22, 24, 27, 30, 33, 34][rank],
      critPct: [22, 25, 28, 31, 36, 43][rank], element: "wind",
      statusDamageReductionPct: guardian ? 15 : elite ? 10 : 0,
      skill: { kind: "pierce", name: "진공 발톱", armorPierce: guardian ? 10 : elite ? 9 : 7 },
      bonusAttackChancePct: guardian ? 55 : Math.max(0, rank - 1) * 12,
    };
  }
  if (routeId === "thunder") {
    const names = ["뇌운 정령", "전광 부유체", "낙뢰 인도자", "자전 마도체", "천뢰 집행자", "뇌정의 핵 아스트라"];
    return {
      ...common,
      name: names[rank], hp: [400, 450, 510, 575, 600, 780][rank], atk: [35, 37, 39, 41, 38, 41][rank],
      def: [10, 11, 13, 14, 17, 17][rank], magicDef: [11, 12, 14, 15, 14, 14][rank],
      spd: [9, 9, 10, 11, 12, 13][rank], accuracy: [30, 36, 43, 49, 58, 64][rank],
      evasionPct: [13, 15, 17, 19, 21, 25][rank], atkType: "magic", critPct: [17, 20, 23, 27, 30, 36][rank],
      element: "lightning",
      statusDamageReductionPct: guardian ? 20 : elite ? 15 : 5,
      v2Skills: { learned: guardian ? ["mob_arcane_burst", "mob_arcane_nova"] : ["mob_arcane_burst"], equipped: guardian ? ["mob_arcane_nova", "mob_arcane_burst"] : ["mob_arcane_burst"] },
      v2MaxMp: guardian ? 230 : elite ? 180 : 110 + rank * 15,
      bonusAttackChancePct: guardian ? 25 : 0,
    };
  }
  const names = ["잔해 갑주병", "부유석 파수꾼", "고철 감시자", "부유석 파쇄자", "침몰섬 거신", "붕괴의 수문장 모르가"];
  return {
    ...common,
    name: names[rank], hp: [500, 560, 640, 710, 900, 740][rank], atk: [36, 38, 40, 42, 45, 47][rank],
    def: [19, 21, 24, 26, 30, 19][rank], spd: [5, 5, 6, 7, 7, 8][rank],
    accuracy: [28, 34, 40, 47, 55, 62][rank], evasionPct: [5, 6, 7, 9, 10, 12][rank],
    critPct: [11, 13, 16, 19, 23, 29][rank], element: "earth",
    statusDamageReductionPct: guardian ? 30 : elite ? 25 : 15,
    skill: guardian
      ? { kind: "heavy_blow", name: "섬 붕괴", everyPhases: 3, multiplier: 1.9 }
      : { kind: "pierce", name: "잔해 관통", armorPierce: elite ? 10 : 7 + Math.floor(rank / 2) },
    playerDefVulnerable: guardian ? 0.08 : elite ? 0.16 : 0.1,
    ...(guardian ? { atk: 32, skill: { kind: "heavy_blow" as const, name: "섬 붕괴", everyPhases: 3, multiplier: 1.25 } } : {}),
  };
}

function parseActive(raw: unknown): StormExpeditionActive | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const route = stormExpeditionRoute(source.routeId);
  if (!route) return null;
  const legacy = source.nodeIndex === undefined;
  const legacyStage = clampInt(source.stage, 0, 3);
  const nodeIndex = legacy ? [0, 2, 4, 6][legacyStage] : clampInt(source.nodeIndex, 0, STORM_EXPEDITION_NODE_COUNT - 1);
  const hp = clampInt(source.hp, 0, Number.MAX_SAFE_INTEGER);
  const mp = clampInt(source.mp, 0, Number.MAX_SAFE_INTEGER);
  const parsedAltarOffers = parseEnumArray(
    source.altarOffers,
    STORM_EXPEDITION_ALTAR_CHOICES.map((choice) => choice.id),
  ).slice(0, 3) as StormExpeditionBoonId[];
  return {
    version: 2,
    mode: source.mode === "practice" ? "practice" : "normal",
    routeId: route.id,
    nodeIndex,
    encounterIndex: legacy ? 0 : clampInt(source.encounterIndex, 0, 1),
    hp,
    mp,
    maxHp: Math.max(1, clampInt(source.maxHp, hp || 1, Number.MAX_SAFE_INTEGER)),
    maxMp: Math.max(0, clampInt(source.maxMp, mp, Number.MAX_SAFE_INTEGER)),
    defeatedCount: legacy ? legacyStage : clampInt(source.defeatedCount, 0, 7),
    pendingGold: clampInt(source.pendingGold, 0, Number.MAX_SAFE_INTEGER),
    pendingMaterials: parsePendingMaterials(source.pendingMaterials),
    pendingEquipment: parseEquipmentSave({ owned: source.pendingEquipment, equipped: {} }).owned,
    boons: parseEnumArray(source.boons, STORM_EXPEDITION_ALTAR_CHOICES.map((choice) => choice.id)) as StormExpeditionBoonId[],
    nextBattleEffects: parseEnumArray(source.nextBattleEffects, ["next_guard", "next_assault", "heart_assault", "risk_enemy_fury"]) as StormExpeditionBattleEffectId[],
    usedRecoverySkillIds: parseEnumArray(
      source.usedRecoverySkillIds,
      LIMITED_RECOVERY_SKILL_IDS,
    ) as LimitedRecoverySkillId[],
    altarOffers: parsedAltarOffers.length === 3
      ? parsedAltarOffers
      : defaultStormAltarOffers(route.id),
    chosenChoices: parseChosenChoices(source.chosenChoices),
    riskEvent: parseRiskEvent(source.riskEvent),
  };
}

function parsePendingMaterials(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const materials: Record<string, number> = {};
  for (const [id, amount] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = clampInt(amount, 0, Number.MAX_SAFE_INTEGER);
    if (parsed > 0) materials[id] = parsed;
  }
  return materials;
}

function parseEnumArray(raw: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((value): value is string => typeof value === "string" && allowed.includes(value)))];
}

function parseChosenChoices(raw: unknown): Partial<Record<StormExpeditionChoiceKind, string>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const result: Partial<Record<StormExpeditionChoiceKind, string>> = {};
  for (const kind of ["supply", "camp", "altar", "final_prep"] as const) {
    if (typeof source[kind] === "string") result[kind] = source[kind];
  }
  return result;
}

function parseRiskEvent(raw: unknown): StormExpeditionRiskEventOffer | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const definition = STORM_EXPEDITION_RISK_EVENTS[source.id as StormExpeditionRiskEventId];
  if (!definition) return null;
  const status = source.status === "accepted" || source.status === "declined"
    ? source.status
    : "offered";
  const boonId = STORM_EXPEDITION_ALTAR_CHOICES.some((choice) => choice.id === source.boonId)
    ? source.boonId as StormExpeditionBoonId
    : null;
  const curseId = Object.hasOwn(STORM_EXPEDITION_RISK_CURSES, String(source.curseId))
    ? source.curseId as StormExpeditionRiskCurseId
    : null;
  return {
    id: definition.id as StormExpeditionRiskEventId,
    nodeIndex: definition.nodeIndex,
    status,
    boonId: definition.id === "unstable_blessing" ? boonId : null,
    curseId: definition.id === "unstable_blessing" ? curseId : null,
  };
}

function clampInt(raw: unknown, min: number, max: number): number {
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
