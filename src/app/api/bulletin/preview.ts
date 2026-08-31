import { and, desc, eq, isNull } from "drizzle-orm";
import type { db as appDb } from "@/db";
import { bulletinPosts } from "@/db/schema";

type NoticePreviewDb = Pick<typeof appDb, "select">;

export type NoticePreviewPost = {
  id: number;
  title: string | null;
  createdAt: number;
};

export async function readNoticePreview(executor: NoticePreviewDb): Promise<{
  posts: NoticePreviewPost[];
}> {
  const rows = await executor
    .select({
      id: bulletinPosts.id,
      title: bulletinPosts.title,
      createdAt: bulletinPosts.createdAt,
    })
    .from(bulletinPosts)
    .where(
      and(
        eq(bulletinPosts.category, "notice"),
        isNull(bulletinPosts.guildId),
      ),
    )
    .orderBy(desc(bulletinPosts.createdAt))
    .limit(3);

  return {
    posts: rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.getTime(),
    })),
  };
}
