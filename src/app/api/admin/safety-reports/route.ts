import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bulletinComments,
  bulletinPosts,
  chatRooms,
  guilds,
  messages,
  marketplaceInbox,
  ugcReports,
  users,
} from "@/db/schema";
import {
  currentAdminEmail,
  requireAdmin,
  requireAdminRole,
} from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { readProfileValue } from "@/adventure/profile/profileValue";
import { isProfileImageObjectKey } from "@/adventure/profile/avatars";
import { isGuildEmblemObjectKey } from "@/adventure/data/guild-emblems";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  deleteProfileImage,
  isProfileImageStorageConfigured,
} from "@/lib/server/profileImageStorage";
import {
  deleteGuildEmblemImage,
  isGuildEmblemStorageConfigured,
} from "@/lib/server/guildEmblemStorage";

const REPORT_STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];

function isReportStatus(value: unknown): value is ReportStatus {
  return (
    typeof value === "string" &&
    REPORT_STATUSES.includes(value as ReportStatus)
  );
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  const rows = await db
    .select()
    .from(ugcReports)
    .orderBy(desc(ugcReports.id))
    .limit(200);

  return Response.json({
    reports: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    })),
  });
}

export async function PATCH(req: Request) {
  const gate = await requireAdminRole("sanction");
  if (gate) return gate;

  let body: { id?: unknown; status?: unknown; adminNote?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (
    typeof body.id !== "number" ||
    !Number.isInteger(body.id) ||
    body.id <= 0 ||
    !isReportStatus(body.status)
  ) {
    return Response.json({ ok: false, error: "invalid input" }, { status: 400 });
  }
  const adminNote =
    typeof body.adminNote === "string" ? body.adminNote.trim().slice(0, 2_000) : "";
  const now = new Date();
  const terminal = body.status === "resolved" || body.status === "dismissed";
  const [updated] = await db
    .update(ugcReports)
    .set({
      status: body.status,
      adminNote: adminNote || null,
      reviewedAt: body.status === "open" ? null : now,
      resolvedAt: terminal ? now : null,
      updatedAt: now,
    })
    .where(eq(ugcReports.id, body.id))
    .returning({ id: ugcReports.id, targetUserId: ugcReports.targetUserId });
  if (!updated) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const adminEmail = await currentAdminEmail();
  await logAdminAction({
    adminEmail,
    action: `safety_report.${body.status}`,
    targetUserId: updated.targetUserId,
    detail: { reportId: updated.id, adminNote },
  });
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  const gate = await requireAdminRole("sanction");
  if (gate) return gate;

  let body: { id?: unknown; action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (
    body.action !== "remove_content" ||
    typeof body.id !== "number" ||
    !Number.isInteger(body.id) ||
    body.id <= 0
  ) {
    return Response.json({ ok: false, error: "invalid input" }, { status: 400 });
  }

  const [report] = await db
    .select({
      id: ugcReports.id,
      sourceType: ugcReports.sourceType,
      sourceId: ugcReports.sourceId,
      targetUserId: ugcReports.targetUserId,
    })
    .from(ugcReports)
    .where(eq(ugcReports.id, body.id))
    .limit(1);
  if (!report) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const storedAssetToDelete: {
    value: { kind: "profile" | "guild"; key: string } | null;
  } = { value: null };
  const removed = await db.transaction(async (tx) => {
    const numericSourceId = Number(report.sourceId);
    const validNumericSourceId =
      Number.isSafeInteger(numericSourceId) && numericSourceId > 0
        ? numericSourceId
        : null;
    if (report.sourceType === "bulletin_post") {
      if (validNumericSourceId == null) return false;
      return tx
        .delete(bulletinPosts)
        .where(eq(bulletinPosts.id, validNumericSourceId))
        .returning({ id: bulletinPosts.id })
        .then((rows) => rows.length > 0);
    }
    if (report.sourceType === "bulletin_comment") {
      if (validNumericSourceId == null) return false;
      return tx
        .delete(bulletinComments)
        .where(eq(bulletinComments.id, validNumericSourceId))
        .returning({ id: bulletinComments.id })
        .then((rows) => rows.length > 0);
    }
    if (report.sourceType === "chat_message") {
      if (validNumericSourceId == null) return false;
      return tx
        .delete(messages)
        .where(eq(messages.id, validNumericSourceId))
        .returning({ id: messages.id })
        .then((rows) => rows.length > 0);
    }
    if (report.sourceType === "inbox_message") {
      if (validNumericSourceId == null) return false;
      return tx
        .delete(marketplaceInbox)
        .where(eq(marketplaceInbox.id, validNumericSourceId))
        .returning({ id: marketplaceInbox.id })
        .then((rows) => rows.length > 0);
    }
    if (report.sourceType === "profile") {
      if (!report.targetUserId) return false;
      const rawProfile = await lockSaveForUpdate(
        tx,
        report.targetUserId,
        PROFILE_STORAGE_KEY,
        {},
      );
      const profile = readProfileValue(rawProfile);
      if (!profile) return false;
      const moderatedName = `모험가${report.targetUserId.replaceAll("-", "").slice(0, 8)}`;
      if (isProfileImageObjectKey(profile.gender)) {
        storedAssetToDelete.value = { kind: "profile", key: profile.gender };
      }
      await tx
        .update(users)
        .set({ gameName: moderatedName, updatedAt: new Date() })
        .where(eq(users.id, report.targetUserId));
      await upsertSave(tx, report.targetUserId, PROFILE_STORAGE_KEY, {
        ...profile,
        name: moderatedName,
        gender: "male1",
      });
      return true;
    }
    if (report.sourceType === "guild_profile") {
      if (validNumericSourceId == null) return false;
      const [guild] = await tx
        .select({ emblem: guilds.emblem, nationName: guilds.nationName })
        .from(guilds)
        .where(eq(guilds.id, validNumericSourceId))
        .for("update")
        .limit(1);
      if (!guild) return false;
      if (isGuildEmblemObjectKey(guild.emblem)) {
        storedAssetToDelete.value = { kind: "guild", key: guild.emblem };
      }
      await tx
        .update(guilds)
        .set({
          name: `제재길드${validNumericSourceId}`,
          description: null,
          emblem: null,
          lodgeSlogan: null,
          nationName: guild.nationName
            ? `제재국가${validNumericSourceId}`
            : null,
        })
        .where(eq(guilds.id, validNumericSourceId));
      return true;
    }
    if (report.sourceType === "chat_room") {
      if (validNumericSourceId == null) return false;
      const rows = await tx
        .update(chatRooms)
        .set({ name: "제재된 채팅방", updatedAt: new Date() })
        .where(eq(chatRooms.id, validNumericSourceId))
        .returning({ id: chatRooms.id });
      return rows.length > 0;
    }
    return false;
  });

  const assetToDelete = storedAssetToDelete.value;
  if (assetToDelete?.kind === "profile" && isProfileImageStorageConfigured()) {
    try {
      await deleteProfileImage(assetToDelete.key);
    } catch (error) {
      console.error("reported profile image delete failed", error);
    }
  }
  if (assetToDelete?.kind === "guild" && isGuildEmblemStorageConfigured()) {
    try {
      await deleteGuildEmblemImage(assetToDelete.key);
    } catch (error) {
      console.error("reported guild emblem delete failed", error);
    }
  }

  const now = new Date();
  await db
    .update(ugcReports)
    .set({ status: "resolved", reviewedAt: now, resolvedAt: now, updatedAt: now })
    .where(eq(ugcReports.id, report.id));

  const adminEmail = await currentAdminEmail();
  await logAdminAction({
    adminEmail,
    action: "safety_report.remove_content",
    targetUserId: report.targetUserId,
    detail: {
      reportId: report.id,
      sourceType: report.sourceType,
      sourceId: report.sourceId,
      existed: removed,
    },
  });
  return Response.json({ ok: true, removed });
}
