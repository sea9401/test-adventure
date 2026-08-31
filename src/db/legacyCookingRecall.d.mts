import type { ClientBase } from "pg";

export type LegacyCookingRecallResult = {
  skipped: boolean;
  recalledFoods: number;
  users: number;
};

export function recallLegacyCooking(
  client: Pick<ClientBase, "query">,
): Promise<LegacyCookingRecallResult>;
