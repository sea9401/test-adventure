import { db } from "@/db";
import {
  BLACKSMITH_SPECIALTY_LEVEL,
  isBlacksmithSpecialtyId,
  parseBlacksmithProgressionState,
} from "@/adventure/data/v2/blacksmithSpecialization";
import { artisanLevel, parseArtisanState } from "@/adventure/data/v2/artisan";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

const CRAFTING_SAVE_KEY = "crafting.v2";

export async function PATCH(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild-workshop:specialization",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    specialty?: unknown;
  } | null;
  if (!isBlacksmithSpecialtyId(body?.specialty)) {
    return Response.json(
      { ok: false, error: "invalid_specialty" },
      { status: 400 },
    );
  }
  const specialty = body.specialty;

  const result = await db.transaction(async (tx) => {
    const craftingRaw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      CRAFTING_SAVE_KEY,
      {},
    );
    const artisan = parseArtisanState(craftingRaw.artisan);
    const level = artisanLevel(artisan.blacksmith);
    if (level < BLACKSMITH_SPECIALTY_LEVEL) {
      return {
        status: 403,
        body: {
          ok: false as const,
          error: "specialty_level_locked" as const,
          requiredLevel: BLACKSMITH_SPECIALTY_LEVEL,
        },
      };
    }
    const current = parseBlacksmithProgressionState(
      craftingRaw.blacksmithProgression,
    );
    if (current.specialty === specialty) {
      return {
        status: 200,
        body: { ok: true as const, blacksmithProgression: current },
      };
    }
    if (current.specialty) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "specialty_locked" as const,
          specialty: current.specialty,
        },
      };
    }
    const next = { ...current, specialty };
    await upsertSave(tx, userId, CRAFTING_SAVE_KEY, {
      ...craftingRaw,
      blacksmithProgression: next,
    });
    return {
      status: 200,
      body: { ok: true as const, blacksmithProgression: next },
    };
  });

  return Response.json(result.body, { status: result.status });
}
