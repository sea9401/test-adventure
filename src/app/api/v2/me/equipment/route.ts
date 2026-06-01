import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  parseEquipmentSave,
  type EquipmentSave,
} from "@/adventure/data/v2/v2Equipment";

export type { EquipmentSave };

// GET /api/v2/me/equipment — V2EquipmentView 의 자체 fetch.
// 보유 목록 + 슬롯별 현재 장착.
//
// 저장: save key `equipment.v2` = { owned: V2EquipmentId[], equipped: {slot → id} }.
// 파싱(parseEquipmentSave) 은 v2Equipment.ts 로 옮겨 derive 와 공유한다.

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const row = (
    await db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "equipment.v2")))
      .limit(1)
  )[0];
  const { owned, equipped, durability, statRolls } = parseEquipmentSave(
    row?.value,
  );

  return Response.json({ ok: true, owned, equipped, durability, statRolls });
}
