import pg from "pg";
import { createDatabaseConnectionOptions } from "../../src/db/databaseTls.mjs";
import {
  E2E_ACCOUNT_EMAIL,
  E2E_ACCOUNT_USER_ID,
  assertIsolatedE2eDatabaseUrl,
  readE2eAccountConfig,
} from "../../src/db/e2eDatabase.mjs";
import { hashPasswordAccountPassword } from "../../src/lib/passwordCredentialCore.mjs";
import { UGC_POLICY_VERSION } from "../../src/lib/ugc-safety";

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
 * Playwright 재시도도 항상 최초 생성에서 시작하도록 고정 계정을 다시 준비하고 게임 상태를 비운다.
 * 회원 탈퇴 E2E가 users/password_credentials를 지운 뒤에도 다음 실행에서 복구된다.
 * assertIsolatedE2eDatabaseUrl이 loopback의 adventure_e2e 외 DB에서는 먼저 중단한다.
 */
export async function resetAuthenticatedE2eAccount() {
  const databaseUrl = assertIsolatedE2eDatabaseUrl(process.env.DATABASE_URL);
  const account = readE2eAccountConfig(process.env);
  if (typeof account.password !== "string") {
    throw new Error("E2E_TEST_PASSWORD is required");
  }
  const passwordHash = await hashPasswordAccountPassword(account.password);
  const pool = new pg.Pool({
    ...createDatabaseConnectionOptions(databaseUrl),
    max: 1,
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [20_260_729]);
    await client.query(
      `DELETE FROM storage_deletion_queue
       WHERE kind = 'profile_user' AND target = $1`,
      [E2E_ACCOUNT_USER_ID],
    );
    await client.query(
      `INSERT INTO users (id, name, email, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             email = EXCLUDED.email,
             game_name = NULL,
             active_session_id = NULL,
             banned_until = NULL,
             ban_reason = NULL,
             updated_at = now()`,
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
    // 인증 E2E는 게임 진행 복원과 API 경계를 검증한다. 전역 정책 동의 대화상자가
    // 각 시나리오의 첫 입력을 가리지 않도록 격리 계정에 현재 버전 동의를 준비한다.
    await client.query("DELETE FROM ugc_policy_consents WHERE user_id = $1", [
      E2E_ACCOUNT_USER_ID,
    ]);
    await client.query(
      `INSERT INTO ugc_policy_consents (user_id, version, accepted_at)
       VALUES ($1, $2, now())`,
      [E2E_ACCOUNT_USER_ID, UGC_POLICY_VERSION],
    );
    await client.query("DELETE FROM server_feed WHERE user_id = $1", [
      E2E_ACCOUNT_USER_ID,
    ]);
    await client.query(
      `DELETE FROM outpost_occupations
       WHERE occupied_by_guild_id IN (
         SELECT guild_id FROM guild_members WHERE user_id = $1
       )`,
      [E2E_ACCOUNT_USER_ID],
    );
    await client.query(
      `DELETE FROM guilds
       WHERE id IN (
         SELECT mine.guild_id
         FROM guild_members mine
         WHERE mine.user_id = $1
           AND NOT EXISTS (
             SELECT 1
             FROM guild_members other
             WHERE other.guild_id = mine.guild_id
               AND other.user_id <> $1
           )
       )`,
      [E2E_ACCOUNT_USER_ID],
    );
    await client.query("DELETE FROM guild_members WHERE user_id = $1", [
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

export async function authenticatedE2eAccountDeletionState() {
  const databaseUrl = assertIsolatedE2eDatabaseUrl(process.env.DATABASE_URL);
  const pool = new pg.Pool({
    ...createDatabaseConnectionOptions(databaseUrl),
    max: 1,
  });

  try {
    const result = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM users WHERE id = $1) AS users,
         (SELECT count(*)::int FROM password_credentials WHERE user_id = $1) AS credentials,
         (SELECT count(*)::int FROM saves_kv WHERE user_id = $1) AS saves,
         (SELECT count(*)::int FROM server_feed WHERE user_id = $1) AS feed`,
      [E2E_ACCOUNT_USER_ID],
    );
    return result.rows[0] as {
      users: number;
      credentials: number;
      saves: number;
      feed: number;
    };
  } finally {
    await pool.end();
  }
}

/**
 * 신규 모험가의 첫 전직 경계만 재현한다. 실제 생성 경로로 만들어진 character.v2에서
 * 레벨만 바꾸며, loopback adventure_e2e 외 DB에서는 assert가 먼저 중단한다.
 */
export async function setAuthenticatedE2eCharacterLevel(level: number) {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error(`Invalid E2E character level: ${level}`);
  }
  const databaseUrl = assertIsolatedE2eDatabaseUrl(process.env.DATABASE_URL);
  const pool = new pg.Pool({
    ...createDatabaseConnectionOptions(databaseUrl),
    max: 1,
  });

  try {
    const result = await pool.query(
      `UPDATE saves_kv
       SET value = jsonb_set(value, '{level}', to_jsonb($2::int), true),
           version = version + 1,
           updated_at = now()
       WHERE user_id = $1 AND key = 'character.v2'
       RETURNING user_id`,
      [E2E_ACCOUNT_USER_ID, level],
    );
    if (result.rowCount !== 1) {
      throw new Error("The E2E character save is missing");
    }
  } finally {
    await pool.end();
  }
}

/**
 * 3차 접근성 흐름에 필요한 레벨·골드·재료를 격리 E2E DB에만 고정한다.
 * 운영에서 숨겨져야 하는 dev 지급 라우트를 브라우저 서버에 노출하지 않는다.
 */
export async function seedAuthenticatedE2ePhaseThreeState() {
  const databaseUrl = assertIsolatedE2eDatabaseUrl(process.env.DATABASE_URL);
  const pool = new pg.Pool({
    ...createDatabaseConnectionOptions(databaseUrl),
    max: 1,
  });

  try {
    const result = await pool.query(
      `UPDATE saves_kv
       SET value = jsonb_set(
             jsonb_set(
               jsonb_set(value, '{level}', to_jsonb($2::int), true),
               '{gold}',
               to_jsonb($3::int),
               true
             ),
             '{materials}',
             COALESCE(value->'materials', '{}'::jsonb) ||
               jsonb_build_object('v2_timber', $4::int, 'v2_iron_ore', $5::int),
             true
           ),
           version = version + 1,
           updated_at = now()
       WHERE user_id = $1 AND key = 'character.v2'
       RETURNING user_id`,
      [E2E_ACCOUNT_USER_ID, 30, 20_000_000, 100, 100],
    );
    if (result.rowCount !== 1) {
      throw new Error("The E2E character save is missing");
    }
  } finally {
    await pool.end();
  }
}
