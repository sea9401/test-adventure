import { createHash, randomBytes } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import pg from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";

const args = parseArgs(process.argv.slice(2));
const required = ["slug", "name", "before", "starts-at", "output"];
for (const key of required) {
  if (!args[key]) usage(`--${key} is required`);
}

const slug = requireMatch(args.slug, /^[a-z0-9][a-z0-9-]{2,48}$/, "slug");
const name = requireText(args.name, "name", 80);
const cutoffBefore = requireDate(args.before, "before");
const cutoffAfter = args.after ? requireDate(args.after, "after") : null;
const startsAt = requireDate(args["starts-at"], "starts-at");
const endsAt = args["ends-at"] ? requireDate(args["ends-at"], "ends-at") : null;
if (endsAt && endsAt <= startsAt) usage("--ends-at must be later than --starts-at");
const outputPath = requireText(args.output, "output", 500);
const prefix = requireMatch((args.prefix || "BETA").toUpperCase(), /^[A-Z0-9]{2,10}$/, "prefix");
const transferable = args.transferable === true;
const deliverInbox = args["deliver-inbox"] === true;
const audience = args.audience ?? "all";
if (!new Set(["all", "kakao", "google-only"]).has(audience)) {
  usage("--audience must be one of: all, kakao, google-only");
}
if (deliverInbox && audience !== "kakao") {
  usage("--deliver-inbox requires --audience kakao");
}
const message = args.message ? requireText(args.message, "message", 300) : null;
const titleId = args.title
  ? requireMatch(args.title, /^[a-z0-9][a-z0-9_]{1,63}$/, "title")
  : null;

const reward = {
  gold: amount(args.gold, "gold", 1_000_000),
  materials: [],
  items: [],
  staminaPotions: amount(args["stamina-potions"], "stamina-potions", 1_000_000),
  museunCoins: amount(args["museun-coins"], "museun-coins", 1_000_000),
  cashItems: [
    cosmeticBox("chroma_name_box", args["chroma-name-boxes"], "chroma-name-boxes"),
    cosmeticBox("profile_border_box", args["profile-border-boxes"], "profile-border-boxes"),
    cosmeticBox("chat_badge_box", args["chat-badge-boxes"], "chat-badge-boxes"),
  ].filter(Boolean),
  adventureSupportDays: amount(args["adventure-support-days"], "adventure-support-days", 3650),
  titleIds: titleId ? [titleId] : [],
};
if (
  reward.gold +
    reward.staminaPotions +
    reward.museunCoins +
    reward.adventureSupportDays === 0 &&
    reward.cashItems.length === 0 &&
  reward.titleIds.length === 0
) {
  usage("at least one reward option must be greater than zero");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) usage("DATABASE_URL is required");

// 기존 파일을 덮어쓰지 않는다. 발급 코드는 DB에 평문으로 남지 않으므로 CSV 유실을 막는다.
await writeFile(outputPath, "", { flag: "wx", mode: 0o600 }).catch((error) => {
  if (error?.code === "EEXIST") usage(`output already exists: ${outputPath}`);
  throw error;
});

const pool = new pg.Pool({
  ...createDatabaseConnectionOptions(databaseUrl),
  max: 1,
});
let client;
let committed = false;

