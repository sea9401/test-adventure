import type { StormExpeditionMapNodeId } from "@/adventure/data/v2/stormExpeditionMap";

export type StormExpeditionMobileSegmentId = 1 | 2 | 3;

export type StormExpeditionMobileNodeLayout = {
  id: StormExpeditionMapNodeId;
  x: number;
  y: number;
};

export type StormExpeditionMobileSegment = {
  id: StormExpeditionMobileSegmentId;
  label: "항로 입구" | "중층 항로" | "폭풍 심장";
  height: 300 | 550 | 430;
  nodes: readonly StormExpeditionMobileNodeLayout[];
};

const ROUTE_X = {
  gale: 60,
  thunder: 180,
  wreckage: 300,
} as const;

export const STORM_EXPEDITION_MOBILE_SEGMENTS: readonly StormExpeditionMobileSegment[] = [
  {
    id: 1,
    label: "항로 입구",
    height: 300,
    nodes: [
      { id: "gale_outer", x: ROUTE_X.gale, y: 80 },
      { id: "thunder_outer", x: ROUTE_X.thunder, y: 80 },
      { id: "wreckage_outer", x: ROUTE_X.wreckage, y: 80 },
      { id: "supply", x: ROUTE_X.thunder, y: 220 },
    ],
  },
  {
    id: 2,
    label: "중층 항로",
    height: 550,
    nodes: [
      { id: "supply", x: ROUTE_X.thunder, y: 55 },
      { id: "gale_middle", x: ROUTE_X.gale, y: 165 },
      { id: "thunder_middle", x: ROUTE_X.thunder, y: 165 },
      { id: "wreckage_middle", x: ROUTE_X.wreckage, y: 165 },
      { id: "gale_camp", x: ROUTE_X.gale, y: 275 },
      { id: "thunder_camp", x: ROUTE_X.thunder, y: 275 },
      { id: "wreckage_camp", x: ROUTE_X.wreckage, y: 275 },
      { id: "gale_elite", x: ROUTE_X.gale, y: 385 },
      { id: "thunder_elite", x: ROUTE_X.thunder, y: 385 },
      { id: "wreckage_elite", x: ROUTE_X.wreckage, y: 385 },
      { id: "altar", x: ROUTE_X.thunder, y: 495 },
    ],
  },
  {
    id: 3,
    label: "폭풍 심장",
    height: 430,
    nodes: [
      { id: "altar", x: ROUTE_X.thunder, y: 50 },
      { id: "gale_guardian", x: ROUTE_X.gale, y: 155 },
      { id: "thunder_guardian", x: ROUTE_X.thunder, y: 155 },
      { id: "wreckage_guardian", x: ROUTE_X.wreckage, y: 155 },
      { id: "final_prep", x: ROUTE_X.thunder, y: 270 },
      { id: "storm_heart", x: ROUTE_X.thunder, y: 375 },
    ],
  },
];

export function stormExpeditionMobileSegment(
  currentNodeId: StormExpeditionMapNodeId | null,
): StormExpeditionMobileSegment {
  if (!currentNodeId || currentNodeId.endsWith("_outer")) {
    return STORM_EXPEDITION_MOBILE_SEGMENTS[0];
  }
  if (
    currentNodeId === "supply"
    || currentNodeId.endsWith("_middle")
    || currentNodeId.endsWith("_camp")
    || currentNodeId.endsWith("_elite")
  ) {
    return STORM_EXPEDITION_MOBILE_SEGMENTS[1];
  }
  return STORM_EXPEDITION_MOBILE_SEGMENTS[2];
}
