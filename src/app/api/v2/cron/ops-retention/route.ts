import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  abuseEvents,
  adminAuditLog,
  battleReplays,
  coopBossAttackLog,
  dbStorageMetrics,
  economyEvents,
  marketplaceBuyOrdersV2,
  marketplaceInbox,
  marketplacePriceAlertsV2,
  opsSettings,
  pushDeliveries,
  pvpTournaments,
  serverFeed,
  ugcReports,
  userSanctions,
} from "@/db/schema";
import { requireCronAuth } from "@/lib/server/cronAuth";
import { sendOpsAlert } from "@/lib/server/opsAlert";
import {
  RETENTION_POLICY,
  drainRetentionBatches,
  retentionCutoff,
} from "@/lib/server/retentionPolicy";
import { processStorageDeletionQueue } from "@/lib/server/storageDeletionQueue";
import {
  stripArenaTournamentReplays,
  type ArenaTournamentBracket,
} from "@/lib/server/pvp/arenaTournament";

const BACKLOG_STREAK_KEY = "ops.retention-backlog-streak.v1";

type DeleteResult = { deleted: number; more: boolean };
type SizeRow = { table_name: string; total_bytes: string | number };

function resultRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

async function deleteSimpleRows<
  TTable extends AnyPgTable,
  TIdColumn extends AnyPgColumn,
>(
  table: TTable,
  idColumn: TIdColumn,
  where: SQL | undefined,
): Promise<DeleteResult> {
  const due = await db
    .select({ id: idColumn })
    .from(table as unknown as typeof abuseEvents)
    .where(where)
    .limit(RETENTION_POLICY.deleteBatchSize);
  if (due.length === 0) return { deleted: 0, more: false };
  const deleted = await db
    .delete(table)
    .where(inArray(idColumn, due.map((row) => row.id)))
    .returning({ id: idColumn });
  return {
    deleted: deleted.length,
    more: due.length >= RETENTION_POLICY.deleteBatchSize,
  };
}

async function trimCoopReplays(now: Date): Promise<DeleteResult> {
  const ageCutoff = retentionCutoff(RETENTION_POLICY.coopReplayDays, now);
  const aged = await db
    .select({ id: coopBossAttackLog.id })
    .from(coopBossAttackLog)
    .where(lt(coopBossAttackLog.createdAt, ageCutoff))
    .limit(RETENTION_POLICY.deleteBatchSize);
  const agedDeleted =
    aged.length > 0
      ? await db
          .delete(coopBossAttackLog)
          .where(inArray(coopBossAttackLog.id, aged.map((row) => row.id)))
          .returning({ id: coopBossAttackLog.id })
      : [];

  const overflow = await db.execute(sql`
    WITH ranked AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY session_id
               ORDER BY created_at DESC, id DESC
             ) AS row_no
      FROM coop_boss_attack_log
    ), due AS (
      SELECT id
      FROM ranked
      WHERE row_no > ${RETENTION_POLICY.coopReplaysPerSession}
      ORDER BY id
      LIMIT ${RETENTION_POLICY.deleteBatchSize}
    )
    DELETE FROM coop_boss_attack_log AS attack
    USING due
    WHERE attack.id = due.id
    RETURNING attack.id
  `);
  const overflowDeleted = resultRows<{ id: number }>(overflow).length;
  return {
    deleted: agedDeleted.length + overflowDeleted,
    more:
      aged.length >= RETENTION_POLICY.deleteBatchSize ||
      overflowDeleted >= RETENTION_POLICY.deleteBatchSize,
  };
}

async function trimArenaTournamentReplays(now: Date): Promise<DeleteResult> {
  const cutoff = retentionCutoff(RETENTION_POLICY.arenaTournamentDays, now);
  const due = await db
    .select({
      seasonId: pvpTournaments.seasonId,
      bracket: pvpTournaments.bracket,
    })
    .from(pvpTournaments)
    .where(
      and(
        lt(pvpTournaments.createdAt, cutoff),
        isNull(pvpTournaments.replaysTrimmedAt),
      ),
    )
    .limit(RETENTION_POLICY.deleteBatchSize);
  let removedReplays = 0;
  for (const row of due) {
    const trimmed = stripArenaTournamentReplays(
      row.bracket as ArenaTournamentBracket,
    );
    removedReplays += trimmed.removed;
    await db
      .update(pvpTournaments)
      .set({
        bracket: trimmed.bracket,
        snapshots: {},
        replaysTrimmedAt: now,
      })
      .where(eq(pvpTournaments.seasonId, row.seasonId));
  }
  return {
    deleted: removedReplays,
    more: due.length >= RETENTION_POLICY.deleteBatchSize,
  };
}

