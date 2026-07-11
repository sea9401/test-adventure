import {
  FISHING_SPOTS,
  fishNames,
  type FishingSpotId,
} from "@/adventure/data/v2/fishingSpots";
import {
  WOODCUTTING_SPOT_IDS,
  WOODCUTTING_SPOTS,
  woodcuttingTreeForSpot,
  type WoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";

export type WorldActivityKind = "fishing" | "woodcutting";

export type WorldActivityRegionId = FishingSpotId | WoodcuttingSpotId;

export type WorldActivityRegion = {
  id: WorldActivityRegionId;
  name: string;
  shortName: string;
  kind: WorldActivityKind;
  headline: string;
  summary: string;
  tags: string[];
  action: {
    label: string;
    href: string;
  };
};

export const WORLD_ACTIVITY_KIND_LABEL: Record<WorldActivityKind, string> = {
  fishing: "낚시터",
  woodcutting: "벌목지",
};

export const WORLD_ACTIVITY_REGIONS: readonly WorldActivityRegion[] = [
  ...Object.values(FISHING_SPOTS).map((spot): WorldActivityRegion => ({
    id: spot.id,
    name: spot.name,
    shortName: spot.shortName,
    kind: "fishing",
    headline: spot.description,
    summary: `주요 어종: ${fishNames(spot.featuredFishIds).join(", ")}`,
    tags: spot.tags,
    action: {
      label: "낚시하러 가기",
      href: `/town/fishing?spot=${spot.id}`,
    },
  })),
  ...WOODCUTTING_SPOT_IDS.map(
    (spotId): WorldActivityRegion => {
      const spot = WOODCUTTING_SPOTS[spotId];
      return {
        id: spot.id,
        name: spot.name,
        shortName: spot.shortName,
        kind: "woodcutting",
        headline: spot.description,
        summary: `벌목 수종: ${woodcuttingTreeForSpot(spot).name}`,
        tags: spot.tags,
        action: {
          label: "벌목하러 가기",
          href: `/town/logging?spot=${spot.id}`,
        },
      };
    },
  ),
];
