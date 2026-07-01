import {
  FISH,
  FISH_IDS,
  isFishId,
  type FishId,
  type FishTier,
} from "@/adventure/data/v2/fish";

export const FISHING_PROGRESS_KEY = "fishing-progress.v1";

export type FishingRodId =
  | "reed_rod"
  | "lacquered_rod"
  | "deepcurrent_rod"
  | "master_rod"
  | "storm_rod";

export type FishingLureId =
  | "dough_lure"
  | "tide_lure"
  | "trophy_lure"
  | "prism_lure";

export type FishingGearBonuses = {
  waitReductionPct: number;
  sizeBonusPct: number;
  rareSizeBonusPct: number;
  bigCatchSizeBonusPct: number;
  specialWeightPct: number;
};

export type FishingRod = {
  id: FishingRodId;
  name: string;
  description: string;
  price: number;
  bonuses: Partial<FishingGearBonuses>;
};

export type FishingLure = {
  id: FishingLureId;
  name: string;
  description: string;
  price: number;
  bonuses: Partial<FishingGearBonuses>;
};

export const FISHING_RODS: Record<FishingRodId, FishingRod> = {
  reed_rod: {
    id: "reed_rod",
    name: "갈대 낚싯대",
    description: "기본 낚싯대. 특별한 보정은 없지만 언제든 쓸 수 있다.",
    price: 0,
    bonuses: {},
  },
  lacquered_rod: {
    id: "lacquered_rod",
    name: "옻칠 낚싯대",
    description: "입질 대기시간을 조금 줄이고 평균 씨알을 보정한다.",
    price: 1200,
    bonuses: { waitReductionPct: 8, sizeBonusPct: 2 },
  },
  deepcurrent_rod: {
    id: "deepcurrent_rod",
    name: "깊은물 낚싯대",
    description: "희귀 이상 어종을 끌어올릴 때 씨알 보정이 붙는다.",
    price: 3000,
    bonuses: { waitReductionPct: 12, rareSizeBonusPct: 4 },
  },
  master_rod: {
    id: "master_rod",
    name: "장인의 낚싯대",
    description: "대기시간, 평균 씨알, 희귀 어종 씨알을 고르게 보정한다.",
    price: 6500,
    bonuses: {
      waitReductionPct: 15,
      sizeBonusPct: 3,
      rareSizeBonusPct: 5,
      bigCatchSizeBonusPct: 1,
    },
  },
  storm_rod: {
    id: "storm_rod",
    name: "폭풍 낚싯대",
    description: "긴 대기시간을 크게 줄이고 대물권 어획을 노린다.",
    price: 9000,
    bonuses: {
      waitReductionPct: 20,
      rareSizeBonusPct: 3,
      bigCatchSizeBonusPct: 4,
    },
  },
};

export const FISHING_LURES: Record<FishingLureId, FishingLure> = {
  dough_lure: {
    id: "dough_lure",
    name: "반죽 미끼",
    description: "기본 미끼. 안정적인 입질을 노린다.",
    price: 0,
    bonuses: {},
  },
  tide_lure: {
    id: "tide_lure",
    name: "물때 미끼",
    description: "물때 한정 특별 손님의 가중치를 올리고 씨알을 조금 보정한다.",
    price: 1200,
    bonuses: { specialWeightPct: 20, sizeBonusPct: 1 },
  },
  trophy_lure: {
    id: "trophy_lure",
    name: "대물 미끼",
    description: "희귀 이상과 대물권 어획의 씨알을 보정한다.",
    price: 1800,
    bonuses: { rareSizeBonusPct: 2, bigCatchSizeBonusPct: 3 },
  },
  prism_lure: {
    id: "prism_lure",
    name: "프리즘 미끼",
    description: "물때 손님을 더 자주 부르고 희귀 어종의 씨알을 보정한다.",
    price: 5000,
    bonuses: { specialWeightPct: 30, rareSizeBonusPct: 4, bigCatchSizeBonusPct: 2 },
  },
};

export const FISHING_ROD_IDS = Object.keys(FISHING_RODS) as FishingRodId[];
export const FISHING_LURE_IDS = Object.keys(FISHING_LURES) as FishingLureId[];

