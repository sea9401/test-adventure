import {
  FISH,
  type FishId,
  type FishTier,
} from "@/adventure/data/v2/fish";
import type { MulttaeConditionId } from "@/adventure/data/v2/multtae";

export type FishingSpotId = "village_pier" | "reed_wetlands" | "rocky_coast";

export type FishingSpot = {
  id: FishingSpotId;
  name: string;
  shortName: string;
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
