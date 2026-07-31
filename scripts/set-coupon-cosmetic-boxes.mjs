import pg from "pg";
import { createDatabaseConnectionOptions } from "../src/db/databaseTls.mjs";

const BOXES = [
  {
    arg: "chroma-name-boxes",
    itemId: "chroma_name_box",
    name: "닉네임 꾸미기 상자",
  },
  {
    arg: "profile-border-boxes",
    itemId: "profile_border_box",
    name: "프로필 꾸미기 상자",
  },
  {
    arg: "chat-badge-boxes",
    itemId: "chat_badge_box",
    name: "채팅 배지 상자",
  },
];
const BOX_IDS = new Set(BOXES.map(({ itemId }) => itemId));
const MAX_COUNT = 1_000_000;

const args = parseArgs(process.argv.slice(2));
const slug = requireMatch(args.slug, /^[a-z0-9][a-z0-9-]{2,48}$/, "slug");
const desired = new Map(
  BOXES.map(({ arg, itemId }) => [itemId, requiredAmount(args[arg], arg)]),
);
const apply = args.apply === true;
const operator = apply ? requireText(args.operator, "operator", 200) : null;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) usage("DATABASE_URL is required");

const pool = new pg.Pool({
  ...createDatabaseConnectionOptions(databaseUrl),
  max: 1,
});
let client;
let committed = false;

try {
  client = await pool.connect();
  await client.query("BEGIN");

  const campaignResult = await client.query(
    `SELECT id, name, reward
       FROM coupon_campaigns
      WHERE slug = $1
      FOR UPDATE`,
    [slug],
  );
  const campaign = campaignResult.rows[0];
  if (!campaign) throw new Error(`campaign '${slug}' not found`);

  const reward = requireRewardObject(campaign.reward);
  const current = currentBoxCounts(reward.cashItems);
  const deltaItems = [];
  const nextCashItems = [];
  for (const box of BOXES) {
    const before = current.get(box.itemId) ?? 0;
    const after = desired.get(box.itemId) ?? 0;
    if (after < before) {
      throw new Error(
        `${box.arg} cannot decrease (${before} -> ${after}); already redeemed rewards cannot be retracted`,
      );
    }
    if (after > before) {
      deltaItems.push({ itemId: box.itemId, count: after - before });
    }
    if (after > 0) nextCashItems.push({ itemId: box.itemId, count: after });
  }

  const countsResult = await client.query(
    `SELECT count(*)::int AS issued,
            count(*) FILTER (WHERE redeemed_at IS NOT NULL)::int AS redeemed,
            count(*) FILTER (WHERE redeemed_at IS NULL)::int AS unredeemed
       FROM coupon_codes
      WHERE campaign_id = $1`,
    [campaign.id],
  );
  const counts = countsResult.rows[0];
  console.error(`Campaign: ${campaign.name} (${slug})`);
  console.error(
    `Codes: issued ${counts.issued}, redeemed ${counts.redeemed}, unredeemed ${counts.unredeemed}`,
  );
  for (const box of BOXES) {
    console.error(
      `${box.name}: ${current.get(box.itemId) ?? 0} -> ${desired.get(box.itemId) ?? 0}`,
    );
  }

  if (deltaItems.length === 0) {
    await client.query("ROLLBACK");
    console.error("No changes needed; the campaign already has the requested quantities.");
  } else if (!apply) {
    await client.query("ROLLBACK");
    console.error("Dry run only. Re-run with --apply --operator <email> after deployment.");
  } else {
    const nextReward = { ...reward, cashItems: nextCashItems };
    await client.query(
      `UPDATE coupon_campaigns SET reward = $2::jsonb WHERE id = $1`,
      [campaign.id, JSON.stringify(nextReward)],
    );

    const addendumPayload = {
      gold: 0,
      materials: [],
      items: [],
      staminaPotions: 0,
      museunCoins: 0,
      cashItems: deltaItems,
      adventureSupportDays: 0,
    };
    const message = `${campaign.name} 쿠폰에 꾸미기 상자 보상이 추가되었습니다.`;
    const inboxResult = await client.query(
      `INSERT INTO marketplace_inbox (user_id, kind, payload, message, from_name)
       SELECT redeemed_by_user_id, 'admin_gift', $2::jsonb, $3, '운영자'
         FROM coupon_codes
        WHERE campaign_id = $1 AND redeemed_at IS NOT NULL
        ORDER BY id`,
      [campaign.id, JSON.stringify(addendumPayload), message],
    );
    await client.query(
      `INSERT INTO economy_events
         (user_id, event_type, item_kind, item_id, quantity, detail)
       SELECT redeemed_by_user_id, 'coupon.reward_addendum', 'coupon_campaign', $2, 1,
              jsonb_build_object('campaignId', $1::integer, 'codeId', id, 'cashItems', $3::jsonb)
         FROM coupon_codes
        WHERE campaign_id = $1 AND redeemed_at IS NOT NULL
        ORDER BY id`,
      [campaign.id, slug, JSON.stringify(deltaItems)],
    );
    await client.query(
      `INSERT INTO admin_audit_log (admin_email, action, detail)
       VALUES ($1, 'coupon.cosmetic-boxes.set', $2::jsonb)`,
      [
        operator,
        JSON.stringify({
          campaignId: campaign.id,
          slug,
          before: Object.fromEntries(current),
          after: Object.fromEntries(desired),
          deltaItems,
          compensatedRedeemedCodes: inboxResult.rowCount,
        }),
      ],
    );

    await client.query("COMMIT");
    committed = true;
    console.error(
      `Applied campaign reward update and sent ${inboxResult.rowCount} addendum mail(s).`,
    );
  }
} catch (error) {
  if (client && !committed) await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client?.release();
  await pool.end();
}

