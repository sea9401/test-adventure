import { and, eq } from "drizzle-orm";
import { equipmentLiberationRequests } from "@/db/schema";
import type { DbExecutor } from "./savesKv";

export type EquipmentLiberationReceiptResponse = {
  ok: true;
  item: unknown;
  gold: number;
  bankedGold: number;
  spentGold: number;
};

export type EquipmentLiberationReceipt = {
  userId: string;
  requestId: string;
  iid: string;
  expectedRevision: number;
  response: EquipmentLiberationReceiptResponse;
};

export async function readEquipmentLiberationReceipt(
  executor: DbExecutor,
  userId: string,
  requestId: string,
): Promise<EquipmentLiberationReceipt | null> {
  const row = (
    await executor
      .select({
        userId: equipmentLiberationRequests.userId,
        requestId: equipmentLiberationRequests.requestId,
        iid: equipmentLiberationRequests.iid,
        expectedRevision: equipmentLiberationRequests.expectedRevision,
        response: equipmentLiberationRequests.response,
      })
      .from(equipmentLiberationRequests)
      .where(
        and(
          eq(equipmentLiberationRequests.userId, userId),
          eq(equipmentLiberationRequests.requestId, requestId),
        ),
      )
      .limit(1)
  )[0];
  if (!row) return null;
  return row as EquipmentLiberationReceipt;
}

export async function insertEquipmentLiberationReceipt(
  executor: DbExecutor,
  receipt: EquipmentLiberationReceipt,
): Promise<void> {
  await executor.insert(equipmentLiberationRequests).values(receipt);
}
