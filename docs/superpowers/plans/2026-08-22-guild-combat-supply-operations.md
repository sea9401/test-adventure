# Guild Combat Supply Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a voluntary three-step weekly guild-gold sink that temporarily strengthens every permanent combat-supply effect.

**Architecture:** Store the current operations tier in the existing `guilds.buffs` JSON array and consider it active only when its ISO activation timestamp belongs to the current KST Monday week. Extend the existing combat-supply API for atomic guild-resource payment, reuse the centralized dungeon-hunt supply calculation, and render the operations card in the existing guild research panel.

**Tech Stack:** Next.js 16.2.11 App Router route handlers, React 19, TypeScript 5, Drizzle ORM, PostgreSQL JSONB, Vitest 4, Tailwind CSS surface tokens.

## Global Constraints

- Weekly tiers cost 10,000,000 G, 20,000,000 G, and 40,000,000 G respectively; the maximum weekly spend is 70,000,000 G.
- Each active tier adds +1 percentage point to dungeon-hunt gold and EXP and +5 percentage points to the extra-proficiency chance.
- The tier resets lazily every Monday at 00:00 KST and must not require a migration or scheduler.
- Only guild masters and managers may pay; ordinary members may view the state.
- Lock payment state in the global order `guild_resources` then `guilds`, and write payment, buff state, and activity log in one transaction.
- New UI cards must use opaque `SURFACE_CARD`/`SURFACE_INSET` tokens and must not use container-wide opacity.
- Preserve the current unrelated mastery-tower worktree changes.
- Do not deploy or change maintenance mode.

---

### Task 1: Weekly operations domain model

**Files:**
- Modify: `src/adventure/data/v2/guildCombatSupply.ts`
- Test: `src/adventure/data/v2/guildCombatSupply.test.ts`

**Interfaces:**
- Produces: `GUILD_COMBAT_OPERATIONS_BUFF_ID`, `GUILD_COMBAT_OPERATIONS_MAX_TIER`, `GUILD_COMBAT_OPERATIONS_TIER_COSTS`.
- Produces: `parseGuildCombatOperationsTier(rawBuffs: unknown, now?: Date): number`.
- Produces: `guildCombatOperationsNextCost(tier: number): number | null`.
- Produces: `upsertGuildCombatOperationsBuff(rawBuffs: unknown, nextTier: number, installedAt: string): GuildCombatSupplyBuffSlot[]`.
- Changes: `guildCombatSupplyBonuses(levels, operationsTier?: number)` keeps its existing one-argument behavior and adds operations bonuses when the second argument is supplied.

- [ ] **Step 1: Write failing domain tests**

Add cases equivalent to:

```ts
it("uses the weekly operations gold curve", () => {
  expect([0, 1, 2, 3].map(guildCombatOperationsNextCost)).toEqual([
    10_000_000, 20_000_000, 40_000_000, null,
  ]);
});

it("expires operations at the KST Monday boundary", () => {
  const buffs = [{
    buffId: "combat_operations",
    tier: 2,
    installedAt: "2026-08-16T14:59:59.000Z",
  }];
  expect(parseGuildCombatOperationsTier(buffs, new Date("2026-08-16T14:59:59.000Z"))).toBe(2);
  expect(parseGuildCombatOperationsTier(buffs, new Date("2026-08-16T15:00:00.000Z"))).toBe(0);
});

it("adds operations above permanent research maximums", () => {
  expect(guildCombatSupplyBonuses({
    combat_gold: 10,
    combat_exp: 10,
    combat_proficiency: 10,
  }, 3)).toEqual({ goldPct: 13, expPct: 13, proficiencyChancePct: 65 });
});
```

Also assert invalid timestamps/tier values become tier 0 and that upserting operations preserves permanent and unknown buff slots.

- [ ] **Step 2: Run the domain test and verify RED**

Run: `npx vitest run src/adventure/data/v2/guildCombatSupply.test.ts`

Expected: FAIL because the operations exports do not exist and the bonus function has no operations behavior.

- [ ] **Step 3: Implement the pure operations model**

Use `kstWeekMondayKey` for timestamp comparison. Normalize tiers to integer `0..3`, locate only the `combat_operations` slot, and treat invalid/missing/other-week activation times as inactive. Use immutable array replacement for the operations slot. Calculate final effects as:

```ts
return {
  goldPct: goldSupplyBonusPct(levels.combat_gold) + safeOperationsTier,
  expPct: expSupplyBonusPct(levels.combat_exp) + safeOperationsTier,
  proficiencyChancePct:
    proficiencySupplyChancePct(levels.combat_proficiency) +
    safeOperationsTier * 5,
};
```

- [ ] **Step 4: Run the domain test and verify GREEN**

