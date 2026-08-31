import { V2_UNEXPLORED } from "@/adventure/data/v2/coreLoopConfig";
import { parseUnexploredBossId } from "@/adventure/data/v2/unexploredBosses";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  applyUnexploredBossCraft,
  type UnexploredBossCraftCharacter,
} from "@/lib/server/unexploredBossCraft";

function unavailable() {
  return Response.json({ ok: false, error: "not_found" }, { status: 404 });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!V2_UNEXPLORED) return unavailable();

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const bossId = parseUnexploredBossId(body?.bossId);
  const requestId =
    typeof body?.requestId === "string" ? body.requestId.trim() : "";
  if (!bossId || !requestId || requestId.length > 128) {
    return Response.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<UnexploredBossCraftCharacter>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const crafted = applyUnexploredBossCraft(
      character,
      bossId,
      requestId,
      Date.now(),
    );
    if (!crafted.ok) {
      return {
        status: 409,
        body: { ok: false as const, error: crafted.error },
      };
    }
    if (!crafted.idempotent) {
      await upsertSave(tx, userId, "character.v2", crafted.character);
    }
    return {
      status: 200,
      body: {
        ok: true as const,
        idempotent: crafted.idempotent,
        bossId,
        receipt: crafted.receipt,
        gold: crafted.character.gold,
        bankedGold: crafted.character.bankedGold,
        materials: crafted.character.materials,
        traces: crafted.character.unexplored.traces,
        achievementIds: crafted.character.unexplored.achievementIds,
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}
