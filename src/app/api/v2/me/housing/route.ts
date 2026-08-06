import { db } from "@/db";
import {
  HOUSING_SAVE_KEY,
  parseHousingState,
  validateHousingState,
} from "@/adventure/data/v2/housing";
import { FISHING_CODEX_KEY } from "@/adventure/v2/fishingCodex";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { ensureUser } from "@/lib/server/ensureUser";
import { housingContextFromSaves } from "@/lib/server/housing";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { LIFE_WORKSHOP_SAVE_KEY } from "@/adventure/v2/lifeWorkshop";

async function housingSourceSaves(userId: string) {
  const [housingRaw, equipmentRaw, adventureLogRaw, fishingCodexRaw, profileRaw, lifeWorkshopRaw] =
    await Promise.all([
      readSave(db, userId, HOUSING_SAVE_KEY, null),
      readSave(db, userId, "equipment.v2", {}),
      readSave(db, userId, "adventure-log.v2", {}),
      readSave(db, userId, FISHING_CODEX_KEY, {}),
      readSave(db, userId, PROFILE_STORAGE_KEY, {}),
      readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
    ]);
  return {
    housingRaw,
    equipmentRaw,
    adventureLogRaw,
    fishingCodexRaw,
    profileRaw,
    lifeWorkshopRaw,
  };
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:housing:read",
    userLimit: 60,
    ipLimit: 400,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const source = await housingSourceSaves(userId);
  const room = parseHousingState(source.housingRaw);
  const { displayOptions, entitlements } = housingContextFromSaves(source);
  const profile = source.profileRaw as { name?: unknown };
  const ownerName =
    typeof profile?.name === "string" && profile.name.trim()
      ? profile.name.trim()
      : "모험가";

  return Response.json({ ok: true, ownerName, room, displayOptions, ownedCounts: entitlements.ownedCounts });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:housing:write",
    userLimit: 20,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const source = await housingSourceSaves(userId);
  const { entitlements, displayOptions } = housingContextFromSaves(source);
  const validated = validateHousingState(body, entitlements);
  if (!validated.ok) {
    return Response.json(
      { ok: false, error: validated.error },
      { status: 400 },
    );
  }

  const room = await db.transaction(async (tx) => {
    await lockSaveForUpdate(tx, userId, HOUSING_SAVE_KEY, null);
    await upsertSave(tx, userId, HOUSING_SAVE_KEY, validated.state);
    return validated.state;
  });

  return Response.json({ ok: true, room, displayOptions, ownedCounts: entitlements.ownedCounts });
}