Run: `npx vitest run src/adventure/data/v2/guildCombatSupply.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the domain model**

```bash
git add src/adventure/data/v2/guildCombatSupply.ts src/adventure/data/v2/guildCombatSupply.test.ts
git commit -m "feat: model weekly guild combat operations"
```

### Task 2: Apply active operations to dungeon hunts

**Files:**
- Modify: `src/lib/server/guildCombatSupply.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Test: `src/lib/server/guildCombatSupply.test.ts`
- Test: `src/app/api/v2/dungeon/hunt/route.test.ts`

**Interfaces:**
- Produces: `GuildCombatSupplyState = { levels: GuildCombatSupplyLevels; operationsTier: number }`.
- Produces: `readGuildCombatSupplyState(tx, guildId, now?): Promise<GuildCombatSupplyState>`.
- Preserves: `readGuildCombatSupplyLevels(tx, guildId)` for existing callers/tests.
- Consumes: `parseGuildCombatOperationsTier` and `guildCombatSupplyBonuses(levels, operationsTier)` from Task 1.

- [ ] **Step 1: Write failing server-reader and hunt regressions**

Cover a guild row containing permanent levels plus a current-week tier and expect `readGuildCombatSupplyState` to return both. Cover `guildId === null` and a past-week slot returning empty levels/tier 0. In the hunt route regression, mock `readGuildCombatSupplyState` with tier 2 and assert the cached combat supply bonuses passed through the existing EXP, gold, and proficiency paths are computed with tier 2.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run src/lib/server/guildCombatSupply.test.ts src/app/api/v2/dungeon/hunt/route.test.ts`

Expected: FAIL because `readGuildCombatSupplyState` is missing and the hunt route reads levels only.

- [ ] **Step 3: Implement one-query state reading and hunt integration**

Read `guilds.buffs` once, returning:

```ts
return {
  levels: parseGuildCombatSupplyLevels(row?.buffs),
  operationsTier: parseGuildCombatOperationsTier(row?.buffs, now),
};
```

Change the hunt route initialization to:

```ts
const supplyState = await readGuildCombatSupplyState(tx, viewerGuildId, now);
const guildCombatSupply = guildCombatSupplyBonuses(
  supplyState.levels,
  supplyState.operationsTier,
);
```

Keep the existing batch cache so multi-hunt requests do not repeat the guild query.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/lib/server/guildCombatSupply.test.ts src/app/api/v2/dungeon/hunt/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit hunt integration**

```bash
git add src/lib/server/guildCombatSupply.ts src/lib/server/guildCombatSupply.test.ts src/app/api/v2/dungeon/hunt/route.ts src/app/api/v2/dungeon/hunt/route.test.ts
git commit -m "feat: apply weekly guild operations to hunts"
```

### Task 3: Atomic operations payment and activity history

**Files:**
- Modify: `src/app/api/v2/guild/combat-supply/route.ts`
- Create: `src/app/api/v2/guild/combat-supply/route.test.ts`
- Modify: `src/lib/server/guildActivityLog.ts`
- Modify: `src/adventure/v2/GuildActivityList.tsx`
- Test: `src/lib/server/guildActivityLog.test.ts`

**Interfaces:**
- Extends GET success with `guildGold: number` and `operations: { weekKey: string; tier: number; maxTier: 3; nextCost: number | null; goldPct: number; expPct: number; proficiencyChancePct: number }`.
- Extends POST payload union with `{ action: "fund_operations" }`; preserves `{ supplyId: GuildCombatSupplyId }`.
- Adds activity type `combat_supply_funding` and metadata `{ operationsTier: number; goldCost: number }`.

- [ ] **Step 1: Write failing route tests**

Mock authentication, rate limiting, the transaction/select builders, guild-resource helpers, and activity logging following `src/app/api/v2/guild/level/route.test.ts`. Assert:

```ts
expect(body).toMatchObject({
  ok: true,
  guildGold: 90_000_000,
  operations: { tier: 1, nextCost: 20_000_000 },
});
expect(upsertGuildResources).toHaveBeenCalledWith(tx, 7, { gold: 90_000_000 });
expect(logGuildActivity).toHaveBeenCalledWith(tx, expect.objectContaining({
  type: "combat_supply_funding",
  meta: { operationsTier: 1, goldCost: 10_000_000 },
}));
```

Add cases for ordinary-member 403, insufficient-gold 409 without update, tier-3 `operations_maxed`, a past-week tier restarting at tier 1, invalid payload 400, and the existing permanent supply upgrade path.

- [ ] **Step 2: Run the route test and verify RED**

Run: `npx vitest run src/app/api/v2/guild/combat-supply/route.test.ts`

Expected: FAIL because the funding action and response fields are missing.

- [ ] **Step 3: Implement GET state and POST payment**

For GET, left join/read `v2GuildResources.gold` and return 0 for a missing resource row. For funding POST, validate the exact action, check manager permission, then call `lockGuildResources` before selecting `guilds.buffs FOR UPDATE`. Recompute the current-week tier after locks, get the next cost, reject without writes when unavailable, update `guilds.buffs`, update guild gold, and log the activity in the same transaction. Keep permanent research writes unchanged except that success responses now also include the current operations view and guild gold.

- [ ] **Step 4: Add activity formatting and no-contribution regression**

Add `combat_supply_funding` to `GuildActivityType`, metadata fields, and the activity list:

```ts
case "combat_supply_funding":
  return `${actor} 님이 주간 전투보급 운용을 Lv ${a.meta?.operationsTier ?? "?"}로 강화했어요 · 길드 자금 -${(a.meta?.goldCost ?? 0).toLocaleString()} G`;
