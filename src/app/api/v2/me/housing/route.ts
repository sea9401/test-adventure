import { db } from "@/db";
import {
  HOUSING_SAVE_KEY,
  parseHousingState,
  restoreHousingMasteryTrophies,
  stripHousingMasteryTrophies,
  validateHousingState,
} from "@/adventure/data/v2/housing";
import { FISHING_CODEX_KEY } from "@/adventure/v2/fishingCodex";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  housingContextFromSaves,
  housingMasteryTrophyContext,
} from "@/lib/server/housing";
import { readCodexMasteryFeatureSettings } from "@/lib/server/opsSettings";
import { readCodexMasteryTrophyHistory } from "@/lib/server/codexMasteryTrophyRepository";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { LIFE_WORKSHOP_SAVE_KEY } from "@/adventure/v2/lifeWorkshop";
import { isLifeHousingEnabled } from "@/adventure/v2/lifeCrafting";

function housingUnavailableResponse() {
  return Response.json({ ok: false, error: "not_found" }, { status: 404 });
}

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
  if (!isLifeHousingEnabled()) return housingUnavailableResponse();
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

  const [source, settings] = await Promise.all([
    housingSourceSaves(userId),
    readCodexMasteryFeatureSettings(db),
  ]);
  const room = parseHousingState(source.housingRaw);
  const baseContext = housingContextFromSaves(source);
  const trophyContext = settings.trophiesEnabled
    ? housingMasteryTrophyContext(
        await readCodexMasteryTrophyHistory(db, userId),
      )
    : null;
  const displayOptions = [
    ...baseContext.displayOptions,
    ...(trophyContext?.displayOptions ?? []),
  ];
  const profile = source.profileRaw as { name?: unknown };
  const ownerName =
    typeof profile?.name === "string" && profile.name.trim()
      ? profile.name.trim()
      : "모험가";

  return Response.json({
    ok: true,
    ownerName,
    room: settings.trophiesEnabled
      ? room
      : stripHousingMasteryTrophies(room),
    displayOptions,
    ownedCounts: baseContext.entitlements.ownedCounts,
  });
}

export async function POST(req: Request) {
  if (!isLifeHousingEnabled()) return housingUnavailableResponse();
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

  const [source, settings] = await Promise.all([
    housingSourceSaves(userId),
    readCodexMasteryFeatureSettings(db),
  ]);
  const baseContext = housingContextFromSaves(source);
  const trophyContext = settings.trophiesEnabled
    ? housingMasteryTrophyContext(
        await readCodexMasteryTrophyHistory(db, userId),
      )
    : null;
  const initialEntitlements = {
    ...baseContext.entitlements,
    ...trophyContext?.entitlements,
  };
  const initiallyValidated = validateHousingState(body, initialEntitlements);
  if (!initiallyValidated.ok) {
    return Response.json(
      { ok: false, error: initiallyValidated.error },
      { status: 400 },
    );
  }
  const storedRoom = parseHousingState(source.housingRaw);
  const candidate = settings.trophiesEnabled
    ? initiallyValidated.state
    : restoreHousingMasteryTrophies(storedRoom, initiallyValidated.state);
  const retainedTrophyIds = new Set(
    storedRoom.layout.flatMap((placement) =>
      placement.masteryTrophy ? [placement.masteryTrophy.trophyId] : []
    ),
  );
  const validated = settings.trophiesEnabled
    ? initiallyValidated
    : validateHousingState(candidate, {
        ...baseContext.entitlements,
        masteryTrophyIds: retainedTrophyIds,
      });
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

  return Response.json({
    ok: true,
    room: settings.trophiesEnabled
      ? room
      : stripHousingMasteryTrophies(room),
    displayOptions: [
      ...baseContext.displayOptions,
      ...(trophyContext?.displayOptions ?? []),
    ],
    ownedCounts: baseContext.entitlements.ownedCounts,
  });
}
