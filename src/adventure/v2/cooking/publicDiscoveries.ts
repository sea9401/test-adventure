import type { PublicCookingDiscovery } from "./clientTypes";

export type PublicCookingDiscoverySort =
  | "recent"
  | "oldest"
  | "recipe_name"
  | "actor_name"
  | "unregistered";

const PUBLIC_DISCOVERY_SORTS = new Set<PublicCookingDiscoverySort>([
  "recent",
  "oldest",
  "recipe_name",
  "actor_name",
  "unregistered",
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
  const activeSort = normalizedSort(sort);
  const entries = discoveries
    .filter(
      (discovery) =>
        activeSort !== "unregistered" || !discovery.codexRegistered,
    )
    .map((discovery) => ({ ...discovery }));

  return entries.sort((left, right) => {
    const primary =
      activeSort === "recent" || activeSort === "unregistered"
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
