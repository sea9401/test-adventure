import { themeFirstDepth } from "@/adventure/data/v2/dungeon";

export function dungeonFloorBackHref(
  depth: number,
  rareMapIid: string | null,
): string {
  if (rareMapIid !== null) return "/battle/dungeon";
  return `/battle/dungeon?openDepth=${themeFirstDepth(depth)}`;
}
