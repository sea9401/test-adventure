import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bulletinPosts, guildMembers, guilds } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbLike = Tx | typeof db;

export type BulletinScope = "public" | "guild";

export async function getViewerGuild(
  tx: DbLike,
  userId: string,
): Promise<{ guildId: number; guildName: string } | null> {
  const [row] = await tx
    .select({ guildId: guildMembers.guildId, guildName: guilds.name })
    .from(guildMembers)
    .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  return row ?? null;
}

export function visibleBulletinWhere(
  viewerGuildId: number | null,
): SQL {
  const publicOnly = isNull(bulletinPosts.guildId);
  return viewerGuildId == null
    ? publicOnly
    : (or(publicOnly, eq(bulletinPosts.guildId, viewerGuildId)) ?? publicOnly);
}

export async function canAccessBulletinPost(
  tx: DbLike,
  postId: number,
  userId: string,
): Promise<boolean> {
  const viewerGuild = await getViewerGuild(tx, userId);
  const [post] = await tx
    .select({ id: bulletinPosts.id })
    .from(bulletinPosts)
    .where(
      and(
        eq(bulletinPosts.id, postId),
        viewerGuild == null
          ? isNull(bulletinPosts.guildId)
          : or(
              isNull(bulletinPosts.guildId),
              eq(bulletinPosts.guildId, viewerGuild.guildId),
            ),
      ),
    )
    .limit(1);
  return post != null;
}
