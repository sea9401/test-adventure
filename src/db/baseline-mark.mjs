// 일회성 부트스트랩 헬퍼.
//
// 상황: 기존 DB(prod, 또는 이미 사용 중인 dev)는 모든 테이블이 있는데
//      drizzle/__drizzle_migrations 테이블이 없어 migrator 가 처음부터 적용하려 한다.
//      그대로 두면 baseline migration 이 CREATE TABLE 에서 실패.
//
// 해결: 이 스크립트가 drizzle/<tag>.sql 들의 sha256 을 계산해
//      __drizzle_migrations 에 "이미 적용됨" 으로 INSERT.
//      migrator 는 이 row 보고 baseline 을 skip 하고 그 이후 migration 만 적용.
//
// 사용 (각 환경에 1회):
//   node --env-file=.env.production.local src/db/baseline-mark.mjs
//   node --env-file=.env.development.local src/db/baseline-mark.mjs
//
// 멱등 — 이미 표시된 hash 는 건너뜀. 새 migration 이 추가된 후엔 미적용분만 INSERT.
// 일반적으로 첫 1회만 실행하고, 이후 실수로 돌려도 안전하지만 실제 적용 안 된 migration 도
// 표시해버리는 부작용이 생길 수 있다 — 워크플로 정착 후엔 봉인 권장.

import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createDatabaseConnectionOptions } from "./databaseTls.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL not set — .env.*.local 필요");
  process.exit(1);
}

const pool = new Pool({
  ...createDatabaseConnectionOptions(url),
});
try {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  const files = (await readdir("./drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.error(
      "✗ ./drizzle 에 .sql 파일이 없음 — `npm run db:generate` 먼저 실행",
    );
    process.exit(1);
  }

  for (const file of files) {
    const content = await readFile(join("./drizzle", file), "utf-8");
    const hash = createHash("sha256").update(content).digest("hex");

    const { rows } = await pool.query(
      `SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1`,
      [hash],
    );
    if (rows.length > 0) {
      console.log(`= ${file} (이미 표시됨)`);
      continue;
    }
    await pool.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, Date.now()],
    );
    console.log(`✓ ${file} 적용된 것으로 표시`);
  }
  console.log("\n→ 이제 npm run db:migrate 가 idempotent. 신규 추가분만 적용됨.");
} catch (err) {
  console.error("✗ baseline-mark 실패:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
