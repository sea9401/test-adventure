import { statSync } from "node:fs";
import pg from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";
import {
  COUPON_NOTICE_PREDICATE,
  PARTIAL_RESET_TABLES,
  PRESERVED_TABLES,
  RESET_CONFIRMATION,
  RESET_TABLES,
  parseResetArgs,
  quoteIdentifier,
  validateTableCoverage,
} from "./reset-game-progress-plan.mjs";

const LOCK_NAME = "adventure-rpg:reset-game-progress:v1";
const CRITICAL_PRESERVED_TABLES = [
  "accounts",
  "coupon_campaigns",
  "coupon_codes",
  "password_credentials",
];

let args;
try {
  args = parseResetArgs(process.argv.slice(2));
} catch (error) {
  failUsage(error.message);
}

if (args.help) usage();
if (args.execute && !isRegularFile(args.maintenanceFlag)) {
  failUsage(`maintenance flag is not a regular file: ${args.maintenanceFlag}`);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) failUsage("DATABASE_URL is required");

const pool = new pg.Pool({
  ...createDatabaseConnectionOptions(databaseUrl),
  max: 1,
  application_name: "reset-game-progress",
});
const client = await pool.connect();

try {
  await client.query(
    args.execute
      ? "BEGIN ISOLATION LEVEL SERIALIZABLE"
      : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  await client.query("SET LOCAL statement_timeout = '5min'");
  await client.query("SET LOCAL lock_timeout = '15s'");

  const databaseName = await readDatabaseName(client);
  if (databaseName !== args.expectDatabase) {
    throw new Error(
      `database guard failed: connected to ${databaseName}, expected ${args.expectDatabase}`,
    );
  }
  await assertMigrationTableIsolation(client);

  const publicTables = await readPublicTables(client);
  validateTableCoverage(publicTables);

  if (args.execute) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [LOCK_NAME]);
    const lockTargets = publicTables.map(quoteIdentifier).join(", ");
    await client.query(`LOCK TABLE ${lockTargets} IN ACCESS EXCLUSIVE MODE`);
  }

  const before = await takeSnapshot(client);
  assertExpectedCounts(before, args);
  assertCouponRestrictionsResolve(before);
  printPreview(databaseName, publicTables, before, args.execute);

  if (!args.execute) {
    await client.query("ROLLBACK");
    printExecuteExample(databaseName, before);
  } else {
    await executeReset(client);
    const after = await takeSnapshot(client);
    assertResetResult(before, after);
    await client.query("COMMIT");
    printSuccess(after);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`✗ game progress reset aborted: ${error.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

async function executeReset(db) {
  const invalidNotices = await scalarCount(
    db,
    `SELECT count(*) FROM marketplace_inbox
      WHERE (${COUPON_NOTICE_PREDICATE})
        AND (listing_id IS NOT NULL OR from_user_id IS NOT NULL)`,
  );
  if (invalidNotices !== 0) {
    throw new Error(`coupon notices with unsafe foreign keys: ${invalidNotices}`);
  }

  await db.query(
    `CREATE TEMP TABLE reset_preserved_coupon_inbox ON COMMIT DROP AS
       SELECT * FROM marketplace_inbox WHERE ${COUPON_NOTICE_PREDICATE}`,
  );

  const resetTargets = [...RESET_TABLES, ...PARTIAL_RESET_TABLES]
    .map(quoteIdentifier)
    .join(", ");
  await db.query(`TRUNCATE TABLE ${resetTargets} RESTART IDENTITY CASCADE`);

  await db.query(`
    UPDATE users
       SET game_name = NULL,
           active_session_id = NULL,
           hunt_active = false,
           hunt_region = NULL,
           hunt_baseline_hp = NULL,
           hunt_baseline_at = NULL,
           hunt_predicted_death_at = NULL,
           last_claim_id = NULL,
           last_claim_result = NULL,
           updated_at = now()
  `);

  await db.query(`
    INSERT INTO marketplace_inbox
      (id, user_id, kind, payload, message, listing_id, from_user_id, from_name,
       created_at, claimed_at)
    SELECT id, user_id, kind, payload, message, listing_id, from_user_id, from_name,
           created_at, claimed_at
      FROM reset_preserved_coupon_inbox
     ORDER BY id
  `);
  await db.query(`
    SELECT setval(
      pg_get_serial_sequence('marketplace_inbox', 'id'),
      COALESCE((SELECT max(id) FROM marketplace_inbox), 1),
      EXISTS (SELECT 1 FROM marketplace_inbox)
    )
  `);
}

async function takeSnapshot(db) {
  const preservedCounts = await tableCounts(db, PRESERVED_TABLES);
  const resetCounts = await tableCounts(db, RESET_TABLES);
  const criticalDigests = {};
  for (const table of CRITICAL_PRESERVED_TABLES) {
    criticalDigests[table] = await tableDigest(db, table);
  }
  return {
    users: preservedCounts.users,
    accounts: preservedCounts.accounts,
    couponCampaigns: preservedCounts.coupon_campaigns,
    couponCodes: preservedCounts.coupon_codes,
    couponNotices: await scalarCount(
      db,
      `SELECT count(*) FROM marketplace_inbox WHERE ${COUPON_NOTICE_PREDICATE}`,
    ),
    marketplaceInbox: await scalarCount(db, "SELECT count(*) FROM marketplace_inbox"),
    unresolvedRestrictedCoupons: await scalarCount(
      db,
      `SELECT count(*)
         FROM coupon_codes c
         LEFT JOIN users u ON u.id = c.restricted_user_id
        WHERE c.restricted_user_id IS NOT NULL AND u.id IS NULL`,
    ),
    userGameStateRows: await scalarCount(
      db,
      `SELECT count(*) FROM users
        WHERE game_name IS NOT NULL
           OR active_session_id IS NOT NULL
           OR hunt_active
           OR hunt_region IS NOT NULL
           OR hunt_baseline_hp IS NOT NULL
           OR hunt_baseline_at IS NOT NULL
           OR hunt_predicted_death_at IS NOT NULL
           OR last_claim_id IS NOT NULL
           OR last_claim_result IS NOT NULL`,
    ),
    usersIdentityDigest: await usersIdentityDigest(db),
    couponNoticeDigest: await queryDigest(
      db,
      `SELECT row_to_json(i)::text AS row_text
         FROM marketplace_inbox i
        WHERE ${COUPON_NOTICE_PREDICATE}`,
    ),
    preservedCounts,
    resetCounts,
    criticalDigests,
  };
}

function assertExpectedCounts(snapshot, expected) {
  const checks = [
    ["users", snapshot.users, expected.expectUsers],
    ["coupon codes", snapshot.couponCodes, expected.expectCouponCodes],
    ["coupon notices", snapshot.couponNotices, expected.expectCouponNotices],
  ];
  for (const [label, actual, wanted] of checks) {
    if (wanted !== undefined && actual !== wanted) {
      throw new Error(`${label} count changed: found ${actual}, expected ${wanted}`);
    }
  }
}

function assertCouponRestrictionsResolve(snapshot) {
  if (snapshot.unresolvedRestrictedCoupons !== 0) {
    throw new Error(
      `${snapshot.unresolvedRestrictedCoupons} account-bound coupon(s) reference missing users`,
    );
  }
}

function assertResetResult(before, after) {
  for (const table of PRESERVED_TABLES) {
    if (after.preservedCounts[table] !== before.preservedCounts[table]) {
      throw new Error(
        `preserved table ${table} changed row count: ` +
          `${before.preservedCounts[table]} -> ${after.preservedCounts[table]}`,
      );
    }
  }
  for (const table of CRITICAL_PRESERVED_TABLES) {
    if (after.criticalDigests[table] !== before.criticalDigests[table]) {
      throw new Error(`preserved table ${table} changed contents`);
    }
  }
  if (after.usersIdentityDigest !== before.usersIdentityDigest) {
    throw new Error("preserved user identity fields changed contents");
  }
  if (after.couponNoticeDigest !== before.couponNoticeDigest) {
    throw new Error("preserved coupon notices changed contents");
  }
  if (after.marketplaceInbox !== before.couponNotices) {
    throw new Error(
      `marketplace inbox contains ${after.marketplaceInbox} rows after reset; ` +
        `expected ${before.couponNotices} coupon notices`,
    );
  }
  const nonEmpty = Object.entries(after.resetCounts).filter(([, count]) => count !== 0);
  if (nonEmpty.length > 0) {
    throw new Error(
      `reset tables are not empty: ${nonEmpty.map(([name, count]) => `${name}=${count}`).join(", ")}`,
    );
  }
  if (after.userGameStateRows !== 0) {
    throw new Error(`${after.userGameStateRows} users still have game state columns`);
  }
  assertCouponRestrictionsResolve(after);
}

async function readDatabaseName(db) {
  const result = await db.query("SELECT current_database() AS name");
  return result.rows[0].name;
}

async function assertMigrationTableIsolation(db) {
  const result = await db.query(`
    SELECT table_schema
      FROM information_schema.tables
     WHERE table_name = '__drizzle_migrations'
     ORDER BY table_schema
  `);
  const schemas = result.rows.map((row) => row.table_schema);
  if (schemas.length !== 1 || schemas[0] !== "drizzle") {
    throw new Error(
      `migration table guard failed: expected drizzle.__drizzle_migrations, found ${schemas.join(", ") || "none"}`,
    );
  }
}

async function readPublicTables(db) {
  const result = await db.query(`
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename
  `);
  return result.rows.map((row) => row.tablename);
}

async function tableCounts(db, tables) {
  const sql = tables
    .map(
      (table) =>
        `SELECT '${table}' AS table_name, count(*)::bigint AS row_count FROM ${quoteIdentifier(table)}`,
    )
    .join(" UNION ALL ");
  const result = await db.query(sql);
  return Object.fromEntries(result.rows.map((row) => [row.table_name, Number(row.row_count)]));
}

async function scalarCount(db, sql) {
  const result = await db.query(sql);
  return Number(result.rows[0].count);
}

async function tableDigest(db, table) {
  return queryDigest(db, `SELECT row_to_json(t)::text AS row_text FROM ${quoteIdentifier(table)} t`);
}

async function usersIdentityDigest(db) {
  return queryDigest(
    db,
    `SELECT jsonb_build_array(
       id, name, email, email_verified, image, banned_until, ban_reason, created_at
     )::text AS row_text FROM users`,
  );
}

async function queryDigest(db, rowQuery) {
  const result = await db.query(`
    SELECT md5(COALESCE(string_agg(row_text, E'\\n' ORDER BY row_text), '')) AS digest
      FROM (${rowQuery}) digest_rows
  `);
  return result.rows[0].digest;
}

function printPreview(databaseName, publicTables, snapshot, executing) {
  console.log(`${executing ? "▶ EXECUTE" : "○ DRY RUN"} selective game reset`);
  console.log(`  database: ${databaseName}`);
  console.log(`  classified public tables: ${publicTables.length}`);
  console.log(`  users preserved: ${snapshot.users}`);
  console.log(`  auth accounts preserved: ${snapshot.accounts}`);
  console.log(
    `  coupon campaigns/codes preserved: ${snapshot.couponCampaigns}/${snapshot.couponCodes}`,
  );
  console.log(`  coupon notices preserved: ${snapshot.couponNotices}`);
  console.log(`  other inbox rows removed: ${snapshot.marketplaceInbox - snapshot.couponNotices}`);
  console.log(`  users with beta game state: ${snapshot.userGameStateRows}`);
}

function printExecuteExample(databaseName, snapshot) {
  console.log("\nNo data changed. After maintenance mode and a verified backup, execute with:");
  console.log(
    `npm run db:reset-game-progress -- --expect-database ${databaseName} ` +
      `--expect-users ${snapshot.users} --expect-coupon-codes ${snapshot.couponCodes} ` +
      `--expect-coupon-notices ${snapshot.couponNotices} ` +
      "--maintenance-flag /etc/nginx/msmsge-maintenance.on " +
      `--confirm ${RESET_CONFIRMATION} --execute`,
  );
}

function printSuccess(snapshot) {
  console.log("✓ selective game reset committed");
  console.log(`  users preserved: ${snapshot.users}`);
  console.log(`  coupon codes/notices preserved: ${snapshot.couponCodes}/${snapshot.couponNotices}`);
  console.log("  game progress tables empty and user game columns cleared");
}

function isRegularFile(path) {
  if (!path) return false;
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function usage() {
  console.log(`Usage:
  DATABASE_URL=... npm run db:reset-game-progress -- \\
    --expect-database <exact-db-name>

Dry-run is the default and never changes data. Execution additionally requires:
  --expect-users <n>
  --expect-coupon-codes <n>
  --expect-coupon-notices <n>
  --maintenance-flag <existing-file>
  --confirm ${RESET_CONFIRMATION}
  --execute`);
  process.exit(0);
}

function failUsage(message) {
  console.error(`✗ ${message}`);
  console.error("Run with --help for usage.");
  process.exit(2);
}
