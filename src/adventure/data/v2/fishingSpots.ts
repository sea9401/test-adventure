import {
  FISH,
  FISH_TIER_ORDER,
  type FishId,
  type FishTier,
} from "@/adventure/data/v2/fish";
import type { MulttaeConditionId } from "@/adventure/data/v2/multtae";

export type FishingSpotId =
  | "village_pier"
  | "reed_wetlands"
  | "rocky_coast"
  | "mist_lake"
  | "black_tideflat"
  | "rapid_gorge";

export type FishingSpotDifficulty = "easy" | "normal" | "hard" | "expert";

export const FISHING_SPOT_DIFFICULTY_LABEL: Record<
  FishingSpotDifficulty,
  string
> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
  expert: "매우 어려움",
};

export type FishingSpot = {
  id: FishingSpotId;
  name: string;
  shortName: string;
  difficulty: FishingSpotDifficulty;
  description: string;
  tags: string[];
  fishIds: readonly FishId[];
  featuredFishIds: readonly FishId[];
  specialConditionIds: readonly MulttaeConditionId[];
};

export const DEFAULT_FISHING_SPOT_ID: FishingSpotId = "village_pier";

export const FISHING_SPOTS: Record<FishingSpotId, FishingSpot> = {
  village_pier: {
    id: "village_pier",
    name: "마을 선착장",
    shortName: "선착장",
    difficulty: "easy",
    description: "마을 바로 앞 잔잔한 물가. 기본 어종과 여명 손님이 올라온다.",
    tags: ["기본", "민물", "여명"],
    fishIds: [
      "crucian_carp",
      "minnow",
      "killifish",
      "river_shrimp",
      "bitterling",
      "sand_gudgeon",
      "carp",
      "chub",
      "freshwater_eel",
      "trout",
      "rainbow_trout",
      "golden_koi",
      "platinum_carp",
      "goldeye",
    ],
    featuredFishIds: ["crucian_carp", "carp", "goldeye"],
    specialConditionIds: ["dawn"],
  },
  reed_wetlands: {
    id: "reed_wetlands",
    name: "갈대 습지",
    shortName: "습지",
    difficulty: "normal",
    description: "진흙과 갈대가 많은 습지. 장어와 안개 속 비단잉어를 노린다.",
    tags: ["민물", "안개", "장어"],
    fishIds: [
      "loach",
      "pond_smelt",
      "catfish",
      "sweetfish",
      "freshwater_eel",
      "pike",
      "sturgeon",
      "ancient_fish",
      "moonshadow_eel",
      "mist_koi",
      "moonlit_trout",
      "waterfall_salmon",
      "ghost_eel",
    ],
    featuredFishIds: ["catfish", "mist_koi", "sturgeon"],
    specialConditionIds: ["starlit", "mist", "moonlit", "rapid", "ebb"],
  },
  rocky_coast: {
    id: "rocky_coast",
    name: "바위 해안",
    shortName: "해안",
    difficulty: "normal",
    description: "갯바위와 깊은 물길이 만나는 해안. 바다 대물과 심류 손님이 걸린다.",
    tags: ["바다", "대물", "심류"],
    fishIds: [
      "goby",
      "mudskipper",
      "sea_bass",
      "mullet",
      "dodari",
      "flatfish",
      "gizzard_shad",
      "yellowtail",
      "red_seabream",
      "hairtail",
      "halibut",
      "rockfish",
      "marlin",
      "bluefin_tuna",
      "mahimahi",
      "giant_octopus",
      "anglerfish",
      "sunfish",
      "starlit_ray",
      "abyssal_leviathan",
      "oarfish",
      "stormrider",
      "abyss_catfish",
    ],
    featuredFishIds: ["sea_bass", "marlin", "abyss_catfish"],
    specialConditionIds: ["tempest", "deepcurrent"],
  },
  mist_lake: {
    id: "mist_lake",
    name: "안개 호수",
    shortName: "호수",
    difficulty: "hard",
    description: "새벽 안개가 오래 머무는 깊은 호수. 은빛 어종과 달빛 송어가 모습을 드러낸다.",
    tags: ["민물", "안개", "은빛"],
    fishIds: [
      "pond_smelt",
      "bitterling",
      "sand_gudgeon",
      "carp",
      "chub",
      "sweetfish",
      "trout",
      "rainbow_trout",
      "pike",
      "golden_koi",
      "platinum_carp",
      "ancient_fish",
      "goldeye",
      "mist_koi",
      "moonlit_trout",
    ],
    featuredFishIds: ["rainbow_trout", "mist_koi", "platinum_carp"],
    specialConditionIds: ["dawn", "mist", "moonlit"],
  },
  black_tideflat: {
    id: "black_tideflat",
    name: "검은 갯벌",
    shortName: "갯벌",
    difficulty: "hard",
    description: "밤이 되면 물길이 검게 가라앉는 갯벌. 장어와 썰물 손님을 노리기 좋다.",
    tags: ["갯벌", "밤", "썰물"],
    fishIds: [
      "goby",
      "mudskipper",
      "loach",
      "river_shrimp",
      "catfish",
      "mullet",
      "flatfish",
      "gizzard_shad",
      "freshwater_eel",
      "hairtail",
      "rockfish",
      "anglerfish",
      "moonshadow_eel",
      "ghost_eel",
      "stormrider",
    ],
    featuredFishIds: ["freshwater_eel", "ghost_eel", "anglerfish"],
    specialConditionIds: ["starlit", "ebb", "tempest"],
  },
  rapid_gorge: {
    id: "rapid_gorge",
    name: "급류 계곡",
    shortName: "계곡",
    difficulty: "hard",
    description: "차가운 물살이 바위를 때리는 계곡. 폭포 연어와 전설의 용비늘잉어가 강하게 버틴다.",
    tags: ["민물", "급류", "전설"],
    fishIds: [
      "minnow",
      "killifish",
      "chub",
      "sweetfish",
      "trout",
      "rainbow_trout",
      "pike",
      "sturgeon",
      "ancient_fish",
      "dragonscale_fish",
      "waterfall_salmon",
      "goldeye",
    ],
    featuredFishIds: ["trout", "waterfall_salmon", "dragonscale_fish"],
    specialConditionIds: ["rapid", "dawn"],
  },
};

export const FISHING_SPOT_IDS = Object.keys(FISHING_SPOTS) as FishingSpotId[];

export function isFishingSpotId(id: string): id is FishingSpotId {
  return Object.prototype.hasOwnProperty.call(FISHING_SPOTS, id);
}

export function getFishingSpot(id: string | undefined | null): FishingSpot {
  return id && isFishingSpotId(id)
    ? FISHING_SPOTS[id]
    : FISHING_SPOTS[DEFAULT_FISHING_SPOT_ID];
}

export function fishNames(ids: readonly FishId[]): string[] {
  return ids.map((id) => FISH[id].name);
}

export function tierCountsForSpot(spot: FishingSpot): Partial<Record<FishTier, number>> {
  const counts: Partial<Record<FishTier, number>> = {};
  for (const id of spot.fishIds) {
    const tier = FISH[id].tier;
    counts[tier] = (counts[tier] ?? 0) + 1;
  }
  return counts;
}

export function fishIdsByTierForSpot(
  spot: FishingSpot,
): Array<{ tier: FishTier; fishIds: FishId[] }> {
  return FISH_TIER_ORDER.map((tier) => ({
    tier,
    fishIds: spot.fishIds.filter((fishId) => FISH[fishId].tier === tier),
  })).filter((group) => group.fishIds.length > 0);
}
