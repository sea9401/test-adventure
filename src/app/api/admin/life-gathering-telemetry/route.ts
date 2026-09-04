import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";
import {
  LIFE_GATHERING_ATTEMPT_EVENT,
  LIFE_GATHERING_EVENT_TYPES,
  LIFE_GATHERING_REWARD_EVENT,
} from "@/lib/server/lifeGatheringTelemetry";
import {
  aggregateLifeGatheringSummary,
  type LifeActivitySummaryRow,
  type LifeDailySummaryRow,
  type LifeMaterialSummaryRow,
  type LifeSourceSummaryRow,
  type LifeUserSummaryRow,
} from "./summaryAggregate";
import {
  ACTIVITY_GUARD_EVENT_REASONS,
  aggregateActivityGuardTelemetry,
} from "./verificationAggregate";

const ALLOWED_PERIOD_HOURS = new Set([24, 24 * 7, 24 * 30]);
const MAX_GUARD_ROWS = 20_000;

function resultRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const requestedHours = Number(new URL(req.url).searchParams.get("hours"));
  const hours = ALLOWED_PERIOD_HOURS.has(requestedHours)
    ? requestedHours
    : 24 * 7;
  const until = new Date();
  const since = new Date(until.getTime() - hours * 60 * 60_000);
  const attemptTypes = Object.values(LIFE_GATHERING_ATTEMPT_EVENT);
  const rewardTypes = Object.values(LIFE_GATHERING_REWARD_EVENT);
  const allTypesSql = sql.join(
    LIFE_GATHERING_EVENT_TYPES.map((eventType) => sql`${eventType}`),
    sql`, `,
  );
  const attemptTypesSql = sql.join(
    attemptTypes.map((eventType) => sql`${eventType}`),
    sql`, `,
  );
  const rewardTypesSql = sql.join(
    rewardTypes.map((eventType) => sql`${eventType}`),
    sql`, `,
  );

  const summaryQueries = [
    sql`
      SELECT
        event_type AS "eventType",
        count(*)::bigint AS attempts,
        count(*) FILTER (WHERE coalesce(quantity, 0) > 0)::bigint AS successes,
        count(DISTINCT user_id)::bigint AS "uniqueUsers"
      FROM economy_events
      WHERE event_type IN (${attemptTypesSql})
        AND created_at >= ${since}
        AND created_at <= ${until}
      GROUP BY event_type
    `,
    sql`
      SELECT
        event_type AS "eventType",
        coalesce(item_id, nullif(detail ->> 'sourceId', ''), 'unknown') AS "sourceId",
        max(
          coalesce(
            nullif(detail ->> 'sourceName', ''),
            item_id,
            nullif(detail ->> 'sourceId', ''),
            'unknown'
          )
        ) AS "sourceName",
        count(*)::bigint AS attempts,
        count(*) FILTER (WHERE coalesce(quantity, 0) > 0)::bigint AS successes
      FROM economy_events
      WHERE event_type IN (${attemptTypesSql})
        AND created_at >= ${since}
        AND created_at <= ${until}
      GROUP BY
        event_type,
        coalesce(item_id, nullif(detail ->> 'sourceId', ''), 'unknown')
    `,
    sql`
      SELECT
        event_type AS "eventType",
        item_id AS "materialId",
        max(nullif(detail ->> 'materialName', '')) AS "materialName",
        sum(greatest(coalesce(quantity, 0), 0))::bigint AS quantity,
        bool_and(coalesce(detail ->> 'primary', 'false') = 'true') AS primary
      FROM economy_events
      WHERE event_type IN (${rewardTypesSql})
        AND item_id IS NOT NULL
        AND coalesce(quantity, 0) > 0
        AND created_at >= ${since}
        AND created_at <= ${until}
      GROUP BY event_type, item_id
    `,
    sql`
      SELECT
        event_type AS "eventType",
        to_char(
          (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul',
          'YYYY-MM-DD'
        ) AS day,
        count(*) FILTER (WHERE event_type IN (${attemptTypesSql}))::bigint AS attempts,
        count(*) FILTER (
          WHERE event_type IN (${attemptTypesSql}) AND coalesce(quantity, 0) > 0
        )::bigint AS successes,
        coalesce(sum(greatest(coalesce(quantity, 0), 0)) FILTER (
          WHERE event_type IN (${rewardTypesSql})
            AND coalesce(detail ->> 'primary', 'false') = 'true'
        ), 0)::bigint AS "primaryQuantity",
        coalesce(sum(greatest(coalesce(quantity, 0), 0)) FILTER (
          WHERE event_type IN (${rewardTypesSql})
            AND coalesce(detail ->> 'primary', 'false') <> 'true'
        ), 0)::bigint AS "bonusQuantity"
      FROM economy_events
      WHERE event_type IN (${allTypesSql})
        AND created_at >= ${since}
        AND created_at <= ${until}
      GROUP BY event_type, to_char(
        (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul',
        'YYYY-MM-DD'
      )
    `,
    sql`
      WITH scoped AS MATERIALIZED (
        SELECT
          id,
          split_part(event_type, '.', 2) AS activity,
          user_id,
          event_type,
          quantity,
          created_at
        FROM economy_events
        WHERE event_type IN (${allTypesSql})
          AND user_id IS NOT NULL
          AND created_at >= ${since}
          AND created_at <= ${until}
      ), attempt_events AS (
        SELECT
          activity,
          user_id,
          quantity,
          created_at,
          extract(epoch FROM (
            created_at - lag(created_at) OVER (
              PARTITION BY activity, user_id
              ORDER BY created_at, id
            )
          )) AS interval_seconds
        FROM scoped
        WHERE event_type IN (${attemptTypesSql})
      ), attempt_users AS (
        SELECT
          activity,
          user_id,
          count(*)::bigint AS attempts,
          count(*) FILTER (WHERE coalesce(quantity, 0) > 0)::bigint AS successes,
          round(extract(epoch FROM (max(created_at) - min(created_at))) / 60)::bigint
            AS active_minutes,
          round(coalesce(avg(interval_seconds), 0)::numeric, 1) AS avg_interval_sec,
          round(coalesce(stddev_pop(interval_seconds), 0)::numeric, 1)
            AS interval_stddev_sec
        FROM attempt_events
        GROUP BY activity, user_id
      ), reward_users AS (
        SELECT
          activity,
          user_id,
          sum(greatest(coalesce(quantity, 0), 0))::bigint AS quantity
        FROM scoped
        WHERE event_type IN (${rewardTypesSql})
        GROUP BY activity, user_id
      ), user_totals AS (
        SELECT
          coalesce(attempt.activity, reward.activity) AS activity,
          coalesce(attempt.user_id, reward.user_id) AS user_id,
          coalesce(attempt.attempts, 0)::bigint AS attempts,
          coalesce(attempt.successes, 0)::bigint AS successes,
          coalesce(reward.quantity, 0)::bigint AS quantity,
          coalesce(attempt.active_minutes, 0)::bigint AS active_minutes,
          coalesce(attempt.avg_interval_sec, 0)::numeric AS avg_interval_sec,
          coalesce(attempt.interval_stddev_sec, 0)::numeric AS interval_stddev_sec
        FROM attempt_users AS attempt
        FULL OUTER JOIN reward_users AS reward
          ON reward.activity = attempt.activity
         AND reward.user_id = attempt.user_id
      ), ranked AS (
        SELECT
          totals.*,
          row_number() OVER (
            PARTITION BY totals.activity
            ORDER BY totals.quantity DESC, totals.successes DESC, totals.attempts DESC,
                     totals.user_id
          ) AS row_no
        FROM user_totals AS totals
      )
      SELECT
        ranked.activity,
        ranked.user_id AS "userId",
        users.game_name AS "gameName",
        ranked.attempts,
        ranked.successes,
        ranked.quantity,
        ranked.active_minutes AS "activeMinutes",
        ranked.avg_interval_sec AS "avgIntervalSec",
        ranked.interval_stddev_sec AS "intervalStddevSec"
      FROM ranked
      LEFT JOIN users ON users.id = ranked.user_id
      WHERE ranked.row_no <= 10
      ORDER BY ranked.activity, ranked.row_no
    `,
  ] as const;
  const summaryResultsPromise = db.transaction(
    async (transaction) => {
      const results: unknown[] = [];
      for (const query of summaryQueries) {
        results.push(await transaction.execute(query));
      }
      return results;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const guardRowsPromise = db
    .select({
      userId: abuseEvents.userId,
      gameName: users.gameName,
      action: abuseEvents.action,
      reason: abuseEvents.reason,
      detail: abuseEvents.detail,
      createdAt: abuseEvents.createdAt,
    })
    .from(abuseEvents)
    .leftJoin(users, eq(users.id, abuseEvents.userId))
    .where(
      and(
        inArray(abuseEvents.reason, [...ACTIVITY_GUARD_EVENT_REASONS]),
        gte(abuseEvents.createdAt, since),
      ),
    )
    .orderBy(desc(abuseEvents.id))
    .limit(MAX_GUARD_ROWS);
  const [summaryResults, guardRows] = await Promise.all([
    summaryResultsPromise,
    guardRowsPromise,
  ]);
  const [
    activityResult,
    sourceResult,
    materialResult,
    dailyResult,
    userResult,
  ] = summaryResults;

  return Response.json({
    ok: true,
    hours,
    since: since.toISOString(),
    until: until.toISOString(),
    aggregation: "full-period",
    guardTruncated: guardRows.length >= MAX_GUARD_ROWS,
    ...aggregateLifeGatheringSummary({
      activityRows: resultRows<LifeActivitySummaryRow>(activityResult),
      sourceRows: resultRows<LifeSourceSummaryRow>(sourceResult),
      materialRows: resultRows<LifeMaterialSummaryRow>(materialResult),
      dailyRows: resultRows<LifeDailySummaryRow>(dailyResult),
      userRows: resultRows<LifeUserSummaryRow>(userResult),
    }),
    guard: aggregateActivityGuardTelemetry(guardRows),
  });
}
