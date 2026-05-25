import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

// GET /api/v2/me/equipment — V2EquipmentView 의 자체 fetch.
// 보유 목록 + 슬롯별 현재 장착.
//
// 저장: save key `equipment.v2` = { owned: V2EquipmentId[], equipped: {slot → id} }.
// 효과(스탯) wiring 은 보류 — 이 PR 은 장착 UI 검증 수준.

export type EquipmentSave = {
  owned?: unknown;
  equipped?: unknown;
};

const VALID_IDS = new Set(Object.keys(V2_EQUIPMENT));
const VALID_SLOTS = new Set<V2EquipSlot>(["weapon", "armor", "accessory"]);

export function parseEquipmentSave(raw: unknown): {
  owned: V2EquipmentId[];
  equipped: Partial<Record<V2EquipSlot, V2EquipmentId>>;
} {
  const v = (raw ?? {}) as EquipmentSave;
  const ownedRaw = Array.isArray(v.owned) ? v.owned : [];
  const owned: V2EquipmentId[] = [];
  const seen = new Set<string>();
  for (const id of ownedRaw) {
    if (typeof id !== "string" || !VALID_IDS.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    owned.push(id as V2EquipmentId);
  }
  const equippedRaw =
    v.equipped && typeof v.equipped === "object" ? v.equipped : {};
  const equipped: Partial<Record<V2EquipSlot, V2EquipmentId>> = {};
  for (const slot of VALID_SLOTS) {
    const id = (equippedRaw as Record<string, unknown>)[slot];
    if (typeof id !== "string" || !VALID_IDS.has(id)) continue;
    const item = V2_EQUIPMENT[id as V2EquipmentId];
    if (item.slot !== slot) continue;
    // 장착하려면 보유해야 함 (race 보정).
    if (!seen.has(id)) continue;
    equipped[slot] = id as V2EquipmentId;
  }
  return { owned, equipped };
}

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
  const { owned, equipped } = parseEquipmentSave(row?.value);

  return Response.json({ ok: true, owned, equipped });
}
