import { db } from "@/db";
import { TITLES } from "@/adventure/data/titles";
import {
  V2_QUESTS,
  isTutorialLine,
  questById,
} from "@/adventure/data/v2/v2Quests";
import { parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import {
  PROFILE_SHOWCASE_SAVE_KEY,
  parseProfileShowcase,
  parseProfileShowcaseSelection,
  type ProfileShowcaseSelection,
} from "@/adventure/profile/profileShowcase";
import { ensureUser } from "@/lib/server/ensureUser";
import { ownedTitleIdsOf } from "@/lib/server/grantTitle";
import {
  GUIDE_QUESTS_KEY,
  parseClaimed,
} from "@/lib/server/v2QuestContext";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:profile-showcase:read",
    userLimit: 60,
    ipLimit: 400,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const [showcaseRaw, adventureLogRaw, claimedRaw] = await Promise.all([
    readSave(db, userId, PROFILE_SHOWCASE_SAVE_KEY, {}),
    readSave(db, userId, "adventure-log.v2", {}),
    readSave(db, userId, GUIDE_QUESTS_KEY, {}),
  ]);
  const ownedTitleIds = new Set(ownedTitleIdsOf(adventureLogRaw));
  const claimed = parseClaimed(claimedRaw);

  return Response.json({
    ok: true,
    selection: parseProfileShowcase(showcaseRaw),
    titleOptions: Object.values(TITLES)
      .filter((title) => ownedTitleIds.has(title.id))
      .map(({ id, name, description }) => ({ id, name, description })),
    achievementOptions: V2_QUESTS.filter(
      (quest) => claimed.has(quest.id) && !isTutorialLine(quest.line),
    ).map(({ id, title, desc, points }) => ({
      id,
      title,
      desc,
      points: points ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:profile-showcase:write",
    userLimit: 20,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { selection?: unknown };
  try {
    body = (await req.json()) as { selection?: unknown };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const selection: ProfileShowcaseSelection | null =
    body.selection === null
      ? null
      : parseProfileShowcaseSelection(body.selection);
  if (body.selection !== null && selection == null) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (selection?.kind === "equipment") {
    const equipmentRaw = await readSave(db, userId, "equipment.v2", {});
    const { owned } = parseEquipmentSave(equipmentRaw);
    if (!owned.some((item) => item.iid === selection.iid)) {
      return Response.json({ ok: false, error: "not_owned" }, { status: 400 });
    }
  } else if (selection?.kind === "title") {
    if (!TITLES[selection.titleId]) {
      return Response.json(
        { ok: false, error: "unknown_title" },
        { status: 400 },
      );
    }
    const adventureLogRaw = await readSave(db, userId, "adventure-log.v2", {});
    if (!ownedTitleIdsOf(adventureLogRaw).includes(selection.titleId)) {
      return Response.json({ ok: false, error: "not_owned" }, { status: 400 });
    }
  } else if (selection?.kind === "achievement") {
    const achievement = questById(selection.achievementId);
    if (!achievement || isTutorialLine(achievement.line)) {
      return Response.json(
        { ok: false, error: "unknown_achievement" },
        { status: 400 },
      );
    }
    const claimedRaw = await readSave(db, userId, GUIDE_QUESTS_KEY, {});
    if (!parseClaimed(claimedRaw).has(selection.achievementId)) {
      return Response.json({ ok: false, error: "not_owned" }, { status: 400 });
    }
  }

  await db.transaction(async (tx) => {
    await lockSaveForUpdate(tx, userId, PROFILE_SHOWCASE_SAVE_KEY, {});
    await upsertSave(tx, userId, PROFILE_SHOWCASE_SAVE_KEY, { selection });
  });

  return Response.json({ ok: true, selection });
}
