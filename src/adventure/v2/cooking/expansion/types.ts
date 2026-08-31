import type {
  CookingField,
  CookingMethod,
  CookingRecipePublic,
} from "../types";

export type CookingExpansionRow = readonly [
  id: string,
  name: string,
  field: CookingField,
  method: CookingMethod,
  icon: string,
  tier: CookingRecipePublic["tier"],
];

export type CookingExpansionBatch = {
  id: string;
  rows: readonly CookingExpansionRow[];
};
