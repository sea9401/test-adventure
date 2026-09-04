import { V2_UNEXPLORED } from "@/adventure/data/v2/coreLoopConfig";
import {
  UNEXPLORED_BOSSES,
  parseUnexploredBossId,
} from "@/adventure/data/v2/unexploredBosses";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { createCoopBossSession } from "@/lib/server/v2Coop";

type CharacterSave = Record<string, unknown> & { materials?: unknown };

function unavailable() {
  return Response.json({ ok: false, error: "not_found" }, { status: 404 });
}

function materialsOf(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).flatMap(([id, value]) => {
      const count = Math.max(0, Math.floor(Number(value) || 0));
      return count > 0 ? [[id, count]] : [];
    }),
  );
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
  if (!bossId) {
    return Response.json({ ok: false, error: "bad_boss" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<CharacterSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const boss = UNEXPLORED_BOSSES[bossId];
    const materials = materialsOf(character.materials);
    const have = materials[boss.summonMaterialId] ?? 0;
    if (have < 1) {
      return {
        status: 409,
        body: { ok: false as const, error: "not_enough_summon_stones" as const },
      };
    }

    const profile = await readSave<{ name?: string } | null>(
      tx,
      userId,
      "character-profile.v2",
      null,
    );
    const created = await createCoopBossSession(tx, {
      kindId: bossId,
      userId,
      summonerName: profile?.name?.trim() || "모험가",
      now: new Date(),
      visibility: "summoner_only",
    });
    if (!created.ok) {
      return {
        status: 409,
        body: { ok: false as const, error: created.error, cap: created.cap },
      };
    }

    if (have === 1) delete materials[boss.summonMaterialId];
    else materials[boss.summonMaterialId] = have - 1;
    await upsertSave(tx, userId, "character.v2", {
      ...character,
      materials,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        bossId,
        sessionId: created.sessionId,
        expiresAt: created.expiresAt,
        summonStonesLeft: have - 1,
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}
