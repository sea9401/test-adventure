export const BULLETIN_POST_POINTS = 3;
export const BULLETIN_COMMENT_POINTS = 1;
export const BULLETIN_RECEIVED_LIKE_POINTS = 4;
export const BULLETIN_DAILY_POST_CREDIT_LIMIT = 2;
export const BULLETIN_DAILY_COMMENT_CREDIT_LIMIT = 5;

export const BULLETIN_ACTIVITY_LEVELS = [
  { level: 1, minPoints: 0, title: "새싹" },
  { level: 2, minPoints: 10, title: "첫걸음" },
  { level: 3, minPoints: 25, title: "이야기꾼" },
  { level: 4, minPoints: 50, title: "이웃" },
  { level: 5, minPoints: 85, title: "단골" },
  { level: 6, minPoints: 130, title: "소식통" },
  { level: 7, minPoints: 190, title: "조언자" },
  { level: 8, minPoints: 265, title: "명필" },
  { level: 9, minPoints: 355, title: "현자" },
  { level: 10, minPoints: 460, title: "광장지기" },
] as const;

export type BulletinActivityBreakdown = {
  creditedPosts: number;
  creditedComments: number;
  receivedLikes: number;
};

export type BulletinActivitySummary = BulletinActivityBreakdown & {
  level: number;
  title: string;
  points: number;
  levelStartPoints: number;
  nextLevelPoints: number | null;
  progressPct: number;
};

export function bulletinDailyCredits(
  actionCount: number,
  dailyLimit: number,
): number {
  return Math.min(nonNegativeInteger(actionCount), nonNegativeInteger(dailyLimit));
}

export function isCreditedBulletinReceivedLike(input: {
  authorUserId: string;
  likerUserId: string;
  category: string;
}): boolean {
  return (
    input.category !== "notice" && input.authorUserId !== input.likerUserId
  );
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function bulletinActivityPoints(
  breakdown: BulletinActivityBreakdown,
): number {
  return (
    nonNegativeInteger(breakdown.creditedPosts) * BULLETIN_POST_POINTS +
    nonNegativeInteger(breakdown.creditedComments) * BULLETIN_COMMENT_POINTS +
    nonNegativeInteger(breakdown.receivedLikes) * BULLETIN_RECEIVED_LIKE_POINTS
  );
}

export function deriveBulletinActivity(
  breakdown: BulletinActivityBreakdown,
): BulletinActivitySummary {
  const normalized = {
    creditedPosts: nonNegativeInteger(breakdown.creditedPosts),
    creditedComments: nonNegativeInteger(breakdown.creditedComments),
    receivedLikes: nonNegativeInteger(breakdown.receivedLikes),
  };
  const points = bulletinActivityPoints(normalized);
  const current = [...BULLETIN_ACTIVITY_LEVELS]
    .reverse()
    .find((entry) => points >= entry.minPoints) ?? BULLETIN_ACTIVITY_LEVELS[0];
  const next = BULLETIN_ACTIVITY_LEVELS.find(
    (entry) => entry.level === current.level + 1,
  );
  const progressPct = next
    ? Math.min(
        100,
        Math.max(
          0,
          Math.floor(
            ((points - current.minPoints) /
              (next.minPoints - current.minPoints)) *
              100,
          ),
        ),
      )
    : 100;

  return {
    ...normalized,
    level: current.level,
    title: current.title,
    points,
    levelStartPoints: current.minPoints,
    nextLevelPoints: next?.minPoints ?? null,
    progressPct,
  };
}
