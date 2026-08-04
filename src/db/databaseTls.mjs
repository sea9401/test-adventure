import { readFileSync } from "node:fs";

const SSL_QUERY_PARAMS = [
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "sslpassword",
];

/**
 * node-postgres는 connectionString의 sslmode/sslrootcert를 해석하면서 별도로 전달한
 * ssl 객체를 덮어쓸 수 있다. URL 쪽 TLS 옵션을 제거하고 아래의 검증 설정만 사용한다.
 */
export function normalizeDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use postgres or postgresql scheme");
  }
  for (const parameter of SSL_QUERY_PARAMS) url.searchParams.delete(parameter);
  return url.toString();
}

/**
 * CA 경로가 있으면 해당 번들만 신뢰하고, 없으면 Node의 시스템 trust store를 쓴다.
 * 어떤 경우에도 서버 인증서와 호스트명 검증은 끄지 않는다.
 * @param {Record<string, string | undefined>} env
 */
export function createDatabaseSslOptions(env = process.env) {
  const caPath = env.DATABASE_CA_CERT_PATH?.trim();
  if (!caPath) return { rejectUnauthorized: true };

  let ca;
  try {
    ca = readFileSync(caPath, "utf8");
  } catch (error) {
    throw new Error(`DATABASE_CA_CERT_PATH cannot be read: ${caPath}`, {
      cause: error,
    });
  }
  if (!ca.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error("DATABASE_CA_CERT_PATH does not contain a PEM certificate");
  }
  return { rejectUnauthorized: true, ca };
}

/** @param {string} hostname */
export function isLoopbackDatabaseHostname(hostname) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return ["localhost", "127.0.0.1", "::1"].includes(normalized);
}

/**
 * GitHub Actions의 컨테이너 잡에서는 PostgreSQL 서비스가 Docker 네트워크의
 * `postgres` 호스트명으로 노출된다. 두 CI 표식이 모두 있는 격리 실행에서만
 * 이 정확한 서비스 이름을 로컬 테스트 DB로 인정한다.
 * @param {string} hostname
 * @param {Record<string, string | undefined>} env
 */
export function isGitHubActionsTestDatabaseHostname(hostname, env) {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "postgres" &&
    env.CI?.trim().toLowerCase() === "true" &&
    env.GITHUB_ACTIONS?.trim().toLowerCase() === "true"
  );
}

/**
 * @param {string} value
 * @param {Record<string, string | undefined>} env
 */
export function createDatabaseConnectionOptions(value, env = process.env) {
  const connectionString = normalizeDatabaseUrl(value);
  if (env.DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS?.trim().toLowerCase() === "true") {
    const { hostname } = new URL(connectionString);
    if (
      !isLoopbackDatabaseHostname(hostname) &&
      !isGitHubActionsTestDatabaseHostname(hostname, env)
    ) {
      throw new Error(
        "DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS is only allowed for loopback or GitHub Actions test database hosts",
      );
    }
    return { connectionString, ssl: false };
  }

  return {
    connectionString,
    ssl: createDatabaseSslOptions(env),
  };
}
