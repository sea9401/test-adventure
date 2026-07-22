// 일회성 진단 스크립트 — 플루의 sim 적용 여부 추적용 상세 dump.
import { Pool } from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";

const name = process.argv[2];
if (!name) {
  console.error("usage: node scripts/inspect-user.mjs <nickname>");
  process.exit(1);
}

const pool = new Pool({
  ...createDatabaseConnectionOptions(process.env.DATABASE_URL),
});

async function main() {
  const { rows: matches } = await pool.query(
    `
    SELECT u.id, u.created_at, u.active_session_id, pres.last_seen_at, pres.name AS presence_name, pres.class_name
    FROM users u
    LEFT JOIN saves_kv p ON p.user_id = u.id AND p.key = 'character-profile.v2'
    LEFT JOIN presence pres ON pres.user_id = u.id
    WHERE lower(u.name) = lower($1) OR lower(p.value->>'name') = lower($1)
  `,
    [name],
  );

  for (const m of matches) {
    console.log(`\n========== ${m.id} ==========`);
    console.log(JSON.stringify(m, null, 2));

    // 모든 키의 updated_at + version 시간순
    const { rows: keys } = await pool.query(
      `SELECT key, version, updated_at FROM saves_kv WHERE user_id = $1 ORDER BY updated_at DESC`,
      [m.id],
    );
    console.log("\n--- save keys (updated_at DESC) ---");
    for (const r of keys) console.log(r);

    // inventory raw — 실제 보유량
    const { rows: ir } = await pool.query(
      `SELECT value FROM saves_kv WHERE user_id = $1 AND key = 'inventory.v2'`,
      [m.id],
    );
    console.log("\n--- inventory.v2 raw ---");
    console.log(JSON.stringify(ir[0]?.value, null, 2));

    // training raw — 스탯 분배 흔적
    const { rows: tr } = await pool.query(
      `SELECT value FROM saves_kv WHERE user_id = $1 AND key = 'training.v2'`,
      [m.id],
    );
    console.log("\n--- training.v2 raw ---");
    console.log(JSON.stringify(tr[0]?.value, null, 2));

    // adventure-log 의 monsters 누적 처치 톱 5
    const { rows: lr } = await pool.query(
      `SELECT value FROM saves_kv WHERE user_id = $1 AND key = 'adventure-log.v2'`,
      [m.id],
    );
    const monsters = lr[0]?.value?.monsters ?? {};
    const sorted = Object.entries(monsters)
      .filter(([, v]) => (v?.kills ?? 0) > 0)
      .sort((a, b) => (b[1].kills ?? 0) - (a[1].kills ?? 0))
      .slice(0, 10);
    console.log("\n--- 누적 처치 톱 10 ---");
    for (const [n, v] of sorted) console.log(`  ${n}: ${v.kills}회`);
    console.log(
      "battleLosses:",
      lr[0]?.value?.battleLosses,
      "healingCount:",
      lr[0]?.value?.healingCount,
      "chatCount:",
      lr[0]?.value?.chatCount,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