async function archiveAndTrimGuildActivities(): Promise<DeleteResult> {
  const result = await db.execute(sql`
    WITH ranked AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY guild_id
               ORDER BY created_at DESC, id DESC
             ) AS row_no
      FROM guild_activity_log
    ), due AS MATERIALIZED (
      SELECT activity.*
      FROM guild_activity_log AS activity
      INNER JOIN ranked USING (id)
      WHERE ranked.row_no > ${RETENTION_POLICY.guildActivitiesPerGuild}
      ORDER BY activity.id
      LIMIT ${RETENTION_POLICY.deleteBatchSize}
    ), source_rows AS MATERIALIZED (
      SELECT
        due.guild_id,
        due.actor_user_id AS user_id,
        due.type AS source,
        coalesce(contribution.category, '') AS category,
        due.created_at,
        1::int AS event_count,
        coalesce(contribution.points, 0)::numeric AS contribution_points,
        CASE
          WHEN due.type = 'gold_deposit'
           AND jsonb_typeof(due.meta->'amount') = 'number'
          THEN (due.meta->>'amount')::numeric
          ELSE 0::numeric
        END AS gold_amount
      FROM due
      LEFT JOIN guild_contribution_events AS contribution
        ON contribution.activity_log_id = due.id
      WHERE due.actor_user_id IS NOT NULL
    ), expanded AS MATERIALIZED (
      SELECT *, 'lifetime'::text AS period_key FROM source_rows
      UNION ALL
      SELECT *, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS period_key
      FROM source_rows
    ), rolled_up AS (
      INSERT INTO guild_activity_rollups (
        guild_id, user_id, source, category, period_key,
        event_count, contribution_points, gold_amount, updated_at
      )
      SELECT
        guild_id, user_id, source, category, period_key,
        sum(event_count)::int,
        sum(contribution_points),
        sum(gold_amount),
        now()
      FROM expanded
      GROUP BY guild_id, user_id, source, category, period_key
      ON CONFLICT (guild_id, user_id, source, category, period_key)
      DO UPDATE SET
        event_count = guild_activity_rollups.event_count + excluded.event_count,
        contribution_points = guild_activity_rollups.contribution_points + excluded.contribution_points,
        gold_amount = guild_activity_rollups.gold_amount + excluded.gold_amount,
        updated_at = now()
      RETURNING 1
    ), deleted AS (
      DELETE FROM guild_activity_log AS activity
      USING due
      WHERE activity.id = due.id
      RETURNING activity.id
    )
    SELECT count(*)::int AS deleted FROM deleted
  `);
  const deleted = Number(resultRows<{ deleted: number }>(result)[0]?.deleted ?? 0);
  return {
    deleted,
    more: deleted >= RETENTION_POLICY.deleteBatchSize,
  };
}

