import { randomUUID } from "node:crypto";
import pg from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";
import {
  PASSWORD_ACCOUNT_MAX_PASSWORD_LENGTH,
  PASSWORD_ACCOUNT_MIN_PASSWORD_LENGTH,
  hashPasswordAccountPassword,
  isValidPasswordAccountPassword,
  normalizePasswordAccountLoginId,
} from "../src/lib/passwordCredentialCore.mjs";

const loginIdInput = process.argv[2];
const password = process.env.PASSWORD_ACCOUNT_PASSWORD;
delete process.env.PASSWORD_ACCOUNT_PASSWORD;

const parsedLoginId = normalizePasswordAccountLoginId(loginIdInput);
if (!parsedLoginId) {
  console.error(
    "Usage: PASSWORD_ACCOUNT_PASSWORD=... npm run account:create -- <login-id>\n" +
      "Login IDs must be 3-32 ASCII letters, numbers, dots, underscores, or hyphens.",
  );
  process.exit(1);
}
if (!isValidPasswordAccountPassword(password)) {
  console.error(
    `PASSWORD_ACCOUNT_PASSWORD must be ${PASSWORD_ACCOUNT_MIN_PASSWORD_LENGTH}-${PASSWORD_ACCOUNT_MAX_PASSWORD_LENGTH} characters.`,
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const userId = randomUUID();
const email = `credential-${userId}@accounts.msmsge.invalid`;
const passwordHash = await hashPasswordAccountPassword(password);
const pool = new pg.Pool({
  ...createDatabaseConnectionOptions(databaseUrl),
  max: 1,
});
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO users (id, name, email, created_at, updated_at)
     VALUES ($1, $2, $3, now(), now())`,
    [userId, parsedLoginId.loginId, email],
  );
  await client.query(
    `INSERT INTO password_credentials
       (user_id, login_id, normalized_login_id, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [
      userId,
      parsedLoginId.loginId,
      parsedLoginId.normalizedLoginId,
      passwordHash,
    ],
  );
  await client.query("COMMIT");
  console.log(
    `✓ password account created: ${parsedLoginId.loginId} (${userId})`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  if (error && typeof error === "object" && error.code === "23505") {
    console.error(`✗ login ID already exists: ${parsedLoginId.loginId}`);
    process.exitCode = 2;
  } else {
    throw error;
  }
} finally {
  client.release();
  await pool.end();
}
