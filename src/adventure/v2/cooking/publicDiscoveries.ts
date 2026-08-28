import type { PublicCookingDiscovery } from "./clientTypes";

export type PublicCookingDiscoverySort =
  | "recent"
  | "oldest"
  | "recipe_name"
  | "actor_name";

const PUBLIC_DISCOVERY_SORTS = new Set<PublicCookingDiscoverySort>([
  "recent",
  "oldest",
  "recipe_name",
  "actor_name",
]);

function normalizedSort(value: unknown): PublicCookingDiscoverySort {
  return typeof value === "string" &&
    PUBLIC_DISCOVERY_SORTS.has(value as PublicCookingDiscoverySort)
    ? (value as PublicCookingDiscoverySort)
    : "recent";
}

export function publicCookingDiscoveries(
  discoveries: readonly PublicCookingDiscovery[],
  sort: unknown = "recent",
): PublicCookingDiscovery[] {
  const entries = discoveries.map((discovery) => ({ ...discovery }));
  const activeSort = normalizedSort(sort);

  return entries.sort((left, right) => {
    const primary =
      activeSort === "recent"
        ? right.discoveredAt - left.discoveredAt
        : activeSort === "oldest"
          ? left.discoveredAt - right.discoveredAt
          : activeSort === "recipe_name"
            ? left.recipeName.localeCompare(right.recipeName, "ko-KR")
            : left.actorName.localeCompare(right.actorName, "ko-KR");
    return (
      primary ||
      left.recipeName.localeCompare(right.recipeName, "ko-KR") ||
      left.actorName.localeCompare(right.actorName, "ko-KR")
    );
  });
}
