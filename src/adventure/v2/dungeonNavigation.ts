import {
  huntStageDepthForLegacyDepth,
  themeFirstDepth,
} from "@/adventure/data/v2/dungeon";
import type { RareMapInstance } from "@/adventure/data/v2/rareMaps";

export function dungeonFloorBackHref(
  depth: number,
  rareMapIid: string | null,
): string {
  if (rareMapIid !== null) return "/battle/dungeon";
  return `/battle/dungeon?openDepth=${themeFirstDepth(depth)}`;
}

export function normalHuntFloorHref(depth: number): string {
  return `/battle/dungeon/${huntStageDepthForLegacyDepth(depth)}`;
}

export function rareMapEntryHref(
  map: Pick<RareMapInstance, "iid" | "kind" | "depth">,
): string {
  const iid = encodeURIComponent(map.iid);
  if (map.kind === "secret_shop_map") return `/hidden/shop?map=${iid}`;
  if (map.kind === "rename_map") return `/hidden/rename?map=${iid}`;
  return `/battle/dungeon/${map.depth}?rareMap=${iid}`;
}
