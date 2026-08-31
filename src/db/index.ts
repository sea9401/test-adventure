import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { createDatabaseConnectionOptions } from "./databaseTls.mjs";
import { createPoolRuntime } from "./poolRuntime";
import { instrumentRuntimeDatabasePool } from "@/lib/server/runtimeProfiler/runtime";

// DATABASE_URL 은 운영에서 AWS SSM을 거친 systemd 런타임 환경으로 주입.
// 로컬 개발은 .env.development.local 에 Aurora endpoint 작성.
type Database = ReturnType<typeof drizzle>;

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. .env.development.local 에 Aurora endpoint 작성 필요.",
    );
  }
  // TLS는 항상 서버 인증서와 호스트명을 검증한다. RDS는
  // DATABASE_CA_CERT_PATH의 AWS CA bundle을 사용하고, 그 밖의 DB는 시스템 trust store를 쓴다.
  //
  // 풀 가드 — 한 트랜잭션이 멈춰(좀비) 커넥션을 영영 쥐거나 쿼리가 폭주하면 풀이 고갈돼
  // 이후 모든 요청이 커넥션을 못 받아 서버 전체가 멈추는 사고를 막는다. 기본값은 가드가
  // 전혀 없어 무한 대기였다. 마이그레이션은 migrate.mjs 의 별도 Pool(가드 없음)로 도니
  // 여기 statement_timeout 의 영향을 받지 않는다.
  const pool = new Pool({
    ...createDatabaseConnectionOptions(url),
    // 동시 커넥션 상한 — 단일 노드 프로세스 + 작은 RDS 인스턴스에 맞춰 보수적으로.
    max: 10,
    // 풀이 다 찼을 때 무한 대기 대신 빠르게 실패 → 요청이 "영원히 로딩" 대신 에러로 끝남.
    connectionTimeoutMillis: 10_000,
    // 서버가 쿼리를 받기 전 TCP 구간에서 멈춰도 클라이언트가 연결을 폐기한다.
    query_timeout: 15_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    application_name: "adventure-rpg",
    // 유휴 커넥션 회수.
    idleTimeoutMillis: 30_000,
    // 단일 쿼리가 30초를 넘기면 중단 — 폭주 쿼리가 커넥션을 점유하는 것 방지.
    statement_timeout: 30_000,
    // "idle in transaction" 좀비 커넥션 자동 회수 — 길드 회관 데드락(#431) 같은
    // 사고에서 풀 고갈로 번지는 핵심 경로 차단.
    idle_in_transaction_session_timeout: 30_000,
  });
  instrumentRuntimeDatabasePool(pool);
  return pool;
}

function createRuntime() {
  return createPoolRuntime<Pool, Database>({
    createPool,
    createDatabase: (pool) => drizzle(pool, { schema }),
    registerPoolErrorHandler: (pool, handler) => {
      pool.on("error", handler);
    },
    onPoolError: (metadata) => {
      console.error("[database] pool client error", metadata);
    },
    closePool: async (pool, reason) => {
      console.error(`[database] recycling pool: ${reason}`);
      await pool.end();
    },
    now: Date.now,
    recycleCooldownMs: 30_000,
    onCloseError: (error) => {
      console.error("[database] stale pool close failed", error);
    },
  });
}

type DatabaseRuntime = ReturnType<typeof createRuntime>;
declare global {
  // Next.js가 Route Handler별 서버 번들을 만들더라도 같은 프로세스에서는 풀 하나를 공유한다.
  var __adventureDatabaseRuntime: DatabaseRuntime | undefined;
}

function getRuntime(): DatabaseRuntime {
  globalThis.__adventureDatabaseRuntime ??= createRuntime();
  return globalThis.__adventureDatabaseRuntime;
}

function getDatabase(): Database {
  return getRuntime().getDatabase();
}

// 호출 시점에 환경변수를 검증. 빌드 타임에는 import 만 되고 실제 연결은 안 함.
export const db = new Proxy({} as Database, {
  get(_, prop) {
    return Reflect.get(getDatabase(), prop);
  },
});

// `@auth/drizzle-adapter` 는 `is(db, PgDatabase)` 로 dialect 를 판별하는데,
// 이 검사는 `Object.getPrototypeOf(value).constructor` 체인을 따라간다 — 위 Proxy 는
// 타깃이 `{}` 라 체인이 끊겨 "Unsupported database type" 으로 throw 된다.
// 어댑터에는 실제 drizzle 인스턴스를 넘긴다 (요청 시점에만 호출 → 빌드 타임 DATABASE_URL 불필요).
// NextAuth 팩토리가 요청마다 호출하므로 여기도 1회 생성 후 재사용 (Pool 은 어차피 공유).
export function rawDb(): Database {
  return getDatabase();
}

export function recycleDatabasePool(reason: string): boolean {
  return getRuntime().recycle(reason);
}

export { schema };
