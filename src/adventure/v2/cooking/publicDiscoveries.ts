import type { CookingFirstDiscoveryView } from "./clientTypes";
import type { CookingRecipePublic } from "./types";

export type PublicCookingDiscoverySort =
  | "recent"
  | "oldest"
  | "recipe_name"
  | "actor_name";

export type PublicCookingDiscovery = {
  recipeId: string;
  recipeName: string;
  imageSrc: string;
  actorName: string;
  discoveredAt: number;
};

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
  recipes: readonly Pick<CookingRecipePublic, "id" | "name" | "imageSrc">[],
  firstDiscoveries: readonly Pick<
    CookingFirstDiscoveryView,
    "recipeId" | "actorName" | "discoveredAt"
  >[],
  sort: unknown = "recent",
): PublicCookingDiscovery[] {
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const entries = firstDiscoveries.flatMap((discovery) => {
    const recipe = recipeById.get(discovery.recipeId);
    return recipe
      ? [{
          recipeId: recipe.id,
          recipeName: recipe.name,
          imageSrc: recipe.imageSrc,
          actorName: discovery.actorName,
          discoveredAt: discovery.discoveredAt,
        }]
      : [];
  });
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
      left.recipeId.localeCompare(right.recipeId)
    );
  });
}
