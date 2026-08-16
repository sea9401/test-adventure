# Guild Trade Shop Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase the guild trade shop's useful weekly token sinks while limiting stamina potions to three purchases and adding three guild-wide resource rewards.

**Architecture:** Keep the static catalog in `guildTrade.ts` as the source of truth, distinguishing per-member rewards from guild-pool rewards. The guild route applies shared rewards once to the appropriate locked guild resource store, while the solo association route exposes only per-member-compatible goods. The existing panel renders confirmation and completion copy according to the reward target.

**Tech Stack:** TypeScript, Next.js route handlers, Drizzle transaction helpers, React, Vitest

## Global Constraints

- Do not deploy.
- Preserve unrelated PvP worktree changes and stage only trade-shop files.
- Weekly limits: refined iron 7, stamina potion 3, mastery certificate bundle 6, mithril shard 3, sunstone 2.
- Add settlement supplies (120 tokens, 3/week, Lv.1, crop +100 and ore +100), trade support fund (180 tokens, 2/week, Lv.2, guild gold +3,000,000), and guild fame document (200 tokens, 2/week, Lv.3, guild fame +100).
- Guild-pool rewards are not available in the solo adventurer association shop.

---

### Task 1: Catalog and association filtering

**Files:**
- Modify: `src/adventure/data/v2/guildTrade.ts`
- Test: `src/adventure/data/v2/guildTrade.test.ts`
- Modify: `src/app/api/v2/association/trade-post/route.ts`

**Interfaces:**
- Consumes: existing `GuildTradeShopItem` catalog and lookup.
- Produces: `target: "members" | "guild"`, new guild output variants, `ASSOCIATION_TRADE_SHOP_ITEMS`, and `associationTradeShopItem(raw)`.

- [x] **Step 1: Write the failing catalog test**

```ts
expect(GUILD_TRADE_SHOP_ITEMS.map(({ id, weeklyLimit }) => [id, weeklyLimit])).toEqual([
  ["refined_iron", 7],
  ["stamina_potion", 3],
  ["mastery_certificate", 6],
  ["mithril_shard", 3],
  ["sunstone", 2],
  ["settlement_supplies", 3],
  ["trade_support_fund", 2],
  ["guild_fame_document", 2],
]);
expect(associationTradeShopItem("settlement_supplies")).toBeNull();
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/data/v2/guildTrade.test.ts`

Expected: FAIL because the new stock limits and guild rewards do not exist.

- [x] **Step 3: Implement the catalog and association-safe lookup**

```ts
export const ASSOCIATION_TRADE_SHOP_ITEMS = GUILD_TRADE_SHOP_ITEMS.filter(
  (item) => item.target === "members",
);

export function associationTradeShopItem(raw: unknown): GuildTradeShopItem | null {
  if (typeof raw !== "string") return null;
  return ASSOCIATION_TRADE_SHOP_ITEMS.find((item) => item.id === raw) ?? null;
}
```

Use the association-only list for its shop view and buy lookup.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/adventure/data/v2/guildTrade.test.ts`

Expected: PASS.

### Task 2: Atomic guild-wide reward grants

**Files:**
- Modify: `src/app/api/v2/guild/trade-post/route.ts`
- Test: `src/app/api/v2/guild/trade-post/route.test.ts`
- Modify: `src/lib/server/guildActivityLog.ts`
- Modify: `src/adventure/v2/GuildActivityList.tsx`

**Interfaces:**
- Consumes: `lockGuildSettlement`/`upsertGuildSettlement`, `lockGuildResources`/`upsertGuildResources`, and `addGuildFame`.
- Produces: guild purchases that atomically debit tokens, increment weekly purchases, and apply exactly one shared guild reward.

- [x] **Step 1: Write failing route tests for each guild-wide output**

```ts
expect(upsertGuildSettlement).toHaveBeenCalledWith(expect.anything(), 7, {
  crop: 120,
  ore: 130,
});
expect(upsertGuildResources).toHaveBeenCalledWith(expect.anything(), 7, {
  gold: 8_000_000,
});
expect(addGuildFame).toHaveBeenCalledWith(expect.anything(), 7, 100);
```

Also assert the correct token debit and that per-user saves are not used for the shared reward.

- [x] **Step 2: Run the focused route test and verify RED**

Run: `npm test -- src/app/api/v2/guild/trade-post/route.test.ts`

Expected: FAIL with the new item IDs rejected or shared upserts missing.

- [x] **Step 3: Implement shared reward locking and application**

```ts
if (output.kind === "guild_settlement") {
  const resources = await lockGuildSettlement(tx, guildId);
  return {
    apply: () => upsertGuildSettlement(tx, guildId, {
      ...resources,
      crop: (resources.crop ?? 0) + output.crop,
      ore: (resources.ore ?? 0) + output.ore,
    }),
  };
}
```

Add corresponding branches for guild gold and fame, and keep the existing member loop for `target: "members"` goods. Record whether a purchase targeted members or the guild pool so the activity list can describe both correctly.

- [x] **Step 4: Run the focused route test and verify GREEN**

Run: `npm test -- src/app/api/v2/guild/trade-post/route.test.ts`

Expected: PASS.

### Task 3: Player-facing shop copy and manual

**Files:**
- Modify: `src/adventure/v2/guild/GuildTradePostPanel.tsx`
- Modify: `src/app/manual/content/guild.tsx`

**Interfaces:**
- Consumes: shop item `target` and output descriptions.
- Produces: confirmation/success text that says member rewards go to all members and guild rewards go to the shared resource pool.

- [x] **Step 1: Update target-aware purchase copy**

```ts
const targetsGuildPool = item.target === "guild";
```

Use this distinction in the shop badge, explanatory copy, confirmation prompt, and success notice.

- [x] **Step 2: Correct the manual table terminology**

Change the limit heading from `개인 주간 한도` to `길드 주간 한도` and include the item description so shared rewards are explicit.

- [x] **Step 3: Run focused tests and static checks**

Run: `npm test -- src/adventure/data/v2/guildTrade.test.ts src/app/api/v2/guild/trade-post/route.test.ts src/lib/server/guildActivityLog.test.ts`

Run: `npx eslint src/adventure/data/v2/guildTrade.ts src/adventure/data/v2/guildTrade.test.ts src/app/api/v2/guild/trade-post/route.ts src/app/api/v2/guild/trade-post/route.test.ts src/app/api/v2/association/trade-post/route.ts src/lib/server/guildActivityLog.ts src/adventure/v2/GuildActivityList.tsx src/adventure/v2/guild/GuildTradePostPanel.tsx src/app/manual/content/guild.tsx`

Run: `npx tsc --noEmit`

Expected: all commands exit 0.

- [x] **Step 4: Review and commit only scoped files**

Run: `git diff --check` and inspect `git diff -- <scoped files>`, then stage only the files listed in this plan and commit with `feat: rebalance guild trade shop`.
