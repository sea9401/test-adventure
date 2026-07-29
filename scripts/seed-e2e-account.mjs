import pg from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";
import {
  E2E_ACCOUNT_EMAIL,
  E2E_ACCOUNT_USER_ID,
  assertIsolatedE2eDatabaseUrl,
  readE2eAccountConfig,
} from "../src/db/e2eDatabase.mjs";
import {
  hashPasswordAccountPassword,
  verifyPasswordAccountPassword,
} from "../src/lib/passwordCredentialCore.mjs";

const databaseUrl = assertIsolatedE2eDatabaseUrl(process.env.DATABASE_URL);
const account = readE2eAccountConfig(process.env);
delete process.env.E2E_TEST_PASSWORD;

const passwordHash = await hashPasswordAccountPassword(account.password);
const pool = new pg.Pool({
  ...createDatabaseConnectionOptions(databaseUrl),
  max: 1,
});
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO users (id, name, email, created_at, updated_at)
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = now()`,
    [E2E_ACCOUNT_USER_ID, account.loginId, E2E_ACCOUNT_EMAIL],
  );
  await client.query(
    `DELETE FROM password_credentials
     WHERE normalized_login_id = $1 AND user_id <> $2`,
    [account.normalizedLoginId, E2E_ACCOUNT_USER_ID],
  );
  await client.query(
    `INSERT INTO password_credentials
       (user_id, login_id, normalized_login_id, password_hash, disabled_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NULL, now(), now())
     ON CONFLICT (user_id) DO UPDATE
       SET login_id = EXCLUDED.login_id,
           normalized_login_id = EXCLUDED.normalized_login_id,
           password_hash = EXCLUDED.password_hash,
           disabled_at = NULL,
           updated_at = now()`,
    [
      E2E_ACCOUNT_USER_ID,
      account.loginId,
      account.normalizedLoginId,
      passwordHash,
    ],
  );

  const result = await client.query(
    `SELECT u.id, u.email, pc.password_hash, pc.disabled_at
     FROM users u
     JOIN password_credentials pc ON pc.user_id = u.id
     WHERE u.id = $1 AND pc.normalized_login_id = $2`,
    [E2E_ACCOUNT_USER_ID, account.normalizedLoginId],
  );
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    row.email !== E2E_ACCOUNT_EMAIL ||
    row.disabled_at !== null ||
    !(await verifyPasswordAccountPassword(account.password, row.password_hash))
  ) {
    throw new Error("Seeded E2E account failed verification");
  }

  await client.query("COMMIT");
  console.log(`✓ E2E account ready: ${account.loginId} (${E2E_ACCOUNT_USER_ID})`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  account.password = "";
  client.release();
  await pool.end();
}
