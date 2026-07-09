import {
  FISHING_SPOTS,
  fishNames,
  type FishingSpotId,
} from "@/adventure/data/v2/fishingSpots";

export type WorldActivityKind = "settlement" | "fishing";

export type WorldActivityRegionId = "village" | FishingSpotId;

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
  settlement: "거점",
  fishing: "낚시터",
};

export const WORLD_ACTIVITY_REGIONS: readonly WorldActivityRegion[] = [
  {
    id: "village",
    name: "마을",
    shortName: "마을",
    kind: "settlement",
    headline: "현재 거점",
    summary: "상점, 은행, 대장간과 생활 시설이 모여 있는 기본 거점.",
    tags: ["상점", "은행", "대장간"],
    action: { label: "마을로 가기", href: "/town" },
  },
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
];
