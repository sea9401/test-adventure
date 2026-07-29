import pg from "pg";
import { createDatabaseConnectionOptions } from "../../src/db/databaseTls.mjs";
import {
  E2E_ACCOUNT_USER_ID,
  assertIsolatedE2eDatabaseUrl,
  readE2eAccountConfig,
} from "../../src/db/e2eDatabase.mjs";

type AuthenticatedE2eConfig = {
  loginId: string;
  normalizedLoginId: string;
  password: string;
};

export function authenticatedE2eConfig(): AuthenticatedE2eConfig | null {
  if (!process.env.DATABASE_URL) return null;
  try {
    const config = readE2eAccountConfig(process.env);
    return typeof config.password === "string"
      ? (config as AuthenticatedE2eConfig)
      : null;
  } catch {
    return null;
  }
}

/**
 * Playwright 재시도도 항상 최초 생성에서 시작하도록 고정 계정의 게임 상태만 비운다.
 * assertIsolatedE2eDatabaseUrl이 loopback의 adventure_e2e 외 DB에서는 먼저 중단한다.
 */
export async function resetAuthenticatedE2eAccount() {
  const databaseUrl = assertIsolatedE2eDatabaseUrl(process.env.DATABASE_URL);
  const account = readE2eAccountConfig(process.env);
  const pool = new pg.Pool({
    ...createDatabaseConnectionOptions(databaseUrl),
    max: 1,
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [20_260_729]);
    await client.query("DELETE FROM server_feed WHERE user_id = $1", [
      E2E_ACCOUNT_USER_ID,
    ]);
    await client.query("DELETE FROM saves_kv WHERE user_id = $1", [
      E2E_ACCOUNT_USER_ID,
    ]);
    const result = await client.query(
      `UPDATE users
       SET game_name = NULL,
           active_session_id = NULL,
           banned_until = NULL,
           ban_reason = NULL,
           updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [E2E_ACCOUNT_USER_ID],
    );
    const credential = await client.query(
      `SELECT pc.user_id
       FROM password_credentials pc
       WHERE pc.user_id = $1
         AND pc.normalized_login_id = $2
         AND pc.disabled_at IS NULL`,
      [E2E_ACCOUNT_USER_ID, account.normalizedLoginId],
    );
    if (result.rowCount !== 1 || credential.rowCount !== 1) {
      throw new Error("The seeded E2E account is missing or disabled");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
