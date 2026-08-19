import { statSync } from "node:fs";
import pg from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";
import {
  PRESERVED_TABLES,
  RESET_CONFIRMATION,
  RESET_TABLES,
  buildResetTablePlan,
  parseResetArgs,
  quoteIdentifier,
} from "./reset-game-progress-plan.mjs";

const LOCK_NAME = "adventure-rpg:reset-game-progress:v1";
const CRITICAL_PRESERVED_TABLES = [
  "coupon_campaigns",
  "coupon_codes",
  "password_credentials",
];
const GOOGLE_PROVIDER = "google";
const MUTABLE_PRESERVED_TABLES = new Set([
  "accounts",
  "feedback_reports",
  "storage_deletion_queue",
  "user_sanctions",
  "users",
]);
const PROFILE_USER_ID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
const FEEDBACK_IMAGE_KEY_PATTERN = "^feedback-images/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.webp$";

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
  buildResetTablePlan(publicTables, args);

  if (args.execute) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [LOCK_NAME]);
    const lockTargets = publicTables.map(quoteIdentifier).join(", ");
    await client.query(`LOCK TABLE ${lockTargets} IN ACCESS EXCLUSIVE MODE`);
  }

  const before = await takeSnapshot(client);
  assertExpectedCounts(before, args);
  assertGoogleDeletionSafety(before);
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
    printSuccess(before, after);
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
  await db.query(`
    CREATE TEMP TABLE reset_deleted_google_users ON COMMIT DROP AS
      SELECT u.id
        FROM users u
       WHERE ${googleOnlyUserPredicate("u")}
  `);
  await db.query(
    "ALTER TABLE reset_deleted_google_users ADD PRIMARY KEY (id)",
  );

  await db.query(
    `INSERT INTO storage_deletion_queue (kind, target)
     SELECT target.kind, target.target
       FROM (
         SELECT 'profile_user'::text AS kind, g.id AS target
           FROM reset_deleted_google_users g
          WHERE g.id ~ '${PROFILE_USER_ID_PATTERN}'
         UNION
         SELECT 'feedback_image'::text AS kind, f.image_key AS target
           FROM feedback_reports f
           JOIN reset_deleted_google_users g ON g.id = f.user_id
          WHERE f.image_key IS NOT NULL
       ) target
     ON CONFLICT (kind, target) DO NOTHING`,
  );

  const resetTargets = RESET_TABLES.map(quoteIdentifier).join(", ");
  await db.query(`TRUNCATE TABLE ${resetTargets} RESTART IDENTITY CASCADE`);

  await db.query("DELETE FROM accounts WHERE provider = $1", [GOOGLE_PROVIDER]);
  await db.query(`
    DELETE FROM users u
     USING reset_deleted_google_users g
     WHERE u.id = g.id
  `);

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
}

async function takeSnapshot(db) {
  const preservedCounts = await tableCounts(db, PRESERVED_TABLES);
  const resetCounts = await tableCounts(db, RESET_TABLES);
  const criticalDigests = {};
  for (const table of CRITICAL_PRESERVED_TABLES) {
    criticalDigests[table] = await tableDigest(db, table);
  }
  const googleAccounts = await scalarCount(
    db,
    `SELECT count(*) FROM accounts WHERE provider = '${GOOGLE_PROVIDER}'`,
  );
  const deletedGoogleUsers = await scalarCount(
    db,
    `SELECT count(*) FROM users u WHERE ${googleOnlyUserPredicate("u")}`,
  );
  const deletedGoogleFeedbackReports = await scalarCount(
    db,
    `SELECT count(*)
       FROM feedback_reports f
       JOIN users u ON u.id = f.user_id
      WHERE ${googleOnlyUserPredicate("u")}`,
  );
  const deletedGoogleSanctions = await scalarCount(
    db,
    `SELECT count(*)
       FROM user_sanctions s
       JOIN users u ON u.id = s.user_id
      WHERE ${googleOnlyUserPredicate("u")}`,
  );
  const storageDeletionTargets = await readStorageDeletionTargets(db);
  return {
    users: preservedCounts.users,
    accounts: preservedCounts.accounts,
    passwordAccounts: preservedCounts.password_credentials,
    googleAccounts,
    deletedGoogleUsers,
    deletedGoogleFeedbackReports,
    deletedGoogleSanctions,
    invalidGoogleUserIds: await scalarCount(
      db,
      `SELECT count(*) FROM users u
        WHERE ${googleOnlyUserPredicate("u")} AND u.id !~ '${PROFILE_USER_ID_PATTERN}'`,
    ),
    invalidGoogleFeedbackImageKeys: await scalarCount(
      db,
      `SELECT count(*)
         FROM feedback_reports f
         JOIN users u ON u.id = f.user_id
        WHERE ${googleOnlyUserPredicate("u")}
          AND f.image_key IS NOT NULL
          AND f.image_key !~ '${FEEDBACK_IMAGE_KEY_PATTERN}'`,
    ),
    googleRestrictedCoupons: await scalarCount(
      db,
      `SELECT count(*)
         FROM coupon_codes c
         JOIN users u ON u.id = c.restricted_user_id
        WHERE ${googleOnlyUserPredicate("u")}`,
    ),
    googleIssuedCoupons: await scalarCount(
      db,
      `SELECT count(*)
         FROM coupon_codes c
         JOIN users u ON u.id = c.issued_for_user_id
        WHERE ${googleOnlyUserPredicate("u")}`,
    ),
    storageDeletionTargets: storageDeletionTargets.total,
    newStorageDeletionTargets: storageDeletionTargets.new,
    couponCampaigns: preservedCounts.coupon_campaigns,
    couponCodes: preservedCounts.coupon_codes,
    inboxRows: resetCounts.marketplace_inbox,
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
    retainedUsersIdentityDigest: await usersIdentityDigest(
      db,
      `WHERE NOT (${googleOnlyUserPredicate("users")})`,
    ),
    retainedAccountsDigest: await queryDigest(
      db,
      `SELECT row_to_json(a)::text AS row_text
         FROM accounts a
        WHERE a.provider <> '${GOOGLE_PROVIDER}'`,
    ),
    preservedCounts,
    resetCounts,
    criticalDigests,
  };
}

