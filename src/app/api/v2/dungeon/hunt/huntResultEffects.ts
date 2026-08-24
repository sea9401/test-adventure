import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import type { CodexMasteryGameplayEvent } from "@/lib/server/codexMasteryGameplay";
import { insertFeedEntry } from "@/lib/server/serverFeed";

export function huntEquipmentCodexEvents(
  droppedEquipments: readonly V2EquipmentId[],
  droppedUniques: readonly V2EquipmentId[],
): CodexMasteryGameplayEvent[] {
  return [...droppedEquipments, ...droppedUniques].map((entryId) => ({
    category: "equipment",
    entryId,
    amount: 1,
    source: "equipment.drop",
  }));
}

type HuntResultDrops = {
  result?: {
    droppedUnique?: V2EquipmentId | null;
    droppedUniques?: V2EquipmentId[];
  };
  batch?: { droppedUniques?: V2EquipmentId[] };
};

export async function broadcastHuntUniqueDrops(
  userId: string,
  result: HuntResultDrops,
): Promise<void> {
  const uniqueIds = result.batch
    ? (result.batch.droppedUniques ?? [])
    : (result.result?.droppedUniques ??
      (result.result?.droppedUnique ? [result.result.droppedUnique] : []));
  for (const itemId of uniqueIds) {
    await insertFeedEntry(userId, "unique_drop", { itemId });
  }
}
