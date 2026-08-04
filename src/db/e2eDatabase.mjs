import {
  isGitHubActionsTestDatabaseHostname,
  isLoopbackDatabaseHostname,
  normalizeDatabaseUrl,
} from "./databaseTls.mjs";
import {
  isValidPasswordAccountPassword,
  normalizePasswordAccountLoginId,
} from "../lib/passwordCredentialCore.mjs";

export const E2E_DATABASE_NAME = "adventure_e2e";
export const E2E_ACCOUNT_USER_ID = "00000000-0000-4000-8000-000000000001";
export const E2E_ACCOUNT_EMAIL = "browser-e2e@accounts.msmsge.invalid";

/**
 * Seed 작업이 운영·공유 DB에 닿지 않도록 주소와 DB 이름을 모두 제한한다.
 * @param {unknown} value
 * @param {Record<string, string | undefined>} env
 */
export function assertIsolatedE2eDatabaseUrl(value, env = process.env) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("DATABASE_URL is required for E2E database setup");
  }

  const connectionString = normalizeDatabaseUrl(value);
  const url = new URL(connectionString);
  if (
    !isLoopbackDatabaseHostname(url.hostname) &&
    !isGitHubActionsTestDatabaseHostname(url.hostname, env)
  ) {
    throw new Error(
      "E2E database setup is only allowed on a loopback or GitHub Actions test host",
    );
  }
  if (decodeURIComponent(url.pathname) !== `/${E2E_DATABASE_NAME}`) {
    throw new Error(
      `E2E database setup requires the dedicated ${E2E_DATABASE_NAME} database`,
    );
  }
  return connectionString;
}

/** @param {Record<string, string | undefined>} env */
export function readE2eAccountConfig(env = process.env) {
  const parsedLoginId = normalizePasswordAccountLoginId(env.E2E_TEST_LOGIN_ID);
  if (!parsedLoginId) {
    throw new Error("E2E_TEST_LOGIN_ID must be a valid password-account login ID");
  }
  if (!isValidPasswordAccountPassword(env.E2E_TEST_PASSWORD)) {
    throw new Error("E2E_TEST_PASSWORD must be a valid password-account password");
  }
  return {
    ...parsedLoginId,
    password: env.E2E_TEST_PASSWORD,
  };
}