async function archiveAndTrimMarketplace(now: Date): Promise<DeleteResult> {
  const cutoff = retentionCutoff(RETENTION_POLICY.marketplaceClosedDays, now);
  const result = await db.execute(sql`
    WITH due AS MATERIALIZED (
      SELECT *
      FROM marketplace_listings_v2
      WHERE status <> 'active'
        AND closed_at IS NOT NULL
        AND closed_at < ${cutoff}
      ORDER BY id
      LIMIT ${RETENTION_POLICY.deleteBatchSize}
    ), daily_prices AS (
      INSERT INTO marketplace_price_daily (
        date_key, kind, item_id, item_name, trades, quantity,
        gross_gold, min_unit_price, max_unit_price, updated_at
      )
      SELECT
        to_char(closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
        kind,
        item_id,
        max(item_name),
        count(*)::int,
        sum(quantity)::int,
        sum(price)::numeric,
        min(round(price::numeric / greatest(quantity, 1)))::int,
        max(round(price::numeric / greatest(quantity, 1)))::int,
        now()
      FROM due
      WHERE status = 'sold'
      GROUP BY 1, kind, item_id
      ON CONFLICT (date_key, kind, item_id)
      DO UPDATE SET
        item_name = excluded.item_name,
        trades = marketplace_price_daily.trades + excluded.trades,
        quantity = marketplace_price_daily.quantity + excluded.quantity,
        gross_gold = marketplace_price_daily.gross_gold + excluded.gross_gold,
        min_unit_price = least(marketplace_price_daily.min_unit_price, excluded.min_unit_price),
        max_unit_price = greatest(marketplace_price_daily.max_unit_price, excluded.max_unit_price),
        updated_at = now()
      RETURNING 1
    ), participant_deltas AS MATERIALIZED (
      SELECT user_id, sum(purchases)::int AS purchases, sum(sales)::int AS sales
      FROM (
        SELECT seller_id AS user_id, 0 AS purchases, 1 AS sales
        FROM due WHERE status = 'sold'
        UNION ALL
        SELECT buyer_id AS user_id, 1 AS purchases, 0 AS sales
        FROM due WHERE status = 'sold' AND buyer_id IS NOT NULL
      ) AS participants
      GROUP BY user_id
    ), trade_totals AS (
      INSERT INTO marketplace_user_trade_totals (
        user_id, purchases, sales, updated_at
      )
      SELECT user_id, purchases, sales, now()
      FROM participant_deltas
      ON CONFLICT (user_id)
      DO UPDATE SET
        purchases = marketplace_user_trade_totals.purchases + excluded.purchases,
        sales = marketplace_user_trade_totals.sales + excluded.sales,
        updated_at = now()
      RETURNING 1
    ), deleted AS (
      DELETE FROM marketplace_listings_v2 AS listing
      USING due
      WHERE listing.id = due.id
      RETURNING listing.id
    )
    SELECT count(*)::int AS deleted FROM deleted
  `);
  const deleted = Number(resultRows<{ deleted: number }>(result)[0]?.deleted ?? 0);
  return {
    deleted,
    more: deleted >= RETENTION_POLICY.deleteBatchSize,
  };
}

async function recordStorageMetrics(now: Date) {
  const dateKey = now.toISOString().slice(0, 10);
  const tableResult = await db.execute(sql`
    SELECT relname AS table_name,
           pg_total_relation_size(relid)::bigint AS total_bytes
    FROM pg_catalog.pg_statio_user_tables
    ORDER BY total_bytes DESC
  `);
  const databaseResult = await db.execute(sql`
    SELECT pg_database_size(current_database())::bigint AS database_bytes
  `);
  const tableBytes = Object.fromEntries(
    resultRows<SizeRow>(tableResult).map((row) => [
      row.table_name,
      Number(row.total_bytes) || 0,
    ]),
  );
  const databaseBytes = Number(
    resultRows<{ database_bytes: string | number }>(databaseResult)[0]
      ?.database_bytes ?? 0,
  );
  const previous = (
    await db
      .select()
      .from(dbStorageMetrics)
      .where(lt(dbStorageMetrics.dateKey, dateKey))
      .orderBy(sql`${dbStorageMetrics.dateKey} DESC`)
      .limit(1)
  )[0];

  await db
    .insert(dbStorageMetrics)
    .values({ dateKey, databaseBytes: String(databaseBytes), tableBytes })
    .onConflictDoUpdate({
      target: dbStorageMetrics.dateKey,
      set: { databaseBytes: String(databaseBytes), tableBytes, createdAt: now },
    });
  await db
    .delete(dbStorageMetrics)
    .where(
      lt(
        dbStorageMetrics.dateKey,
        retentionCutoff(RETENTION_POLICY.storageMetricsDays, now)
          .toISOString()
          .slice(0, 10),
      ),
    );

  const previousTables = previous?.tableBytes ?? {};
  const fastGrowing = Object.entries(tableBytes)
    .flatMap(([tableName, bytes]) => {
      const before = previousTables[tableName] ?? 0;
      const growthBytes = bytes - before;
      const growthRatio = before >= 1024 * 1024 ? growthBytes / before : 0;
      return growthBytes >= RETENTION_POLICY.tableDailyGrowthBytes ||
        growthRatio >= RETENTION_POLICY.tableDailyGrowthRatio
        ? [{ tableName, bytes, growthBytes, growthRatio }]
        : [];
    })
    .sort((a, b) => b.growthBytes - a.growthBytes)
    .slice(0, 10);

  const configuredLimitGb = Number(process.env.DB_STORAGE_LIMIT_GB);
  const configuredLimitBytes =
    Number.isFinite(configuredLimitGb) && configuredLimitGb > 0
      ? configuredLimitGb * 1024 ** 3
      : null;
  const storageRatio = configuredLimitBytes
    ? databaseBytes / configuredLimitBytes
    : null;
  const previousStorageRatio =
    configuredLimitBytes && previous
      ? Number(previous.databaseBytes) / configuredLimitBytes
      : null;
  const warningCrossed =
    storageRatio != null &&
    storageRatio >= RETENTION_POLICY.storageWarningRatio &&
    (previousStorageRatio == null ||
      previousStorageRatio < RETENTION_POLICY.storageWarningRatio);
  const criticalCrossed =
    storageRatio != null &&
    storageRatio >= RETENTION_POLICY.storageCriticalRatio &&
    (previousStorageRatio == null ||
      previousStorageRatio < RETENTION_POLICY.storageCriticalRatio);
  if (
    fastGrowing.length > 0 ||
    warningCrossed ||
    criticalCrossed
  ) {
    await sendOpsAlert(
      criticalCrossed
        ? "[ops] DB 저장 공간 긴급 경고"
        : "[ops] DB 저장 공간 경고",
      {
        alertType: criticalCrossed
          ? "database.storage_critical"
          : "database.storage_warning",
        databaseBytes,
        storageLimitBytes: configuredLimitBytes,
        storageRatio,
        fastGrowing,
      },
    );
  }
  return {
    databaseBytes,
    tableBytes,
    fastGrowing,
    storageRatio,
    warningCrossed,
    criticalCrossed,
  };
}

