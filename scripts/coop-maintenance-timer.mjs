#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import pg from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";

export const COOP_MAINTENANCE_OPS_KEY = "maintenance.coop-boss-timer";

/**
 * @param {unknown} value
 * @param {string} [label]
 */
export function parseMaintenanceTimestamp(value, label = "timestamp") {
  const parsed = new Date(value);
  if (typeof value !== "string" || value.trim() === "" || !Number.isFinite(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO timestamp`);
  }
  return parsed;
}

/**
 * Pure mirror of the SQL eligibility/extension rule, kept exported for boundary tests.
 * @param {{
 *   startedAt: string,
 *   resumedAt: string,
 *   spawnedAt: string,
 *   expiresAt: string,
 *   defeatedAt?: string | null,
 * }} args
 */
export function coopBossPauseMilliseconds({
  startedAt,
  resumedAt,
  spawnedAt,
  expiresAt,
  defeatedAt = null,
}) {
  const started = parseMaintenanceTimestamp(startedAt, "startedAt").getTime();
  const resumed = parseMaintenanceTimestamp(resumedAt, "resumedAt").getTime();
  const spawned = parseMaintenanceTimestamp(spawnedAt, "spawnedAt").getTime();
  const expires = parseMaintenanceTimestamp(expiresAt, "expiresAt").getTime();

  if (resumed <= started || defeatedAt !== null || expires <= started || spawned >= resumed) {
    return 0;
  }
  return resumed - Math.max(started, spawned);
}

export async function recordPauseStart(client, requestedStartedAt) {
  const startedAt = parseMaintenanceTimestamp(
    requestedStartedAt,
    "maintenance start",
  ).toISOString();
  const inserted = await client.query(
    `INSERT INTO ops_settings (key, value, updated_by_email, updated_at)
     VALUES ($1, jsonb_build_object('startedAt', $2::text), NULL, now())
     ON CONFLICT (key) DO NOTHING
     RETURNING value`,
    [COOP_MAINTENANCE_OPS_KEY, startedAt],
  );

  if (inserted.rowCount === 1) {
    return { startedAt, created: true };
  }

  const existing = await client.query(
    `SELECT value FROM ops_settings WHERE key = $1`,
    [COOP_MAINTENANCE_OPS_KEY],
  );
  const existingStartedAt = parseMaintenanceTimestamp(
    existing.rows[0]?.value?.startedAt,
    "stored maintenance start",
  ).toISOString();
  return { startedAt: existingStartedAt, created: false };
}

export async function resumeBossTimers(client, resumedAt = new Date()) {
  await client.query("BEGIN");
  try {
    const stored = await client.query(
      `SELECT value
         FROM ops_settings
        WHERE key = $1
        FOR UPDATE`,
      [COOP_MAINTENANCE_OPS_KEY],
    );
    if (stored.rowCount === 0) {
      await client.query("COMMIT");
      return { resumed: false, extendedBosses: 0, pausedMilliseconds: 0 };
    }

    const startedAt = parseMaintenanceTimestamp(
      stored.rows[0].value?.startedAt,
      "stored maintenance start",
    );
    if (resumedAt.getTime() < startedAt.getTime()) {
      throw new Error("maintenance end precedes maintenance start");
    }

    const extension = await client.query(
      `WITH pause AS (
         SELECT ($1::timestamptz AT TIME ZONE 'UTC') AS started_at,
                ($2::timestamptz AT TIME ZONE 'UTC') AS resumed_at
       ), eligible AS (
         SELECT session.id,
                pause.resumed_at - GREATEST(pause.started_at, session.spawned_at) AS paused_for
           FROM coop_boss_sessions AS session
           CROSS JOIN pause
          WHERE session.defeated_at IS NULL
            AND session.expires_at > pause.started_at
            AND session.spawned_at < pause.resumed_at
       )
       UPDATE coop_boss_sessions AS session
          SET expires_at = session.expires_at + eligible.paused_for,
              last_regen_at = CASE
                WHEN session.last_regen_at IS NULL THEN NULL
                ELSE session.last_regen_at + eligible.paused_for
              END
         FROM eligible
        WHERE session.id = eligible.id
       RETURNING session.id`,
      [startedAt.toISOString(), resumedAt.toISOString()],
    );

    await client.query(`DELETE FROM ops_settings WHERE key = $1`, [
      COOP_MAINTENANCE_OPS_KEY,
    ]);
    await client.query("COMMIT");
    return {
      resumed: true,
      extendedBosses: extension.rowCount ?? 0,
      pausedMilliseconds: resumedAt.getTime() - startedAt.getTime(),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runCoopMaintenanceTimer(args, env = process.env) {
  const [action, timestamp] = args;
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!['start', 'resume'].includes(action)) {
    throw new Error("usage: coop-maintenance-timer.mjs start <ISO timestamp> | resume");
  }
  if (action === "start" && !timestamp) {
    throw new Error("start requires an ISO timestamp");
  }

  const pool = new pg.Pool({
    ...createDatabaseConnectionOptions(env.DATABASE_URL, env),
    max: 1,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  });
  let client;
  try {
    client = await pool.connect();
    if (action === "start") {
      const result = await recordPauseStart(client, timestamp);
      process.stdout.write(
        `coop boss timer pause ${result.created ? "recorded" : "already active"}: ${result.startedAt}\n`,
      );
      return result;
    }

    const result = await resumeBossTimers(client);
    process.stdout.write(
      result.resumed
        ? `coop boss timers resumed: ${result.extendedBosses} active session(s), ${result.pausedMilliseconds}ms paused\n`
        : "coop boss timers already resumed\n",
    );
    return result;
  } finally {
    client?.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCoopMaintenanceTimer(process.argv.slice(2)).catch((error) => {
    console.error(`COOP TIMER FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
