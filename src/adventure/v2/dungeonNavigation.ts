import {
  FIRST_HUNT_DEPTH,
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

/** 사냥 화면 주소에 붙이면 첫 전투 안내를 보여 준다(캐릭터를 만든 직후). */
export const FIRST_BATTLE_INTRO_PARAM = "first";

/** 새 캐릭터의 첫 사냥 화면. intro 를 주면 첫 전투 안내를 함께 띄운다. */
export function firstHuntHref(options?: { intro?: boolean }): string {
  const href = `/battle/dungeon/${FIRST_HUNT_DEPTH}`;
  return options?.intro ? `${href}?${FIRST_BATTLE_INTRO_PARAM}=1` : href;
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