const DEFAULT_ROD: FishingRodId = "reed_rod";
const DEFAULT_LURE: FishingLureId = "dough_lure";

export type FishingProgressionState = {
  xp: number;
  catches: number;
  fishCounts: Partial<Record<FishId, number>>;
  claimedGoals: string[];
  ownedRods: FishingRodId[];
  equippedRodId: FishingRodId;
  ownedLures: FishingLureId[];
  equippedLureId: FishingLureId;
};

export type FishingProgressionView = {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  catches: number;
  fishCounts: Partial<Record<FishId, number>>;
  claimedGoals: string[];
  goals: FishingGoalView[];
  equippedRodId: FishingRodId;
  equippedLureId: FishingLureId;
  ownedRods: FishingRodId[];
  ownedLures: FishingLureId[];
  bonuses: FishingGearBonuses;
};

export function emptyFishingProgression(): FishingProgressionState {
  return {
    xp: 0,
    catches: 0,
    fishCounts: {},
    claimedGoals: [],
    ownedRods: [DEFAULT_ROD],
    equippedRodId: DEFAULT_ROD,
    ownedLures: [DEFAULT_LURE],
    equippedLureId: DEFAULT_LURE,
  };
}

function posInt(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.max(0, Math.floor(raw))
    : 0;
}

function uniqueStrings(raw: unknown): string[] {
  return Array.isArray(raw)
    ? [...new Set(raw.filter((x): x is string => typeof x === "string"))]
    : [];
}

function parseFishCounts(raw: unknown): Partial<Record<FishId, number>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<FishId, number>> = {};
  for (const [id, count] of Object.entries(raw as Record<string, unknown>)) {
    if (isFishId(id)) {
      const n = posInt(count);
      if (n > 0) out[id] = n;
    }
  }
  return out;
}

function parseRodId(raw: unknown): FishingRodId | null {
  return typeof raw === "string" && raw in FISHING_RODS
    ? (raw as FishingRodId)
    : null;
}

function parseLureId(raw: unknown): FishingLureId | null {
  return typeof raw === "string" && raw in FISHING_LURES
    ? (raw as FishingLureId)
    : null;
}

function uniqueRods(raw: unknown): FishingRodId[] {
  const set = new Set<FishingRodId>([DEFAULT_ROD]);
  if (Array.isArray(raw)) {
    for (const id of raw) {
      const parsed = parseRodId(id);
      if (parsed) set.add(parsed);
    }
  }
  return FISHING_ROD_IDS.filter((id) => set.has(id));
}

function uniqueLures(raw: unknown): FishingLureId[] {
  const set = new Set<FishingLureId>([DEFAULT_LURE]);
  if (Array.isArray(raw)) {
    for (const id of raw) {
      const parsed = parseLureId(id);
      if (parsed) set.add(parsed);
    }
  }
  return FISHING_LURE_IDS.filter((id) => set.has(id));
}

export function parseFishingProgression(raw: unknown): FishingProgressionState {
  if (!raw || typeof raw !== "object") return emptyFishingProgression();
  const r = raw as Record<string, unknown>;
  const ownedRods = uniqueRods(r.ownedRods);
  const ownedLures = uniqueLures(r.ownedLures);
  const equippedRodId = parseRodId(r.equippedRodId);
  const equippedLureId = parseLureId(r.equippedLureId);
  return {
    xp: posInt(r.xp),
    catches: posInt(r.catches),
    fishCounts: parseFishCounts(r.fishCounts),
    claimedGoals: uniqueStrings(r.claimedGoals),
    ownedRods,
    equippedRodId:
      equippedRodId && ownedRods.includes(equippedRodId)
        ? equippedRodId
        : DEFAULT_ROD,
    ownedLures,
    equippedLureId:
      equippedLureId && ownedLures.includes(equippedLureId)
        ? equippedLureId
        : DEFAULT_LURE,
  };
}

function fishCount(state: FishingProgressionState, fishId: FishId): number {
  return state.fishCounts[fishId] ?? 0;
}

function tierCount(state: FishingProgressionState, tier: FishTier): number {
  return FISH_IDS.reduce(
    (sum, id) => sum + (FISH[id].tier === tier ? fishCount(state, id) : 0),
    0,
  );
}