async function updateBacklogStreak(hasBacklog: boolean) {
  const current = (
    await db
      .select({ value: opsSettings.value })
      .from(opsSettings)
      .where(eq(opsSettings.key, BACKLOG_STREAK_KEY))
      .limit(1)
  )[0];
  const previous = Number(
    (current?.value as { days?: unknown } | null)?.days ?? 0,
  );
  const days = hasBacklog ? Math.max(0, previous) + 1 : 0;
  await db
    .insert(opsSettings)
    .values({ key: BACKLOG_STREAK_KEY, value: { days }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: opsSettings.key,
      set: { value: { days }, updatedAt: new Date() },
    });
  return days;
}

// POST /api/v2/cron/ops-retention — 원본 로그 정리 + 압축 집계 + DB 용량 감시.
export async function POST(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const now = new Date();
  const [abuse, economy, adminAudit, serverFeedResult, pushDelivery, safetyReports, tournament] =
    await Promise.all([
      deleteSimpleRows(
        abuseEvents,
        abuseEvents.id,
        lt(
          abuseEvents.createdAt,
          retentionCutoff(RETENTION_POLICY.abuseDays, now),
        ),
      ),
      drainRetentionBatches(
        () =>
          deleteSimpleRows(
            economyEvents,
            economyEvents.id,
            lt(
              economyEvents.createdAt,
              retentionCutoff(RETENTION_POLICY.economyDays, now),
            ),
          ),
        RETENTION_POLICY.economyDeleteMaxBatches,
      ),
      deleteSimpleRows(
        adminAuditLog,
        adminAuditLog.id,
        lt(
          adminAuditLog.createdAt,
          retentionCutoff(RETENTION_POLICY.adminAuditDays, now),
        ),
      ),
      deleteSimpleRows(
        serverFeed,
        serverFeed.id,
        lt(
          serverFeed.createdAt,
          retentionCutoff(RETENTION_POLICY.serverFeedDays, now),
        ),
      ),
      deleteSimpleRows(
        pushDeliveries,
        pushDeliveries.eventKey,
        lt(
          pushDeliveries.createdAt,
          retentionCutoff(RETENTION_POLICY.pushDeliveryDays, now),
        ),
      ),
      deleteSimpleRows(
        ugcReports,
        ugcReports.id,
        and(
          inArray(ugcReports.status, ["resolved", "dismissed"]),
          isNotNull(ugcReports.resolvedAt),
          lt(
            ugcReports.resolvedAt,
            retentionCutoff(RETENTION_POLICY.resolvedUgcReportDays, now),
          ),
        ),
      ),
      trimArenaTournamentReplays(now),
    ]);

  const sanctionCutoff = retentionCutoff(
    RETENTION_POLICY.endedSanctionDays,
    now,
  );
  const sanctions = await deleteSimpleRows(
    userSanctions,
    userSanctions.id,
    or(
      and(
        isNotNull(userSanctions.liftedAt),
        lt(userSanctions.liftedAt, sanctionCutoff),
      ),
      and(
        eq(userSanctions.type, "suspend"),
        isNotNull(userSanctions.expiresAt),
        lt(userSanctions.expiresAt, sanctionCutoff),
      ),
      and(
        eq(userSanctions.type, "warn"),
        isNotNull(userSanctions.acknowledgedAt),
        lt(userSanctions.acknowledgedAt, sanctionCutoff),
      ),
    ),
  );

  const [battleReplay, coopReplay, guildActivity, marketplace] =
    await Promise.all([
      drainRetentionBatches(
        () =>
          deleteSimpleRows(
            battleReplays,
            battleReplays.id,
            lt(battleReplays.expiresAt, now),
          ),
        RETENTION_POLICY.backlogDeleteMaxBatches,
      ),
      trimCoopReplays(now),
      archiveAndTrimGuildActivities(),
      archiveAndTrimMarketplace(now),
    ]);
  const marketplaceCutoff = retentionCutoff(
    RETENTION_POLICY.marketplaceClosedDays,
    now,
  );
  const [buyOrders, priceAlerts, claimedInbox] = await Promise.all([
    deleteSimpleRows(
      marketplaceBuyOrdersV2,
      marketplaceBuyOrdersV2.id,
      and(
        sql`${marketplaceBuyOrdersV2.status} <> 'active'`,
        isNotNull(marketplaceBuyOrdersV2.closedAt),
        lt(marketplaceBuyOrdersV2.closedAt, marketplaceCutoff),
      ),
    ),
    deleteSimpleRows(
      marketplacePriceAlertsV2,
      marketplacePriceAlertsV2.id,
      and(
        sql`${marketplacePriceAlertsV2.status} <> 'active'`,
        lt(
          sql`coalesce(${marketplacePriceAlertsV2.triggeredAt}, ${marketplacePriceAlertsV2.createdAt})`,
          marketplaceCutoff,
        ),
      ),
    ),
    deleteSimpleRows(
      marketplaceInbox,
      marketplaceInbox.id,
      and(
        isNotNull(marketplaceInbox.claimedAt),
        lt(marketplaceInbox.claimedAt, marketplaceCutoff),
      ),
    ),
  ]);

  const storageDeletion = await processStorageDeletionQueue();
  if (storageDeletion.failed > 0) {
    await sendOpsAlert("[ops] 외부 파일 삭제 재시도 실패", {
      alertType: "privacy.storage_deletion_cron_failed",
      eventType: "privacy.storage_deletion.cron_failed",
      attempted: storageDeletion.attempted,
      failed: storageDeletion.failed,
    });
  }

  const results = {
    abuse,
    economy,
    adminAudit,
    sanctions,
    serverFeed: serverFeedResult,
    pushDelivery,
    safetyReports,
    arenaTournament: tournament,
    battleReplay,
    coopReplay,
    guildActivity,
    marketplace,
    marketplaceBuyOrders: buyOrders,
    marketplacePriceAlerts: priceAlerts,
    claimedInbox,
  };
  const backlog = Object.entries(results)
    .filter(([, result]) => result.more)
    .map(([key]) => key);
  const backlogDays = await updateBacklogStreak(backlog.length > 0);
  if (backlogDays === 3 || (backlogDays > 3 && backlogDays % 7 === 0)) {
    await sendOpsAlert("[ops] 로그 정리 적체 경고", {
      alertType: "database.retention_backlog",
      backlogDays,
      tables: backlog,
      deleteBatchSize: RETENTION_POLICY.deleteBatchSize,
    });
  }

  const storage = await recordStorageMetrics(now);
  return Response.json({
    ok: true,
    policy: RETENTION_POLICY,
    results,
    backlog,
    backlogDays,
    storageDeletion,
    storage,
  });
}
