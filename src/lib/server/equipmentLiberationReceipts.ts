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

export type EquipmentLiberationReceipt<Response = EquipmentLiberationReceiptResponse> = {
  userId: string;
  requestId: string;
  iid: string;
  expectedRevision: number;
  response: Response;
};

export async function readEquipmentLiberationReceipt<Response = EquipmentLiberationReceiptResponse>(
  executor: DbExecutor,
  userId: string,
  requestId: string,
): Promise<EquipmentLiberationReceipt<Response> | null> {
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
  return row as EquipmentLiberationReceipt<Response>;
}

export async function insertEquipmentLiberationReceipt<Response = EquipmentLiberationReceiptResponse>(
  executor: DbExecutor,
  receipt: EquipmentLiberationReceipt<Response>,
): Promise<void> {
  await executor.insert(equipmentLiberationRequests).values(receipt);
}
