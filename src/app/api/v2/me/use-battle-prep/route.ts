// POST /api/v2/me/use-battle-prep — { itemId } 전투 준비물(숫돌·보강재) 1개 사용.
// 해당 품목의 칸만 새 품목으로 교체한다. 시간은 누적하지 않는다.

import { db } from "@/db";
import {
  BATTLE_PREP_ITEM_BY_ID,
  applyBattlePrepUse,
} from "@/adventure/data/v2/battlePrep";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

type CharacterSave = Record<string, unknown> & {
  materials?: Record<string, number>;
  activeBattlePreps?: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:use-battle-prep",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { itemId?: unknown } | null;
  const itemId = body?.itemId;
  if (typeof itemId !== "string" || !BATTLE_PREP_ITEM_BY_ID.has(itemId)) {
    return Response.json({ ok: false, error: "bad_item" }, { status: 400 });
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
    const used = applyBattlePrepUse({
      materials: character.materials ?? {},
      activeRaw: character.activeBattlePreps,
      itemId,
      now,
    });
    if (!used.ok) return used;
    await upsertSave(tx, userId, "character.v2", {
      ...character,
      materials: used.materials,
      activeBattlePreps: used.active,
    });
    return {
      ok: true as const,
      itemId: used.item.id,
      slot: used.item.slot,
      expiresAt: now + used.item.durationMs,
      activeBattlePreps: used.active,
      owned: used.materials[used.item.id] ?? 0,
    };
  });
  if (!result.ok) {
    return Response.json(result, { status: result.error === "bad_item" ? 400 : 409 });
  }
  return Response.json(result);
}
