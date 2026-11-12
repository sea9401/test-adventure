import { and, eq, isNull, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bulletinPosts, guildMembers, guilds } from "@/db/schema";
import { isBulletinCategory } from "@/lib/bulletin-config";

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

// 목록 조회의 카테고리 조건.
//   카테고리 지정 — 그 카테고리만.
//   미지정(전체 탭·홈 최근 게시글) — 공지사항 제외. 공지는 공지사항 탭에서만 보인다.
//   길드 게시판 — 카테고리 탭이 없으므로 가리지 않는다.
export function bulletinListCategoryWhere(
  categoryParam: string | null,
  scopeParam: string | null,
): SQL | null {
  if (isBulletinCategory(categoryParam)) {
    return eq(bulletinPosts.category, categoryParam);
  }
  if (scopeParam === "guild") return null;
  return ne(bulletinPosts.category, "notice");
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