function currentBoxCounts(value) {
  if (value === undefined) return new Map();
  if (!Array.isArray(value)) throw new Error("campaign reward.cashItems must be an array");
  const counts = new Map();
  for (const item of value) {
    if (!item || typeof item !== "object" || !BOX_IDS.has(item.itemId)) {
      throw new Error("campaign has unsupported cashItems; refusing to overwrite them");
    }
    const count = optionalAmount(item.count, `cashItems.${item.itemId}`);
    if (count <= 0) throw new Error(`cashItems.${item.itemId} must be greater than zero`);
    const next = (counts.get(item.itemId) ?? 0) + count;
    if (next > MAX_COUNT) throw new Error(`cashItems.${item.itemId} exceeds ${MAX_COUNT}`);
    counts.set(item.itemId, next);
  }
  return counts;
}

function requireRewardObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("campaign reward must be a JSON object");
  }
  return value;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) usage(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "apply") {
      parsed.apply = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) usage(`missing value for --${key}`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function requiredAmount(value, label) {
  if (value === undefined) usage(`--${label} is required (use 0 for none)`);
  return optionalAmount(value, label);
}

function optionalAmount(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_COUNT) {
    usage(`--${label} must be an integer between 0 and ${MAX_COUNT}`);
  }
  return parsed;
}

function requireMatch(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) usage(`invalid --${label}`);
  return value;
}

function requireText(value, label, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    usage(`--${label} is required and must be at most ${maxLength} characters`);
  }
  return value.trim();
}

function usage(error) {
  if (error) console.error(`Error: ${error}\n`);
  console.error(
    "Usage: node scripts/set-coupon-cosmetic-boxes.mjs \\\n" +
      "  --slug beta-2026 --chroma-name-boxes 2 \\\n" +
      "  --chat-badge-boxes 2 --profile-border-boxes 1 [--apply --operator admin@example.com]\n\n" +
      "Without --apply the command locks briefly, prints a current-state preview, and rolls back.\n" +
      "Apply only after code supporting coupon cashItems has been deployed.",
  );
  process.exit(1);
}
