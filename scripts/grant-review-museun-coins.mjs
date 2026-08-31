#!/usr/bin/env node

import pg from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";

const DEFAULT_REVIEW_LOGIN_IDS = [
  "gcrb-review-01",
  "gcrb-review-02",
  "gcrb-review-03",
];
const WALLET_KEY = "museun-coin-wallet.v1";

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (token === "--apply") {
    args.set("apply", "true");
    continue;
  }
  if (!token.startsWith("--") || index + 1 >= process.argv.length) {
    fail("Usage: --owner-email <email> [--coins 1000000] [--apply]");
  }
  args.set(token.slice(2), process.argv[index + 1]);
  index += 1;
}

const ownerEmail = args.get("owner-email")?.trim().toLowerCase();
if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
  fail("--owner-email must be a valid email address");
}

const targetCoins = Number(args.get("coins") ?? "1000000");
if (
  !Number.isSafeInteger(targetCoins) ||
  targetCoins < 1 ||
  targetCoins > 1_000_000_000
) {
  fail("--coins must be an integer between 1 and 1,000,000,000");
}

const reviewLoginIds = (
  process.env.MUSEUN_COIN_SHOP_REVIEW_LOGIN_IDS ??
  DEFAULT_REVIEW_LOGIN_IDS.join(",")
)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
if (
  reviewLoginIds.length === 0 ||
  new Set(reviewLoginIds).size !== reviewLoginIds.length
) {
  fail("review login IDs must be a non-empty unique list");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail("DATABASE_URL is required");

const pool = new pg.Pool({
  ...createDatabaseConnectionOptions(databaseUrl),
  max: 1,
});
const client = await pool.connect();

try {
  const result = await client.query(
    `SELECT u.id, u.email, pc.normalized_login_id AS "loginId"
       FROM users u
       LEFT JOIN password_credentials pc ON pc.user_id = u.id
      WHERE lower(u.email) = $1
         OR pc.normalized_login_id = ANY($2::text[])
      ORDER BY pc.normalized_login_id NULLS FIRST, u.email`,
    [ownerEmail, reviewLoginIds],
  );

  const ownerRows = result.rows.filter(
    (row) => row.email.toLowerCase() === ownerEmail,
  );
  if (ownerRows.length !== 1) {
    fail(`owner account lookup returned ${ownerRows.length} rows`);
  }
  for (const loginId of reviewLoginIds) {
    const matches = result.rows.filter((row) => row.loginId === loginId);
    if (matches.length !== 1) {
      fail(`review account ${loginId} lookup returned ${matches.length} rows`);
    }
  }

  const targets = [...new Map(result.rows.map((row) => [row.id, row])).values()];
  console.log(
    `${args.has("apply") ? "APPLY" : "DRY RUN"}: ${targets.length} accounts, minimum ${targetCoins.toLocaleString("en-US")} Museun Coins`,
  );
  for (const target of targets) {
    console.log(`  - ${target.loginId ?? target.email}`);
  }

  if (!args.has("apply")) {
    console.log("No changes made. Re-run with --apply to update the wallets.");
    process.exitCode = 2;
  } else {
    await client.query("BEGIN");
    for (const target of targets) {
      const walletResult = await client.query(
        `SELECT value
           FROM saves_kv
          WHERE user_id = $1 AND key = $2
          FOR UPDATE`,
        [target.id, WALLET_KEY],
      );
      const currentValue = walletResult.rows[0]?.value;
      const wallet =
        currentValue &&
        typeof currentValue === "object" &&
        !Array.isArray(currentValue)
          ? currentValue
          : {};
      const currentCoins =
        Number.isSafeInteger(wallet.coins) && wallet.coins >= 0
          ? wallet.coins
          : 0;
      const coins = Math.max(currentCoins, targetCoins);

      await client.query(
        `INSERT INTO saves_kv (user_id, key, value, version, updated_at)
         VALUES ($1, $2, $3::jsonb, 1, now())
         ON CONFLICT (user_id, key) DO UPDATE
           SET value = EXCLUDED.value,
               version = saves_kv.version + 1,
               updated_at = now()`,
        [target.id, WALLET_KEY, JSON.stringify({ ...wallet, coins })],
      );
      console.log(
        `  ✓ ${target.loginId ?? target.email}: ${currentCoins.toLocaleString("en-US")} -> ${coins.toLocaleString("en-US")}`,
      );
    }
    await client.query("COMMIT");
    console.log("✓ review Museun Coin wallets updated");
  }
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // A transaction may not have started during validation failures.
  }
  throw error;
} finally {
  client.release();
  await pool.end();
}