function assertExpectedCounts(snapshot, expected) {
  const checks = [
    ["users", snapshot.users, expected.expectUsers],
    ["auth accounts", snapshot.accounts, expected.expectAuthAccounts],
    ["password accounts", snapshot.passwordAccounts, expected.expectPasswordAccounts],
    ["Google accounts", snapshot.googleAccounts, expected.expectGoogleAccounts],
    [
      "Google-only users",
      snapshot.deletedGoogleUsers,
      expected.expectDeletedGoogleUsers,
    ],
    ["coupon codes", snapshot.couponCodes, expected.expectCouponCodes],
    ["inbox rows", snapshot.inboxRows, expected.expectInboxRows],
  ];
  for (const [label, actual, wanted] of checks) {
    if (wanted !== undefined && actual !== wanted) {
      throw new Error(`${label} count changed: found ${actual}, expected ${wanted}`);
    }
  }
}

function assertGoogleDeletionSafety(snapshot) {
  if (snapshot.invalidGoogleFeedbackImageKeys !== 0) {
    throw new Error(
      `${snapshot.invalidGoogleFeedbackImageKeys} Google feedback image key(s) are invalid`,
    );
  }
  if (snapshot.googleRestrictedCoupons !== 0) {
    throw new Error(
      `${snapshot.googleRestrictedCoupons} account-bound coupon(s) belong to Google-only users`,
    );
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
    if (MUTABLE_PRESERVED_TABLES.has(table)) continue;
    if (after.preservedCounts[table] !== before.preservedCounts[table]) {
      throw new Error(
        `preserved table ${table} changed row count: ` +
          `${before.preservedCounts[table]} -> ${after.preservedCounts[table]}`,
      );
    }
  }
  const expectedMutableCounts = {
    accounts: before.preservedCounts.accounts - before.googleAccounts,
    feedback_reports:
      before.preservedCounts.feedback_reports - before.deletedGoogleFeedbackReports,
    storage_deletion_queue:
      before.preservedCounts.storage_deletion_queue + before.newStorageDeletionTargets,
    user_sanctions:
      before.preservedCounts.user_sanctions - before.deletedGoogleSanctions,
    users: before.preservedCounts.users - before.deletedGoogleUsers,
  };
  for (const [table, expectedCount] of Object.entries(expectedMutableCounts)) {
    if (after.preservedCounts[table] !== expectedCount) {
      throw new Error(
        `selectively changed table ${table} has ${after.preservedCounts[table]} rows; ` +
          `expected ${expectedCount}`,
      );
    }
  }
  for (const table of CRITICAL_PRESERVED_TABLES) {
    if (after.criticalDigests[table] !== before.criticalDigests[table]) {
      throw new Error(`preserved table ${table} changed contents`);
    }
  }
  if (after.googleAccounts !== 0 || after.deletedGoogleUsers !== 0) {
    throw new Error(
      `Google identity cleanup incomplete: accounts=${after.googleAccounts}, ` +
        `users=${after.deletedGoogleUsers}`,
    );
  }
  if (after.retainedAccountsDigest !== before.retainedAccountsDigest) {
    throw new Error("retained non-Google auth accounts changed contents");
  }
  if (after.retainedUsersIdentityDigest !== before.retainedUsersIdentityDigest) {
    throw new Error("retained user identity fields changed contents");
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

async function readStorageDeletionTargets(db) {
  const result = await db.query(`
    WITH deletion_targets AS (
      SELECT 'profile_user'::text AS kind, u.id AS target
        FROM users u
       WHERE ${googleOnlyUserPredicate("u")} AND u.id ~ '${PROFILE_USER_ID_PATTERN}'
      UNION
      SELECT 'feedback_image'::text AS kind, f.image_key AS target
        FROM feedback_reports f
        JOIN users u ON u.id = f.user_id
       WHERE ${googleOnlyUserPredicate("u")} AND f.image_key IS NOT NULL
    )
    SELECT count(*)::int AS total,
           count(*) FILTER (
             WHERE NOT EXISTS (
               SELECT 1 FROM storage_deletion_queue q
                WHERE q.kind = target.kind AND q.target = target.target
             )
           )::int AS new
      FROM deletion_targets target
  `);
  return result.rows[0];
}

async function usersIdentityDigest(db, whereClause = "") {
  return queryDigest(
    db,
    `SELECT jsonb_build_array(
       id, name, email, email_verified, image, banned_until, ban_reason, created_at
     )::text AS row_text FROM users ${whereClause}`,
  );
}

function googleOnlyUserPredicate(alias) {
  return `
    EXISTS (
      SELECT 1 FROM accounts google_account
       WHERE google_account.user_id = ${alias}.id
         AND google_account.provider = '${GOOGLE_PROVIDER}'
    )
    AND NOT EXISTS (
      SELECT 1 FROM accounts retained_account
       WHERE retained_account.user_id = ${alias}.id
         AND retained_account.provider <> '${GOOGLE_PROVIDER}'
    )
    AND NOT EXISTS (
      SELECT 1 FROM password_credentials credential
       WHERE credential.user_id = ${alias}.id
    )
  `;
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
  console.log(`  users before reset: ${snapshot.users}`);
  console.log(
    `  Google-only users deleted: ${snapshot.deletedGoogleUsers} ` +
      `(retained ${snapshot.users - snapshot.deletedGoogleUsers})`,
  );
  console.log(`  auth accounts before reset: ${snapshot.accounts}`);
  console.log(
    `  Google auth accounts deleted: ${snapshot.googleAccounts} ` +
      `(retained ${snapshot.accounts - snapshot.googleAccounts})`,
  );
  console.log(`  password accounts preserved: ${snapshot.passwordAccounts}`);
  console.log(
    `  Google coupon metadata retained/unusable restricted: ` +
      `${snapshot.googleIssuedCoupons}/${snapshot.googleRestrictedCoupons}`,
  );
  console.log(
    `  Google feedback deleted/storage cleanup targets queued: ` +
      `${snapshot.deletedGoogleFeedbackReports}/${snapshot.storageDeletionTargets}`,
  );
  if (snapshot.invalidGoogleUserIds > 0) {
    console.log(
      `  profile cleanup skipped for non-profile-compatible ids: ` +
        `${snapshot.invalidGoogleUserIds}`,
    );
  }
  console.log(
    `  coupon campaigns/codes preserved: ${snapshot.couponCampaigns}/${snapshot.couponCodes}`,
  );
  console.log(`  inbox rows removed: ${snapshot.inboxRows}`);
  console.log(`  users with beta game state: ${snapshot.userGameStateRows}`);
}

function printExecuteExample(databaseName, snapshot) {
  console.log("\nNo data changed. After maintenance mode and a verified backup, execute with:");
  console.log(
    `npm run db:reset-game-progress -- --expect-database ${databaseName} ` +
      `--expect-users ${snapshot.users} ` +
      `--expect-auth-accounts ${snapshot.accounts} ` +
      `--expect-password-accounts ${snapshot.passwordAccounts} ` +
      `--expect-google-accounts ${snapshot.googleAccounts} ` +
      `--expect-deleted-google-users ${snapshot.deletedGoogleUsers} ` +
      `--expect-coupon-codes ${snapshot.couponCodes} ` +
      `--expect-inbox-rows ${snapshot.inboxRows} ` +
      "--maintenance-flag /etc/nginx/msmsge-maintenance.on " +
      `--confirm ${RESET_CONFIRMATION} --execute`,
  );
}

function printSuccess(before, after) {
  console.log("✓ selective game reset committed");
  console.log(
    `  Google auth accounts/users deleted: ` +
      `${before.googleAccounts}/${before.deletedGoogleUsers}`,
  );
  console.log(`  retained users/auth accounts: ${after.users}/${after.accounts}`);
  console.log(`  password accounts preserved: ${after.passwordAccounts}`);
  console.log(`  coupon codes preserved: ${after.couponCodes}`);
  console.log(
    `  storage cleanup targets queued: ${before.newStorageDeletionTargets}`,
  );
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
  --expect-auth-accounts <n>
  --expect-password-accounts <n>
  --expect-google-accounts <n>
  --expect-deleted-google-users <n>
  --expect-coupon-codes <n>
  --expect-inbox-rows <n>
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
