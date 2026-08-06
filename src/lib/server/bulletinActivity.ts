import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  BULLETIN_DAILY_COMMENT_CREDIT_LIMIT,
  BULLETIN_DAILY_POST_CREDIT_LIMIT,
  deriveBulletinActivity,
  type BulletinActivitySummary,
} from "@/lib/bulletinActivity";

type ActivityRow = {
  user_id: string;
  credited_posts: number | string;
  credited_comments: number | string;
  received_likes: number | string;
};

export const EMPTY_BULLETIN_ACTIVITY = deriveBulletinActivity({
  creditedPosts: 0,
  creditedComments: 0,
  receivedLikes: 0,
});

export function bulletinActivityFromMap(
  activityByUser: ReadonlyMap<string, BulletinActivitySummary>,
  userId: string,
): BulletinActivitySummary {
  return activityByUser.get(userId) ?? EMPTY_BULLETIN_ACTIVITY;
}

export async function readBulletinActivityMap(
  userIds: readonly string[],
): Promise<Map<string, BulletinActivitySummary>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const targetValues = sql.join(
    uniqueIds.map((userId) => sql`(${userId})`),
    sql`, `,
  );

  // 작성량 점수는 KST 날짜별로 제한한다. 댓글은 같은 글의 최초 댓글만 후보가 되며,
  // 좋아요는 작성자 본인의 좋아요를 제외한다. 원본 행을 집계하므로 삭제/취소도 즉시 반영된다.
  const result = await db.execute(sql`
    WITH target_users(user_id) AS (
      VALUES ${targetValues}
    ), ranked_posts AS (
      SELECT
        post.user_id,
        ROW_NUMBER() OVER (
          PARTITION BY post.user_id,
            ((post.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')::date
          ORDER BY post.created_at, post.id
        ) AS daily_rank
      FROM bulletin_posts AS post
      INNER JOIN target_users AS target ON target.user_id = post.user_id
      WHERE post.category <> 'notice'
    ), post_totals AS (
      SELECT user_id, COUNT(*)::int AS credited_posts
      FROM ranked_posts
      WHERE daily_rank <= ${BULLETIN_DAILY_POST_CREDIT_LIMIT}
      GROUP BY user_id
    ), first_comments AS (
      SELECT
        comment.user_id,
        comment.post_id,
        comment.created_at,
        comment.id,
        ROW_NUMBER() OVER (
          PARTITION BY comment.user_id, comment.post_id
          ORDER BY comment.created_at, comment.id
        ) AS post_rank
      FROM bulletin_comments AS comment
      INNER JOIN target_users AS target ON target.user_id = comment.user_id
    ), ranked_comments AS (
      SELECT
        user_id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id,
            ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')::date
          ORDER BY created_at, id
        ) AS daily_rank
      FROM first_comments
      WHERE post_rank = 1
    ), comment_totals AS (
      SELECT user_id, COUNT(*)::int AS credited_comments
      FROM ranked_comments
      WHERE daily_rank <= ${BULLETIN_DAILY_COMMENT_CREDIT_LIMIT}
      GROUP BY user_id
    ), like_totals AS (
      SELECT post.user_id, COUNT(*)::int AS received_likes
      FROM bulletin_likes AS liked
      INNER JOIN bulletin_posts AS post ON post.id = liked.post_id
      INNER JOIN target_users AS target ON target.user_id = post.user_id
      WHERE liked.user_id <> post.user_id
        AND post.category <> 'notice'
      GROUP BY post.user_id
    )
    SELECT
      target.user_id,
      COALESCE(posts.credited_posts, 0)::int AS credited_posts,
      COALESCE(comments.credited_comments, 0)::int AS credited_comments,
      COALESCE(likes.received_likes, 0)::int AS received_likes
    FROM target_users AS target
    LEFT JOIN post_totals AS posts ON posts.user_id = target.user_id
    LEFT JOIN comment_totals AS comments ON comments.user_id = target.user_id
    LEFT JOIN like_totals AS likes ON likes.user_id = target.user_id
  `);

  return new Map(
    (result.rows as unknown as ActivityRow[]).map((row) => [
      row.user_id,
      deriveBulletinActivity({
        creditedPosts: Number(row.credited_posts),
        creditedComments: Number(row.credited_comments),
        receivedLikes: Number(row.received_likes),
      }),
    ]),
  );
}
