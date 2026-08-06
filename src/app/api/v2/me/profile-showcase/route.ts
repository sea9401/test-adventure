import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { TITLES } from "@/adventure/data/titles";
import {
  V2_QUESTS,
  isTutorialLine,
  questById,
} from "@/adventure/data/v2/v2Quests";
import { parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import {
  PROFILE_SHOWCASE_SAVE_KEY,
  parseProfileBadgeStandVisible,
  parseProfileShowcaseSelection,
  parseProfileShowcaseSlots,
  ownsProfileBadgeStand,
  type ProfileShowcaseSelection,
  type ProfileShowcaseSlots,
} from "@/adventure/profile/profileShowcase";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  accountOwnedTitleIds,
  titleIsAvailableToAccount,
} from "@/lib/server/titleAccess";
import { isAdminEmail } from "@/lib/server/adminEmailAccess";
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

function usableTitleSlots(
  slots: ProfileShowcaseSlots,
  ownedTitleIds: ReadonlySet<string>,
): ProfileShowcaseSlots {
  return slots.map((slot) =>
    slot?.kind === "title" &&
    (!TITLES[slot.titleId] || !ownedTitleIds.has(slot.titleId))
      ? null
      : slot,
  ) as ProfileShowcaseSlots;
}

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

  const [showcaseRaw, adventureLogRaw, claimedRaw, characterRaw, userRow] = await Promise.all([
    readSave(db, userId, PROFILE_SHOWCASE_SAVE_KEY, {}),
    readSave(db, userId, "adventure-log.v2", {}),
    readSave(db, userId, GUIDE_QUESTS_KEY, {}),
    readSave(db, userId, "character.v2", {}),
    db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  const ownedTitleIds = new Set(
    accountOwnedTitleIds(adventureLogRaw, isAdminEmail(userRow?.email)),
  );
  const claimed = parseClaimed(claimedRaw);
  const slots = usableTitleSlots(
    parseProfileShowcaseSlots(showcaseRaw),
    ownedTitleIds,
  );

  return Response.json({
    ok: true,
    standOwned: ownsProfileBadgeStand(characterRaw),
    visible: parseProfileBadgeStandVisible(showcaseRaw),
    selection: slots[0],
    slots,
    titleOptions: Object.values(TITLES)
      .filter((title) => ownedTitleIds.has(title.id))
      .map(({ id, name, description }) => ({ id, name, description })),
    achievementOptions: V2_QUESTS.filter(
      (quest) =>
        claimed.has(quest.id) &&
        !isTutorialLine(quest.line) &&
        quest.badgeTier != null,
    ).map(({ id, title, desc, points, badgeTier }) => ({
      id,
      title,
      desc,
      points: points ?? 0,
      badgeTier,
    })),
    trophyOptions: V2_QUESTS.filter(
      (quest) => !isTutorialLine(quest.line) && quest.badgeTier != null,
    ).map(({ id, title, desc, points, badgeTier }) => ({
      id,
      title,
      desc,
      points: points ?? 0,
      badgeTier,
      unlocked: claimed.has(id),
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

  let body: { selection?: unknown; slots?: unknown; visible?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const updatesSlots = body.slots !== undefined || body.selection !== undefined;
  const updatesVisibility = body.visible !== undefined;
  if (!updatesSlots && !updatesVisibility) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (updatesVisibility && typeof body.visible !== "boolean") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  let requestedSlots: ProfileShowcaseSlots | null = null;
  if (updatesSlots) {
    if (body.slots !== undefined && !Array.isArray(body.slots)) {
      return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const requested = Array.isArray(body.slots)
      ? body.slots
      : body.selection === null
        ? []
        : [body.selection];
    if (requested.length > 3) {
      return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    requestedSlots = [0, 1, 2].map((index) => {
      const raw = requested[index] ?? null;
      return raw === null ? null : parseProfileShowcaseSelection(raw);
    }) as ProfileShowcaseSlots;
    if (
      requested.some(
        (raw, index) =>
          raw !== null && index < 3 && requestedSlots?.[index] === null,
      )
    ) {
      return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const selectionKeys = requestedSlots
      .filter((slot): slot is ProfileShowcaseSelection => slot !== null)
      .map((slot) => JSON.stringify(slot));
    if (new Set(selectionKeys).size !== selectionKeys.length) {
      return Response.json(
        { ok: false, error: "duplicate_selection" },
        { status: 400 },
      );
    }
  }

  const [characterRaw, equipmentRaw, adventureLogRaw, claimedRaw, userRow] =
    await Promise.all([
      readSave(db, userId, "character.v2", {}),
      readSave(db, userId, "equipment.v2", {}),
      readSave(db, userId, "adventure-log.v2", {}),
      readSave(db, userId, GUIDE_QUESTS_KEY, {}),
      db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then((rows) => rows[0]),
    ]);
  if (!ownsProfileBadgeStand(characterRaw)) {
    return Response.json({ ok: false, error: "stand_required" }, { status: 403 });
  }

  const { owned } = parseEquipmentSave(equipmentRaw);
  const isAdminAccount = isAdminEmail(userRow?.email);
  const ownedTitleIds = new Set(
    accountOwnedTitleIds(adventureLogRaw, isAdminAccount),
  );
  const claimed = parseClaimed(claimedRaw);

  for (const slot of requestedSlots ?? []) {
    if (slot?.kind === "equipment") {
      if (!owned.some((item) => item.iid === slot.iid)) {
        return Response.json({ ok: false, error: "not_owned" }, { status: 400 });
      }
    } else if (slot?.kind === "title") {
      if (
        !TITLES[slot.titleId] ||
        !titleIsAvailableToAccount(slot.titleId, isAdminAccount)
      ) {
        return Response.json(
          { ok: false, error: "unknown_title" },
          { status: 400 },
        );
      }
      if (!ownedTitleIds.has(slot.titleId)) {
        return Response.json({ ok: false, error: "not_owned" }, { status: 400 });
      }
    } else if (slot?.kind === "achievement") {
      const achievement = questById(slot.achievementId);
      if (
        !achievement ||
        isTutorialLine(achievement.line) ||
        achievement.badgeTier == null
      ) {
        return Response.json(
          { ok: false, error: "unknown_achievement" },
          { status: 400 },
        );
      }
      if (!claimed.has(slot.achievementId)) {
        return Response.json({ ok: false, error: "not_owned" }, { status: 400 });
      }
    }
  }

  const saved = await db.transaction(async (tx) => {
    const currentRaw = await lockSaveForUpdate(
      tx,
      userId,
      PROFILE_SHOWCASE_SAVE_KEY,
      {},
    );
    const slots = usableTitleSlots(
      requestedSlots ?? parseProfileShowcaseSlots(currentRaw),
      ownedTitleIds,
    );
    const visible =
      typeof body.visible === "boolean"
        ? body.visible
        : parseProfileBadgeStandVisible(currentRaw);
    await upsertSave(tx, userId, PROFILE_SHOWCASE_SAVE_KEY, {
      slots,
      visible,
    });
    return { slots, visible };
  });

  return Response.json({
    ok: true,
    selection: saved.slots[0],
    slots: saved.slots,
    visible: saved.visible,
  });
}