function specialCount(state: FishingProgressionState): number {
  return FISH_IDS.reduce(
    (sum, id) => sum + (FISH[id].condition ? fishCount(state, id) : 0),
    0,
  );
}

function discoveredSpeciesCount(state: FishingProgressionState): number {
  return FISH_IDS.filter((id) => fishCount(state, id) > 0).length;
}

export type FishingGoalDef = {
  id: string;
  title: string;
  desc: string;
  goal: number;
  rewardCoins: number;
  progress: (state: FishingProgressionState) => number;
};

export type FishingGoalView = {
  id: string;
  title: string;
  desc: string;
  goal: number;
  rewardCoins: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
  claimable: boolean;
};

export const FISHING_COLLECTION_GOALS: readonly FishingGoalDef[] = [
  {
    id: "g_crucian_25",
    title: "붕어 단골",
    desc: "누적 붕어 25마리를 낚으세요.",
    goal: 25,
    rewardCoins: 120,
    progress: (s) => fishCount(s, "crucian_carp"),
  },
  {
    id: "g_carp_20",
    title: "잉어 손맛",
    desc: "누적 잉어 20마리를 낚으세요.",
    goal: 20,
    rewardCoins: 160,
    progress: (s) => fishCount(s, "carp"),
  },
  {
    id: "g_trout_12",
    title: "맑은 물 사냥꾼",
    desc: "누적 송어 12마리를 낚으세요.",
    goal: 12,
    rewardCoins: 220,
    progress: (s) => fishCount(s, "trout"),
  },
  {
    id: "g_marlin_5",
    title: "청새치와의 승부",
    desc: "누적 청새치 5마리를 낚으세요.",
    goal: 5,
    rewardCoins: 360,
    progress: (s) => fishCount(s, "marlin"),
  },
  {
    id: "g_legendary_3",
    title: "전설을 건져 올린 자",
    desc: "누적 전설 어종 3마리를 낚으세요.",
    goal: 3,
    rewardCoins: 500,
    progress: (s) => tierCount(s, "legendary"),
  },
  {
    id: "g_special_10",
    title: "물때를 읽는 손",
    desc: "누적 물때 특별 손님 10마리를 낚으세요.",
    goal: 10,
    rewardCoins: 320,
    progress: specialCount,
  },
  {
    id: "g_species_20",
    title: "어보 수집가",
    desc: "누적 서로 다른 20종을 낚으세요.",
    goal: 20,
    rewardCoins: 420,
    progress: discoveredSpeciesCount,
  },
];

export function fishingGoalById(id: string): FishingGoalDef | undefined {
  return FISHING_COLLECTION_GOALS.find((g) => g.id === id);
}

export function deriveFishingGoalViews(
  state: FishingProgressionState,
): FishingGoalView[] {
  return FISHING_COLLECTION_GOALS.map((g) => {
    const raw = g.progress(state);
    const complete = raw >= g.goal;
    const claimed = state.claimedGoals.includes(g.id);
    return {
      id: g.id,
      title: g.title,
      desc: g.desc,
      goal: g.goal,
      rewardCoins: g.rewardCoins,
      progress: Math.min(g.goal, raw),
      complete,
      claimed,
      claimable: complete && !claimed,
    };
  });
}

export function fishingLevelForXp(xp: number): number {
  const safe = Math.max(0, Math.floor(Number(xp) || 0));
  return Math.min(30, 1 + Math.floor(Math.sqrt(safe / 35)));
}

function xpRequiredForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return (lv - 1) ** 2 * 35;
}

export function fishingProgressionView(
  state: FishingProgressionState,
): FishingProgressionView {
  const level = fishingLevelForXp(state.xp);
  const levelStart = xpRequiredForLevel(level);
  const levelEnd = xpRequiredForLevel(level + 1);
  return {
    ...state,
    level,
    xpIntoLevel: Math.max(0, state.xp - levelStart),
    xpForNext: Math.max(1, levelEnd - levelStart),
    goals: deriveFishingGoalViews(state),
    bonuses: fishingBonusesFromProgression(state),
  };
}

