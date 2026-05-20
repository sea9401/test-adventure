import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// DATABASE_URL 은 EC2 의 .env.production.local 에서 주입.
// 로컬 개발은 .env.development.local 에 Aurora endpoint 작성.
let pool: Pool | null = null;
function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. .env.development.local 에 Aurora endpoint 작성 필요.",
    );
  }
  // Aurora / RDS 모두 TLS 강제. 같은 VPC 내부 통신이라 CA 검증 생략(rejectUnauthorized:false).
  // 외부 망에서 접근시키게 되면 RDS CA bundle 로 `ssl.ca` 채워야 함.
  //
  // 풀 가드 — 한 트랜잭션이 멈춰(좀비) 커넥션을 영영 쥐거나 쿼리가 폭주하면 풀이 고갈돼
  // 이후 모든 요청이 커넥션을 못 받아 서버 전체가 멈추는 사고를 막는다. 기본값은 가드가
  // 전혀 없어 무한 대기였다. 마이그레이션은 migrate.mjs 의 별도 Pool(가드 없음)로 도니
  // 여기 statement_timeout 의 영향을 받지 않는다.
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    // 동시 커넥션 상한 — 단일 노드 프로세스 + 작은 RDS 인스턴스에 맞춰 보수적으로.
    max: 10,
    // 풀이 다 찼을 때 무한 대기 대신 빠르게 실패 → 요청이 "영원히 로딩" 대신 에러로 끝남.
    connectionTimeoutMillis: 10_000,
    // 유휴 커넥션 회수.
    idleTimeoutMillis: 30_000,
    // 단일 쿼리가 30초를 넘기면 중단 — 폭주 쿼리가 커넥션을 점유하는 것 방지.
    statement_timeout: 30_000,
    // "idle in transaction" 좀비 커넥션 자동 회수 — 길드 회관 데드락(#431) 같은
    // 사고에서 풀 고갈로 번지는 핵심 경로 차단.
    idle_in_transaction_session_timeout: 30_000,
  });
  return pool;
}

// 호출 시점에 환경변수를 검증. 빌드 타임에는 import 만 되고 실제 연결은 안 함.
// drizzle 인스턴스는 lazy 1회 생성 후 캐시 — 매 프로퍼티 접근마다 새로 만들면
// 고 RPS 에서 무의미한 GC 부담이 쌓인다.
let cachedDb: ReturnType<typeof drizzle> | null = null;
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    if (!cachedDb) cachedDb = drizzle(getPool(), { schema });
    return Reflect.get(cachedDb, prop);
  },
});

// `@auth/drizzle-adapter` 는 `is(db, PgDatabase)` 로 dialect 를 판별하는데,
// 이 검사는 `Object.getPrototypeOf(value).constructor` 체인을 따라간다 — 위 Proxy 는
// 타깃이 `{}` 라 체인이 끊겨 "Unsupported database type" 으로 throw 된다.
// 어댑터에는 실제 drizzle 인스턴스를 넘긴다 (요청 시점에만 호출 → 빌드 타임 DATABASE_URL 불필요).
export function rawDb(): ReturnType<typeof drizzle> {
  return drizzle(getPool(), { schema });
}

export { schema };
