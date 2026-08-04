import { Pool } from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";

function failUsage(message) {
  console.error(message);
  console.error(
    "usage: node scripts/create-test-guild.mjs --character '[운영자]' --guild test --confirm",
  );
  process.exit(1);
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1]?.trim();
  if (!value || value.startsWith("--")) failUsage(`${name} 값이 필요합니다.`);
  return value;
}

const characterName = option("--character", "[운영자]");
const guildName = option("--guild", "test");
if (!process.argv.includes("--confirm")) {
  failUsage("실제 생성을 승인하려면 --confirm 을 지정하세요.");
}
if (!process.env.DATABASE_URL) failUsage("DATABASE_URL이 필요합니다.");
if (guildName.length < 2 || guildName.length > 18) {
  failUsage("길드 이름은 2~18자여야 합니다.");
}

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
if (adminEmails.size === 0) failUsage("ADMIN_EMAILS가 비어 있습니다.");

const pool = new Pool({
  ...createDatabaseConnectionOptions(process.env.DATABASE_URL),
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      `
        SELECT
          u.id,
          u.email,
          COALESCE(u.game_name, p.value->>'name') AS game_name
        FROM users u
        LEFT JOIN saves_kv p
          ON p.user_id = u.id AND p.key = 'character-profile.v2'
        WHERE lower(COALESCE(u.game_name, p.value->>'name')) = lower($1)
        FOR UPDATE OF u
      `,
      [characterName],
    );
    if (userResult.rowCount !== 1) {
      throw new Error(
        `${characterName} 캐릭터 조회 결과가 ${userResult.rowCount}건입니다. 정확히 1건이어야 합니다.`,
      );
    }
    const user = userResult.rows[0];
    if (!adminEmails.has(String(user.email).toLowerCase())) {
      throw new Error(`${characterName} 계정이 ADMIN_EMAILS 운영자 계정이 아닙니다.`);
    }

    const membership = await client.query(
      `
        SELECT g.id, g.name, g.is_test
        FROM guild_members gm
        JOIN guilds g ON g.id = gm.guild_id
        WHERE gm.user_id = $1
        LIMIT 1
      `,
      [user.id],
    );
    if (membership.rowCount > 0) {
      const guild = membership.rows[0];
      if (guild.is_test === true && String(guild.name).toLowerCase() === guildName.toLowerCase()) {
        await client.query("COMMIT");
        console.log(`✓ 이미 운영 테스트 길드 '${guild.name}'(ID ${guild.id})에 소속되어 있습니다.`);
        return;
      }
      throw new Error(
        `${characterName} 캐릭터가 이미 '${guild.name}' 길드에 소속되어 있습니다.`,
      );
    }

    const duplicate = await client.query(
      `SELECT id, name FROM guilds WHERE lower(name) = lower($1) LIMIT 1`,
      [guildName],
    );
    if (duplicate.rowCount > 0) {
      throw new Error(`'${guildName}' 길드 이름이 이미 사용 중입니다.`);
    }

    const inserted = await client.query(
      `
        INSERT INTO guilds (name, master_id, accepting_requests, is_test)
        VALUES ($1, $2, false, true)
        RETURNING id
      `,
      [guildName, user.id],
    );
    const guildId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO guild_members (guild_id, user_id, role) VALUES ($1, $2, 'master')`,
      [guildId, user.id],
    );
    await client.query(
      `
        UPDATE outpost_occupations
        SET occupied_by_guild_id = $1
        WHERE occupied_by_user_id = $2
          AND occupied_by_guild_id IS NULL
          AND outpost_id LIKE 'tile:%'
      `,
      [guildId, user.id],
    );
    await client.query(
      `
        INSERT INTO guild_activity_log (guild_id, type, actor_user_id)
        VALUES ($1, 'guild_create', $2)
      `,
      [guildId, user.id],
    );
    await client.query("COMMIT");
    console.log(
      `✓ ${characterName} 캐릭터의 운영 테스트 길드 '${guildName}'(ID ${guildId})를 만들었습니다.`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
