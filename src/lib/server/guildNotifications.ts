import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds } from "@/db/schema";
import { isAdminRole } from "@/lib/server/guildAdmin";
import { resolveUserDisplayName } from "@/lib/server/serverFeed";
import {
  insertNotification,
  insertNotificationMany,
} from "@/lib/server/v2Notifications";

async function guildAdminRecipients(guildId: number): Promise<string[]> {
  const [guild] = await db
    .select({ masterId: guilds.masterId })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);
  if (!guild) return [];

  const members = await db
    .select({ userId: guildMembers.userId, role: guildMembers.role })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));

  return [
    ...new Set([
      guild.masterId,
      ...members
        .filter((m) => isAdminRole(m.role))
        .map((m) => m.userId),
    ]),
  ];
}

export async function notifyGuildJoinRequested(params: {
  guildId: number;
  guildName: string;
  requestId: number;
  applicantUserId: string;
}): Promise<void> {
  try {
    const recipients = await guildAdminRecipients(params.guildId);
    if (recipients.length === 0) return;
    const applicantName = await resolveUserDisplayName(params.applicantUserId);
    await insertNotificationMany(recipients, "guild_join_requested", {
      guildId: params.guildId,
      guildName: params.guildName,
      requestId: params.requestId,
      applicantUserId: params.applicantUserId,
      applicantName,
    });
  } catch (err) {
    console.warn("[guildNotifications] join request notify failed", err);
  }
}

export async function notifyGuildJoinAccepted(params: {
  userId: string;
  guildId: number;
  guildName: string;
}): Promise<void> {
  try {
    await insertNotification(params.userId, "guild_join_accepted", {
      guildId: params.guildId,
      guildName: params.guildName,
    });
  } catch (err) {
    console.warn("[guildNotifications] join accept notify failed", err);
  }
}

export async function notifyGuildJoinDeclined(params: {
  userId: string;
  guildId: number;
  guildName: string;
}): Promise<void> {
  try {
    await insertNotification(params.userId, "guild_join_declined", {
      guildId: params.guildId,
      guildName: params.guildName,
    });
  } catch (err) {
    console.warn("[guildNotifications] join decline notify failed", err);
  }
}
