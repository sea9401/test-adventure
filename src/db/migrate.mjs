// 빌드 시 또는 수동으로 실행되는 마이그레이션 러너.
// drizzle-kit generate 가 만든 ./drizzle/*.sql 을 순서대로 적용한다.
//
// 사용:
//   prebuild 훅: npm run db:migrate
//   로컬: node --env-file=.env.development.local src/db/migrate.mjs
//   prod 1회: node --env-file=/run/adventure-rpg/production.env src/db/migrate.mjs
//
// 동작:
//   - drizzle.__drizzle_migrations 테이블 보고 미적용 항목만 실행 (idempotent).
//   - 각 migration 은 트랜잭션 — 실패 시 롤백.
//   - migrate() 내부에서 advisory lock 으로 동시 실행 직렬화.

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { existsSync } from "node:fs";
import { createDatabaseConnectionOptions } from "./databaseTls.mjs";

// drizzle/ 폴더가 아직 없으면(첫 generate 이전) 무중단 종료.
if (!existsSync("./drizzle/meta/_journal.json")) {
  console.log("→ ./drizzle 마이그레이션 없음 — skip");
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  // CI 빌드면 strict — DB 없이 빌드 끝내면 위험.
  // 로컬은 graceful skip — DB 없이 그냥 next build 만 확인하는 경우 허용.
  if (process.env.CI) {
    console.error("✗ DATABASE_URL not set in CI — env 설정 필요");
    process.exit(1);
  }
  console.warn("⚠ DATABASE_URL not set — migration skipped (로컬 빌드 가정)");
  process.exit(0);
}

const pool = new Pool({
  ...createDatabaseConnectionOptions(url),
});
try {
  console.log("→ migrations 적용 시작…");
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ migrations 적용 완료");
} catch (err) {
  console.error("✗ migration 실패:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
