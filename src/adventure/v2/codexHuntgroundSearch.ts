import type { dungeonThemeCatalog } from "@/adventure/data/v2/dungeon";
import { dropPoolForDepth } from "@/adventure/data/v2/dungeonEquipDrops";
import {
  commonIdsForDepthRange,
  SKY_RIFT_WEAPON_IDS,
  uniqueIdsForDepthRange,
} from "@/adventure/data/v2/dungeonUniqueDrops";
import {
  regionalHuntMaterialDrops,
  type HuntMaterialDropCatalogEntry,
} from "@/adventure/data/v2/huntMaterialCatalog";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { codexThemeDeepDepth, starterGridIds } from "./codexProgress";
import { matchesEquipmentSearch, matchesItemSearch } from "./itemSearch";

type CodexHuntgroundTheme = ReturnType<typeof dungeonThemeCatalog>[number];

export type CodexHuntgroundDrops = {
  deepDepth: number;
  bandIds: V2EquipmentId[];
  skyRiftWeaponIds: V2EquipmentId[];
  /** 일반·세트 장비 — 프론티어 밴드 풀(7~84) 또는 들판 스타터 그리드(1~6). */
  regularIds: V2EquipmentId[];
  uniqueIds: V2EquipmentId[];
  materialDrops: HuntMaterialDropCatalogEntry[];
};

export function codexHuntgroundDrops(
  theme: CodexHuntgroundTheme,
): CodexHuntgroundDrops {
  const deepDepth = codexThemeDeepDepth(theme.depthStart);
  const pool = dropPoolForDepth(theme.depthStart);
  const bandIds = commonIdsForDepthRange(theme.depthStart, deepDepth);
  const skyRiftWeaponIds =
    theme.depthStart <= 78 && deepDepth >= 78 ? [...SKY_RIFT_WEAPON_IDS] : [];
  return {
    deepDepth,
    bandIds,
    skyRiftWeaponIds,
    regularIds: bandIds.length > 0
      ? [...bandIds, ...skyRiftWeaponIds]
      : pool
        ? starterGridIds(pool)
        : [],
    uniqueIds: uniqueIdsForDepthRange(theme.depthStart, deepDepth),
    materialDrops: regionalHuntMaterialDrops({
      areaName: theme.name,
      depthStart: theme.depthStart,
      depthEnd: deepDepth,
      monsterKeys: theme.enemies.map((enemy) => enemy.key),
    }),
  };
}

export type CodexHuntgroundSearchResult = {
  equipmentIds: ReadonlySet<V2EquipmentId>;
  materialIds: ReadonlySet<string>;
  matchCount: number;
};

/** 검색어가 비어 있으면 null — 사냥터를 거르지 않는다. */
export function codexHuntgroundSearch(
  drops: Pick<CodexHuntgroundDrops, "regularIds" | "uniqueIds" | "materialDrops">,
  search: string,
): CodexHuntgroundSearchResult | null {
  if (!search.trim()) return null;
  const equipmentIds = new Set(
    [...drops.regularIds, ...drops.uniqueIds].filter((id) =>
      matchesEquipmentSearch(id, search),
    ),
  );
  const materialIds = new Set(
    drops.materialDrops
      .filter((entry) => matchesItemSearch(entry.name, search))
      .map((entry) => entry.id),
  );
  return {
    equipmentIds,
    materialIds,
    matchCount: equipmentIds.size + materialIds.size,
  };
}
