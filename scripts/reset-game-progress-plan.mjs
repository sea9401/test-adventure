export const RESET_CONFIRMATION = "RESET-GAME-PROGRESS";

// Authentication identity, launch coupon definitions, and append-only operator evidence
// survive the reopening reset. User-facing inbox rows do not: users is updated in-place
// by the runner to clear only identity-independent game state.
export const PRESERVED_TABLES = Object.freeze([
  "abuse_events",
  "accounts",
  "admin_audit_log",
  "coupon_campaigns",
  "coupon_codes",
  "db_storage_metrics",
  "economy_events",
  "feedback_reports",
  "ops_settings",
  "password_credentials",
  "referral_reward_identities",
  "storage_deletion_queue",
  "ugc_policy_consents",
  "ugc_reports",
  "user_sanctions",
  "users",
]);

// These tables contain disposable authentication challenges or beta game/community state.
// Keep this list explicit: validateTableCoverage aborts when a migration adds an unclassified
// public table, so a future launch cannot silently preserve or erase new data.
export const RESET_TABLES = Object.freeze([
  "account_link_intents",
  "adventurer_association_dining_weekly",
  "adventurer_association_facilities",
  "adventurer_association_trade_weekly",
  "artisan_leaderboard_snapshots",
  "battle_replays",
  "bulletin_comments",
  "bulletin_likes",
  "bulletin_posts",
  "bulletin_views",
  "chat_room_invites",
  "chat_room_members",
  "chat_rooms",
  "codex_mastery_progress",
  "codex_mastery_summary",
  "codex_trophy_history",
  "coop_boss_attack_log",
  "coop_boss_contributors",
  "coop_boss_sessions",
  "dangerous_fishing_boss_contributions",
  "dangerous_fishing_boss_events",
  "fishing_records",
  "fishing_seasons",
  "guild_activity_log",
  "guild_activity_rollups",
  "guild_contribution_events",
  "guild_dining_weekly",
  "guild_exploration_weekly",
  "guild_facility_upgrade_donations",
  "guild_invites",
  "guild_join_requests",
  "guild_leave_cooldown",
  "guild_lodge_donations",
  "guild_lodge_state",
  "guild_members",
  "guild_raid_attack_logs",
  "guild_raid_events",
  "guild_raid_guild_scores",
  "guild_raid_participants",
  "guild_settlement_building_levels",
  "guild_trade_weekly",
  "guild_warehouse_permissions",
  "guild_workshop_weekly",
  "guilds",
  "lottery_purchases",
  "lottery_rounds",
  "lottery_winners",
  "marketplace_bids_v2",
  "marketplace_buy_orders_v2",
  "marketplace_inbox",
  "marketplace_listings",
  "marketplace_listings_v2",
  "marketplace_price_alerts_v2",
  "marketplace_price_daily",
  "marketplace_user_trade_totals",
  "messages",
  "outpost_claim_attempts",
  "outpost_defenders",
  "outpost_lords",
  "outpost_occupations",
  "outpost_treasury",
  "outpost_villages",
  "presence",
  "pvp_matches",
  "pvp_ratings",
  "pvp_seasons",
  "pvp_tournament_bets",
  "pvp_tournaments",
  "push_deliveries",
  "push_subscriptions",
  "rankings",
  "referral_codes",
  "referral_conversions",
  "saves_kv",
  "server_feed",
  "sessions",
  "tile_settlements",
  "treasure_scores",
  "treasure_seasons",
  "user_blocks",
  "user_settlement_resources",
  "v2_guild_resources",
  "v2_notifications",
  "verification_tokens",
]);

export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function validateTableCoverage(actualTables) {
  const actual = [...new Set(actualTables)].sort();
  const classified = [...PRESERVED_TABLES, ...RESET_TABLES].sort();
  const duplicates = classified.filter((name, index) => classified.indexOf(name) !== index);
  if (duplicates.length > 0) {
    throw new Error(`reset plan has duplicate tables: ${[...new Set(duplicates)].join(", ")}`);
  }

  const actualSet = new Set(actual);
  const classifiedSet = new Set(classified);
  const unclassified = actual.filter((name) => !classifiedSet.has(name));
  const missing = classified.filter((name) => !actualSet.has(name));
  if (unclassified.length > 0 || missing.length > 0) {
    const detail = [];
    if (unclassified.length > 0) detail.push(`unclassified: ${unclassified.join(", ")}`);
    if (missing.length > 0) detail.push(`missing: ${missing.join(", ")}`);
    throw new Error(`public table coverage mismatch (${detail.join("; ")})`);
  }
  return actual;
}

export function buildResetTablePlan(actualTables, options) {
  return {
    execute: options?.execute === true,
    publicTables: validateTableCoverage(actualTables),
    preservedTables: PRESERVED_TABLES,
    resetTables: RESET_TABLES,
  };
}

export function parseResetArgs(argv) {
  const parsed = {
    execute: false,
    help: false,
    expectDatabase: undefined,
    expectUsers: undefined,
    expectAuthAccounts: undefined,
    expectPasswordAccounts: undefined,
    expectGoogleAccounts: undefined,
    expectDeletedGoogleUsers: undefined,
    expectCouponCodes: undefined,
    expectInboxRows: undefined,
    confirmation: undefined,
    maintenanceFlag: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--execute") {
      parsed.execute = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }
    const key = {
      "--expect-database": "expectDatabase",
      "--expect-users": "expectUsers",
      "--expect-auth-accounts": "expectAuthAccounts",
      "--expect-password-accounts": "expectPasswordAccounts",
      "--expect-google-accounts": "expectGoogleAccounts",
      "--expect-deleted-google-users": "expectDeletedGoogleUsers",
      "--expect-coupon-codes": "expectCouponCodes",
      "--expect-inbox-rows": "expectInboxRows",
      "--confirm": "confirmation",
      "--maintenance-flag": "maintenanceFlag",
    }[token];
    if (!key) throw new Error(`unexpected argument: ${token}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${token}`);
    parsed[key] = value;
    i += 1;
  }

  if (parsed.help) return parsed;
  if (!parsed.expectDatabase) throw new Error("--expect-database is required");
  for (const key of [
    "expectUsers",
    "expectAuthAccounts",
    "expectPasswordAccounts",
    "expectGoogleAccounts",
    "expectDeletedGoogleUsers",
    "expectCouponCodes",
    "expectInboxRows",
  ]) {
    if (parsed[key] === undefined) continue;
    const numeric = Number(parsed[key]);
    if (!Number.isSafeInteger(numeric) || numeric < 0) {
      throw new Error(`--${camelToKebab(key)} must be a non-negative integer`);
    }
    parsed[key] = numeric;
  }

  if (parsed.execute) {
    if (parsed.confirmation !== RESET_CONFIRMATION) {
      throw new Error(`--confirm must equal ${RESET_CONFIRMATION}`);
    }
    if (!parsed.maintenanceFlag) throw new Error("--maintenance-flag is required with --execute");
    for (const key of [
      "expectUsers",
      "expectAuthAccounts",
      "expectPasswordAccounts",
      "expectGoogleAccounts",
      "expectDeletedGoogleUsers",
      "expectCouponCodes",
      "expectInboxRows",
    ]) {
      if (parsed[key] === undefined) {
        throw new Error(`--${camelToKebab(key)} is required with --execute`);
      }
    }
  }
  return parsed;
}

function camelToKebab(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