try {
  client = await pool.connect();
  await client.query("BEGIN");
  const insertedCampaign = await client.query(
    `INSERT INTO coupon_campaigns (slug, name, reward, message, starts_at, ends_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     ON CONFLICT (slug) DO NOTHING
     RETURNING id`,
    [slug, name, JSON.stringify(reward), message, startsAt, endsAt],
  );
  let campaignId = insertedCampaign.rows[0]?.id;
  if (!campaignId) {
    const existing = await client.query(
      `SELECT id, name, reward, message, starts_at, ends_at
         FROM coupon_campaigns WHERE slug = $1 FOR UPDATE`,
      [slug],
    );
    const campaign = existing.rows[0];
    if (!campaign || !sameCampaign(campaign, { name, reward, message, startsAt, endsAt })) {
      throw new Error(`campaign '${slug}' already exists with different settings`);
    }
    campaignId = campaign.id;
  }

  const params = [cutoffBefore];
  const afterSql = cutoffAfter ? `AND u.created_at >= $${params.push(cutoffAfter)}` : "";
  const audienceSql =
    audience === "kakao"
      ? `AND EXISTS (
           SELECT 1 FROM accounts a
            WHERE a.user_id = u.id AND a.provider = 'kakao'
         )`
      : audience === "google-only"
        ? `AND EXISTS (
             SELECT 1 FROM accounts a
              WHERE a.user_id = u.id AND a.provider = 'google'
           )
           AND NOT EXISTS (
             SELECT 1 FROM accounts a
              WHERE a.user_id = u.id AND a.provider = 'kakao'
           )`
        : "";
  const eligible = await client.query(
    `SELECT u.id, u.email, u.game_name
       FROM users u
      WHERE u.created_at < $1
        ${afterSql}
        ${audienceSql}
        AND EXISTS (
          SELECT 1 FROM saves_kv s
           WHERE s.user_id = u.id AND s.key = 'character.v2'
        )
      ORDER BY u.created_at, u.id`,
    params,
  );
  const alreadyIssued = await client.query(
    `SELECT issued_for_user_id
       FROM coupon_codes
      WHERE campaign_id = $1 AND issued_for_user_id IS NOT NULL`,
    [campaignId],
  );
  const issuedIds = new Set(alreadyIssued.rows.map((row) => row.issued_for_user_id));
  const rows = [];

  for (const user of eligible.rows) {
    if (issuedIds.has(user.id)) continue;
    for (;;) {
      const code = generateCode(prefix);
      const normalized = code.replaceAll("-", "");
      const codeHash = createHash("sha256").update(normalized, "utf8").digest("hex");
      try {
        await client.query(
          `INSERT INTO coupon_codes
             (campaign_id, code_hash, code_suffix, issued_for_user_id, restricted_user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [campaignId, codeHash, normalized.slice(-4), user.id, transferable ? null : user.id],
        );
        if (deliverInbox) {
          await client.query(
            `INSERT INTO marketplace_inbox
               (user_id, kind, payload, from_name)
             VALUES ($1, 'user_message', $2::jsonb, '운영자')`,
            [user.id, JSON.stringify({ text: inboxCodeMessage(name, code, startsAt) })],
          );
        }
        rows.push({ userId: user.id, email: user.email, gameName: user.game_name ?? "", code });
        break;
      } catch (error) {
        // 암호학적으로 희박한 hash 충돌만 새 코드로 재시도한다.
        if (error?.code === "23505" && error?.constraint === "coupon_codes_hash_idx") continue;
        throw error;
      }
    }
  }

  const csv = [
    "user_id,email,game_name,coupon_code",
    ...rows.map((row) =>
      [row.userId, row.email, row.gameName, row.code].map(csvCell).join(","),
    ),
  ].join("\n");
  await writeFile(outputPath, `${csv}\n`, { mode: 0o600 });
  await client.query("COMMIT");
  committed = true;

  console.error(
    `✓ ${name}: eligible ${eligible.rowCount}, newly issued ${rows.length}, ` +
      `already issued ${issuedIds.size}, mode ${transferable ? "transferable" : "account-bound"}`,
  );
  console.error(`✓ audience ${audience}, delivery ${deliverInbox ? "inbox+csv" : "csv"}`);
  console.error(`✓ CSV saved with owner-only permissions: ${outputPath}`);
} catch (error) {
  if (client && !committed) {
    await client.query("ROLLBACK").catch(() => {});
  }
  if (!committed) await unlink(outputPath).catch(() => {});
  throw error;
} finally {
  client?.release();
  await pool.end();
}

function generateCode(prefix) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  let body = "";
  for (const byte of bytes) body += alphabet[byte & 31];
  return `${prefix}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12)}`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) usage(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "transferable" || key === "deliver-inbox") {
      parsed[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) usage(`missing value for --${key}`);
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

function amount(value, label, max) {
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    usage(`--${label} must be an integer between 0 and ${max}`);
  }
  return parsed;
}

function cosmeticBox(itemId, value, label) {
  const count = amount(value, label, 1_000_000);
  return count > 0 ? { itemId, count } : null;
}

function requireDate(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) usage(`--${label} must be an ISO date`);
  return date;
}

function requireText(value, label, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) usage(`--${label} must be 1-${maxLength} characters`);
  return text;
}

function requireMatch(value, pattern, label) {
  const text = requireText(value, label, 80);
  if (!pattern.test(text)) usage(`invalid --${label}: ${text}`);
  return text;
}

function sameCampaign(existing, expected) {
  return (
    existing.name === expected.name &&
    stableJson(existing.reward) === stableJson(expected.reward) &&
    (existing.message ?? null) === expected.message &&
    new Date(existing.starts_at).getTime() === expected.startsAt.getTime() &&
    nullableDateMs(existing.ends_at) === nullableDateMs(expected.endsAt)
  );
}

function nullableDateMs(value) {
  return value == null ? null : new Date(value).getTime();
}

function inboxCodeMessage(campaignName, code, startsAtDate) {
  const startsAtLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(startsAtDate);
  return (
    `${campaignName}\n` +
    `쿠폰 코드: ${code}\n` +
    `사용 시작: ${startsAtLabel}\n` +
    "설정 → 이벤트 → 쿠폰 등록에서 입력해주세요."
  );
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function usage(error) {
  if (error) console.error(`✗ ${error}\n`);
  console.error(
    "Usage: node scripts/issue-beta-coupons.mjs \\\n" +
      "  --slug beta-2026 --name '베타 테스터 감사 선물' \\\n" +
      "  --before 2026-08-01T13:00:00+09:00 \\\n" +
      "  --starts-at 2026-08-01T13:00:00+09:00 \\\n" +
      "  --title pre_open_regular --stamina-potions 15 \\\n" +
      "  --chroma-name-boxes 2 --chat-badge-boxes 2 --profile-border-boxes 1 \\\n" +
      "  --audience kakao --deliver-inbox --output ./beta-coupons-kakao.csv\n\n" +
      "Rewards: --title, --gold, --museun-coins, --stamina-potions, --adventure-support-days,\n" +
      "         --chroma-name-boxes, --chat-badge-boxes, --profile-border-boxes\n" +
      "Options: --after <ISO>, --ends-at <ISO>, --audience <all|kakao|google-only>,\n" +
      "         --deliver-inbox, --prefix <2-10 chars>, --message <text>, --transferable",
  );
  process.exit(1);
}