```

Assign an opaque dot color and assert `guildContributionForActivity` remains null through the existing activity-log test harness.

- [ ] **Step 5: Run route and activity tests and verify GREEN**

Run: `npx vitest run src/app/api/v2/guild/combat-supply/route.test.ts src/lib/server/guildActivityLog.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit API and activity changes**

```bash
git add src/app/api/v2/guild/combat-supply/route.ts src/app/api/v2/guild/combat-supply/route.test.ts src/lib/server/guildActivityLog.ts src/lib/server/guildActivityLog.test.ts src/adventure/v2/GuildActivityList.tsx
git commit -m "feat: fund weekly guild combat operations"
```

### Task 4: Operations UI and player manual

**Files:**
- Modify: `src/adventure/v2/guild/GuildCombatSupplyPanel.tsx`
- Test: `src/adventure/v2/guild/GuildCostlyActionConfirmation.test.ts`
- Modify: `src/app/manual/content/guild.tsx`

**Interfaces:**
- Consumes the Task 3 response `guildGold` and `operations` fields.
- Produces: `confirmCombatOperationsFunding({ operations, onFund, confirm }): boolean`.

- [ ] **Step 1: Write a failing confirmation regression**

Add a test that cancellation does not call `onFund`, and assert the confirmation includes `20,000,000 G`, the next-tier `+2%p`/`+10%p` effects, and `월요일 00:00`.

- [ ] **Step 2: Run the UI helper test and verify RED**

Run: `npx vitest run src/adventure/v2/guild/GuildCostlyActionConfirmation.test.ts`

Expected: FAIL because `confirmCombatOperationsFunding` does not exist.

- [ ] **Step 3: Implement the operations card and request flow**

Extend `CombatSupplyResponse`, add a `fundOperations` callback posting `{ action: "fund_operations" }`, and render a `SURFACE_CARD` section before the permanent research list. Use `SURFACE_INSET` for the current tier/effect and treasury summaries. Disable the action when the viewer lacks permission, the tier is maxed, the treasury is short, or another request is running. Use explicit text color for disabled state and reserve `disabled:opacity-*` for the button.

- [ ] **Step 4: Document the weekly operations rule**

In the guild manual's combat-supply section, add the three costs, cumulative maximum, exact tier effects, administrator restriction, and Monday 00:00 KST reset. Keep the permanent fame research table unchanged.

- [ ] **Step 5: Run UI test and static checks**

Run: `npx vitest run src/adventure/v2/guild/GuildCostlyActionConfirmation.test.ts`

Expected: PASS.

Run: `npx eslint src/adventure/v2/guild/GuildCombatSupplyPanel.tsx src/app/manual/content/guild.tsx`

Expected: exit 0.

- [ ] **Step 6: Commit UI and manual**

```bash
git add src/adventure/v2/guild/GuildCombatSupplyPanel.tsx src/adventure/v2/guild/GuildCostlyActionConfirmation.test.ts src/app/manual/content/guild.tsx
git commit -m "feat: show weekly guild operations funding"
```

### Task 5: Full verification and feedback-facing patch note

**Files:**
- Create: `docs/patch-notes/2026-08-22-guild-combat-supply-operations.txt`

**Interfaces:**
- Consumes all previous tasks; produces player-facing release copy only.

- [ ] **Step 1: Write the patch note**

Explain that accumulated guild funds can now pay weekly combat-supply operations, list all three costs/effects, state manager permissions and the Monday reset, and avoid mentioning internal JSON/API details.

- [ ] **Step 2: Run targeted feature verification**

Run:

```bash
npx vitest run src/adventure/data/v2/guildCombatSupply.test.ts src/lib/server/guildCombatSupply.test.ts src/app/api/v2/guild/combat-supply/route.test.ts src/lib/server/guildActivityLog.test.ts src/adventure/v2/guild/GuildCostlyActionConfirmation.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Run repository verification**

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run check-images`

Expected: all commands exit 0. If an existing unrelated failure occurs, record the exact command and failure without changing unrelated mastery-tower files.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check HEAD~4..HEAD` after staging the patch note, and inspect `git status --short` to ensure only the known mastery-tower changes remain outside this feature.

- [ ] **Step 5: Commit the patch note and any verification-only corrections**

```bash
git add docs/patch-notes/2026-08-22-guild-combat-supply-operations.txt
git commit -m "docs: announce weekly guild operations"
```