export function fishingXpForCatch(fishId: FishId): number {
  const byTier: Record<FishTier, number> = {
    common: 3,
    uncommon: 4,
    rare: 6,
    epic: 10,
    legendary: 18,
  };
  const fish = FISH[fishId];
  return byTier[fish.tier] + (fish.condition ? 4 : 0);
}

export function addFishingCatchXp(
  state: FishingProgressionState,
  fishId: FishId,
): { state: FishingProgressionState; xpGained: number; leveledUp: boolean } {
  const before = fishingLevelForXp(state.xp);
  const xpGained = fishingXpForCatch(fishId);
  const nextFishCounts = {
    ...state.fishCounts,
    [fishId]: (state.fishCounts[fishId] ?? 0) + 1,
  };
  const next = {
    ...state,
    xp: state.xp + xpGained,
    catches: state.catches + 1,
    fishCounts: nextFishCounts,
  };
  return {
    state: next,
    xpGained,
    leveledUp: fishingLevelForXp(next.xp) > before,
  };
}

function addBonuses(
  target: FishingGearBonuses,
  source: Partial<FishingGearBonuses> | undefined,
) {
  if (!source) return;
  target.waitReductionPct += source.waitReductionPct ?? 0;
  target.sizeBonusPct += source.sizeBonusPct ?? 0;
  target.rareSizeBonusPct += source.rareSizeBonusPct ?? 0;
  target.bigCatchSizeBonusPct += source.bigCatchSizeBonusPct ?? 0;
  target.specialWeightPct += source.specialWeightPct ?? 0;
}

export function fishingBonusesFromProgression(
  state: FishingProgressionState,
): FishingGearBonuses {
  const level = fishingLevelForXp(state.xp);
  const bonuses: FishingGearBonuses = {
    waitReductionPct: 0,
    sizeBonusPct: Math.min(8, Math.floor((level - 1) / 4)),
    rareSizeBonusPct: 0,
    bigCatchSizeBonusPct: 0,
    specialWeightPct: Math.min(15, Math.floor((level - 1) / 2)),
  };
  addBonuses(bonuses, FISHING_RODS[state.equippedRodId]?.bonuses);
  addBonuses(bonuses, FISHING_LURES[state.equippedLureId]?.bonuses);
  return bonuses;
}

export function buyFishingRod(
  state: FishingProgressionState,
  rodId: FishingRodId,
): FishingProgressionState {
  if (state.ownedRods.includes(rodId)) {
    return { ...state, equippedRodId: rodId };
  }
  return {
    ...state,
    ownedRods: FISHING_ROD_IDS.filter(
      (id) => id === rodId || state.ownedRods.includes(id),
    ),
    equippedRodId: rodId,
  };
}

export function buyFishingLure(
  state: FishingProgressionState,
  lureId: FishingLureId,
): FishingProgressionState {
  if (state.ownedLures.includes(lureId)) {
    return { ...state, equippedLureId: lureId };
  }
  return {
    ...state,
    ownedLures: FISHING_LURE_IDS.filter(
      (id) => id === lureId || state.ownedLures.includes(id),
    ),
    equippedLureId: lureId,
  };
}

export function equipFishingRod(
  state: FishingProgressionState,
  rodId: FishingRodId,
): FishingProgressionState | null {
  return state.ownedRods.includes(rodId)
    ? { ...state, equippedRodId: rodId }
    : null;
}

export function equipFishingLure(
  state: FishingProgressionState,
  lureId: FishingLureId,
): FishingProgressionState | null {
  return state.ownedLures.includes(lureId)
    ? { ...state, equippedLureId: lureId }
    : null;
}

export function fishingGearPrice(kind: "rod" | "lure", id: string): number | null {
  if (kind === "rod") {
    const rod = parseRodId(id);
    return rod ? FISHING_RODS[rod].price : null;
  }
  const lure = parseLureId(id);
  return lure ? FISHING_LURES[lure].price : null;
}

export function fishingGearName(kind: "rod" | "lure", id: string): string {
  if (kind === "rod") return FISHING_RODS[id as FishingRodId]?.name ?? id;
  return FISHING_LURES[id as FishingLureId]?.name ?? id;
}
