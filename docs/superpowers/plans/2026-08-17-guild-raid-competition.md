# Guild Raid Competition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a weekly guild raid in which every guild attacks the same staged boss, each member has three daily attacks, guild damage determines a live and final leaderboard, and settlement snapshots personal eligibility without granting rewards.

**Architecture:** Keep guild-raid lifecycle, scores, participants, and attack logs in dedicated tables while reusing the v2 cooperative-boss catalog, combat engine, replay payload, and display components. Put time, stage rollover, ranking, and eligibility in pure functions; keep database lifecycle and attack transactions in focused server modules. Expose uncached App Router handlers and a client-side guild tab that polls the server.

**Tech Stack:** Next.js 16.2 App Router route handlers, React 19 client components, TypeScript, Drizzle ORM/PostgreSQL, Vitest, existing v2 combat/replay infrastructure.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `05-server-and-client-components.md` before editing routes or client components.
- Do not deploy to any environment.
- Do not implement reward items, amounts, probabilities, reward bands, or claim APIs.
- Do not expose this feature operationally until a separate reward specification exists.
- Use Monday 00:00 KST weekly boundaries and KST midnight daily boundaries from shared helpers.
- Give each member exactly three attacks per KST day; unused attacks do not carry.
- A participant locks to the guild of their first valid weekly attack.
- Rank guilds by the sum of every locked member's damage; ties use standard competition ranking (`1, 1, 3`).
- Personal settlement eligibility requires at least three valid attacks and damage of at least one.
- Use opaque surfaces from `src/components/ui/surfaces.ts`; do not add translucent content cards.
- Reuse existing images only. The non-production pilot uses the existing `mountain_chief_hard` boss definition and image so the system can be exercised without adding content assets.
- Preserve unrelated worktree changes. Marketplace reporting now occupies `0167`; this feature uses `0168`.

---

## File Structure

- `src/adventure/data/v2/guildRaid.ts`: pure constants, staged HP rollover, eligibility, and ranking.
- `src/adventure/data/v2/guildRaid.test.ts`: pure policy regression tests.
- `src/db/schema.ts`: four dedicated guild-raid tables.
- `drizzle/0168_*.sql`, `drizzle/meta/0168_snapshot.json`, `drizzle/meta/_journal.json`: generated schema migration after `0167` is present.
- `src/lib/server/guildRaidLifecycle.ts`: current-week creation, expired-event settlement, and leaderboard snapshots.
- `src/lib/server/guildRaidLifecycle.test.ts`: mocked database lifecycle tests.
- `src/lib/server/guildRaidBattle.ts`: battle simulation adapter returning damage and replay payload.
- `src/lib/server/guildRaidBattle.test.ts`: adapter tests around the v2 combat result.
- `src/lib/server/guildRaidAttack.ts`: authenticated attack transaction policy and persistence.
- `src/lib/server/guildRaidAttack.test.ts`: idempotency, guild lock, quota, and concurrent-stage tests.
- `src/app/api/v2/guild/raid/route.ts`: uncached raid state GET handler.
- `src/app/api/v2/guild/raid/route.test.ts`: response contract and access tests.
- `src/app/api/v2/guild/raid/attack/route.ts`: attack POST handler.
- `src/app/api/v2/guild/raid/attack/route.test.ts`: validation, rate-limit, and error mapping tests.
- `src/app/api/v2/guild/raid/attacks/[attackId]/route.ts`: replay GET handler.
- `src/app/api/v2/guild/raid/attacks/[attackId]/route.test.ts`: replay access and parsing tests.
- `src/app/api/cron/guild-raid-rollover/route.ts`: authenticated rollover fallback trigger.
- `src/app/api/cron/guild-raid-rollover/route.test.ts`: cron authorization and idempotency tests.
- `src/adventure/v2/guild/guildRaidTypes.ts`: client response types and error labels.
- `src/adventure/v2/guild/useGuildRaid.ts`: 20-second polling and idempotent attack intent.
- `src/adventure/v2/guild/GuildRaidPanel.tsx`: boss, attempts, guild/member scores, leaderboard, and recent activity.
- `src/adventure/v2/guild/GuildRaidPanel.test.tsx`: loading, locked, exhausted, settled, and opaque-card rendering tests.
- `src/adventure/v2/guild/GuildRaidAttackLogView.tsx`: dedicated replay page view.
- `src/app/(game)/guild/raid/log/[attackId]/page.tsx`: replay route page.
- `src/adventure/v2/guild/guildShared.ts`: add the `raid` sub-tab key.
- `src/adventure/v2/V2GuildHome.tsx`: add and render the `토벌전` tab.
- `src/app/manual/content/guild.tsx`: explain weekly raid, daily attempts, score, and deferred rewards.

---

### Task 1: Pure Guild Raid Rules

**Files:**
- Create: `src/adventure/data/v2/guildRaid.ts`
- Create: `src/adventure/data/v2/guildRaid.test.ts`

**Interfaces:**
- Produces: `GUILD_RAID_DAILY_ATTACKS`, `GUILD_RAID_ELIGIBLE_ATTACKS`, `GUILD_RAID_PILOT_BOSS_KIND`, `guildRaidMaxHp(stage)`, `applyGuildRaidDamage(state, damage)`, `isGuildRaidParticipantEligible(attacks, damage)`, and `rankGuildRaidScores(rows)`.
- Uses: `COOP_BOSSES.mountain_chief_hard`, `kstDayKey`, and `kstWeekMondayKey`.

- [x] **Step 1: Write failing staged-damage, eligibility, and tie tests**

```ts
it("carries one attack across every cleared stage", () => {
  expect(applyGuildRaidDamage({ stage: 1, hp: 100, maxHp: 100 }, 260, () => 150))
    .toEqual({ stage: 3, hp: 140, maxHp: 150, stagesCleared: 2 });
});

it("requires three valid attacks and positive damage", () => {
  expect(isGuildRaidParticipantEligible(2, 999)).toBe(false);
  expect(isGuildRaidParticipantEligible(3, 1)).toBe(true);
});

it("uses standard competition ranking", () => {
  expect(rankGuildRaidScores([{ guildId: 1, damage: 50 }, { guildId: 2, damage: 50 }, { guildId: 3, damage: 20 }]))
    .toEqual([{ guildId: 1, damage: 50, rank: 1 }, { guildId: 2, damage: 50, rank: 1 }, { guildId: 3, damage: 20, rank: 3 }]);
});
```

- [x] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run src/adventure/data/v2/guildRaid.test.ts`

Expected: FAIL because `guildRaid.ts` does not exist.

- [x] **Step 3: Implement the pure policy**

Use a 25% per-stage HP growth over the existing hard-mountain-boss shared HP and clamp to `Number.MAX_SAFE_INTEGER`. `applyGuildRaidDamage` must loop until damage is exhausted and must reject negative/non-finite damage by treating it as zero. Ranking must sort by damage descending and guild ID ascending only for stable display; equal damage keeps equal rank.

- [x] **Step 4: Run the focused test and confirm GREEN**

Run: `npx vitest run src/adventure/data/v2/guildRaid.test.ts`

Expected: all guild-raid policy tests pass.

- [x] **Step 5: Commit the policy unit**

```bash
git add src/adventure/data/v2/guildRaid.ts src/adventure/data/v2/guildRaid.test.ts
git commit -m "feat: add guild raid competition rules"
```

---

### Task 2: Guild Raid Persistence

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0168_*.sql`
- Create: `drizzle/meta/0168_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `guildRaidEvents`, `guildRaidGuildScores`, `guildRaidParticipants`, and `guildRaidAttackLogs` Drizzle tables.
- Consumes: policy values from Task 1 only at runtime, never in the migration.

- [x] **Step 1: Add the four table definitions**

Use `bigint(..., { mode: "number" })` for all damage and HP values. Define:

```ts
guildRaidEvents: id text PK; weekKey text unique; bossKind text; startsAt/endAt;
status text default "active"; stage integer default 1; hp/maxHp bigint;
mechanicState jsonb default {}; settledAt timestamp nullable.

guildRaidGuildScores: (eventId, guildId) PK; guildNameSnapshot text;
guildEmblemSnapshot text nullable; damage bigint default 0; finalRank integer nullable;
settledAt timestamp nullable. Keep guildId as an integer snapshot without a guild FK.

guildRaidParticipants: (eventId, userId) PK; guildId integer snapshot;
damage bigint default 0; attackCount integer default 0; dayKey text;
dailyAttackCount integer default 0; eligibleAtSettlement boolean nullable;
updatedAt timestamp. userId references users with cascade.

guildRaidAttackLogs: serial id; eventId FK cascade; userId FK cascade;
guildId integer snapshot; requestId text; name text; damageDealt/damageTaken bigint;
diedEarly boolean; stageBefore/stageAfter integer; hpBefore/hpAfter bigint;
replay jsonb; createdAt timestamp; unique(eventId, userId, requestId).
```

Add indexes for active week lookup, leaderboard `(eventId, damage DESC)`, member list `(eventId, guildId, damage DESC)`, and recent attacks `(eventId, createdAt DESC)`.

- [x] **Step 2: Generate the migration after confirming `0167` exists in SQL and journal**

Run: `npm run db:generate`

Expected: exactly one `0168` SQL file and snapshot containing only the four guild-raid tables/indexes.

- [x] **Step 3: Verify migration integrity**

Run: `npm run check-migrations`

Expected: exit 0 with no duplicate migration index, missing snapshot, or journal mismatch.

- [x] **Step 4: Commit the persistence unit**

```bash
git add src/db/schema.ts drizzle/0168_*.sql drizzle/meta/0168_snapshot.json drizzle/meta/_journal.json
git commit -m "feat: persist weekly guild raids"
```

---

### Task 3: Lifecycle and Settlement Service

**Files:**
- Create: `src/lib/server/guildRaidLifecycle.ts`
- Create: `src/lib/server/guildRaidLifecycle.test.ts`

**Interfaces:**
- Produces: `ensureCurrentGuildRaid(now?: Date)`, `settleExpiredGuildRaids(now?: Date)`, `rolloverGuildRaids(now?: Date)`, and `readGuildRaidLeaderboard(eventId, viewerGuildId, page?)`.
- Consumes: Task 1 week/rank/eligibility rules and Task 2 tables.

- [x] **Step 1: Write failing lifecycle tests**

Cover these exact cases with a mocked transaction executor:

```ts
it("creates one active event for the KST week with on-conflict refetch");
it("settles expired scores as 1, 1, 3 and freezes participant eligibility");
it("returns the stored settlement when rollover runs twice");
it("returns viewer guild rank even when it is outside the first leaderboard page");
```

- [x] **Step 2: Run and confirm RED**

Run: `npx vitest run src/lib/server/guildRaidLifecycle.test.ts`

Expected: FAIL because the lifecycle module does not exist.

- [x] **Step 3: Implement event creation and settlement**

Use `weekStartUtcFor`/`weekEndUtcFor` to persist exact KST week boundaries. Event creation uses `weekKey` uniqueness plus `onConflictDoNothing()` and refetch. Settlement locks each expired active event, reads all scores, applies `rankGuildRaidScores`, updates every score's `finalRank`, marks participant eligibility with the pure helper, and changes the event to `settled` only after all updates succeed.

- [x] **Step 4: Implement leaderboard reads**

Return the first 50 rows ordered by damage descending and guild ID ascending, plus a separate viewer row when it is outside that page. Exclude zero-damage guilds and preserve settled snapshot names.

- [x] **Step 5: Run lifecycle tests and confirm GREEN**

Run: `npx vitest run src/lib/server/guildRaidLifecycle.test.ts`

Expected: all lifecycle tests pass.

- [x] **Step 6: Commit the lifecycle unit**

```bash
git add src/lib/server/guildRaidLifecycle.ts src/lib/server/guildRaidLifecycle.test.ts
git commit -m "feat: manage guild raid rollover"
```

---

### Task 4: Battle Adapter and Atomic Attack Service

**Files:**
- Create: `src/lib/server/guildRaidBattle.ts`
- Create: `src/lib/server/guildRaidBattle.test.ts`
- Create: `src/lib/server/guildRaidAttack.ts`
- Create: `src/lib/server/guildRaidAttack.test.ts`

**Interfaces:**
- Produces: `simulateGuildRaidBattle({ tx, userId, bossKind }) -> { playerName, damageDealt, damageTaken, diedEarly, replay }`.
- Produces: `attackGuildRaid({ userId, requestId, now? }) -> GuildRaidAttackOutcome`.
- Consumes: `prepareV2BattleActor`, `resolveBattle`, `pickAutoAction`, `toReplayPayload`, Task 1 rollover/quota rules, Task 2 tables, and Task 3 current-event helper.

- [x] **Step 1: Write failing battle-adapter tests**

Mock actor preparation and combat resolution. Assert that the adapter starts the player at full HP/MP, marks the enemy as a boss, uses the pilot boss definition, returns raw combat damage independent of current global event HP, and returns a valid replay payload.

- [x] **Step 2: Run adapter tests and confirm RED**

Run: `npx vitest run src/lib/server/guildRaidBattle.test.ts`

Expected: FAIL because the adapter does not exist.

- [x] **Step 3: Implement the battle adapter**

The private combat target uses the configured cooperative boss's own `sharedMaxHp`; the shared guild-raid HP is progression state, not the combat target's max HP. This preserves stable boss patterns while allowing returned raw damage to roll across shared stages.

- [x] **Step 4: Write failing attack-service tests**

Cover:

```ts
it("locks the first attack to the current guild and increments both scores");
it("resets daily count on a new KST day but keeps weekly count");
it("rejects a fourth same-day attack without consuming damage");
it("rejects a user whose current guild differs from the weekly locked guild");
it("allows a user who rejoined the original locked guild");
it("returns the existing attack for a repeated idempotency key");
it("applies one raw hit across multiple stages exactly once under concurrency");
it("rejects an event that ended during simulation without consuming an attempt");
```

- [x] **Step 5: Run attack-service tests and confirm RED**

Run: `npx vitest run src/lib/server/guildRaidAttack.test.ts`

Expected: FAIL because the attack service does not exist.

- [x] **Step 6: Implement the attack transaction**

Validate request ID as a UUID-shaped 8-64 character token. Read/prepare the actor and simulate before locking the global event. In the persistence transaction, lock the event first and participant second, then re-check event time, current guild, weekly guild lock, KST day quota, and idempotency. Apply `applyGuildRaidDamage`, upsert participant and guild score, insert the log, and update the event atomically. A unique-key race refetches and returns the committed attack result.

- [x] **Step 7: Run both focused suites and confirm GREEN**

Run: `npx vitest run src/lib/server/guildRaidBattle.test.ts src/lib/server/guildRaidAttack.test.ts`

Expected: both suites pass.

- [x] **Step 8: Commit the attack unit**

```bash
git add src/lib/server/guildRaidBattle.ts src/lib/server/guildRaidBattle.test.ts src/lib/server/guildRaidAttack.ts src/lib/server/guildRaidAttack.test.ts
git commit -m "feat: resolve atomic guild raid attacks"
```

---

### Task 5: Raid, Attack, Replay, and Cron APIs

**Files:**
- Create: `src/app/api/v2/guild/raid/route.ts`
- Create: `src/app/api/v2/guild/raid/route.test.ts`
- Create: `src/app/api/v2/guild/raid/attack/route.ts`
- Create: `src/app/api/v2/guild/raid/attack/route.test.ts`
- Create: `src/app/api/v2/guild/raid/attacks/[attackId]/route.ts`
- Create: `src/app/api/v2/guild/raid/attacks/[attackId]/route.test.ts`
- Create: `src/app/api/cron/guild-raid-rollover/route.ts`
- Create: `src/app/api/cron/guild-raid-rollover/route.test.ts`

**Interfaces:**
- Produces: `GET /api/v2/guild/raid`, `POST /api/v2/guild/raid/attack`, `GET /api/v2/guild/raid/attacks/:attackId`, and authenticated `GET /api/cron/guild-raid-rollover`.
- Consumes: Task 3 lifecycle and Task 4 attack service.

- [x] **Step 1: Write failing route contract tests**

Assert 401 for no session, 403 for no guild on state/attack, 400 for invalid JSON or request ID, 429 for rate limit, stable status/error mapping for daily exhaustion and guild lock mismatch, 404 for inaccessible replay, and 401 for an invalid cron bearer token.

- [x] **Step 2: Run route tests and confirm RED**

Run: `npx vitest run src/app/api/v2/guild/raid/route.test.ts src/app/api/v2/guild/raid/attack/route.test.ts src/app/api/v2/guild/raid/attacks/\[attackId\]/route.test.ts src/app/api/cron/guild-raid-rollover/route.test.ts`

Expected: route modules are missing.

- [x] **Step 3: Implement uncached GET state**

Use native `Response.json`; do not add static caching. Return event times/stage/HP, `my` quota and eligibility progress, viewer guild score/rank, top 50 leaderboard, guild member contributions, and 20 recent attacks/stage clears.

- [x] **Step 4: Implement POST attack and replay GET**

Apply `enforceUserAndIpRateLimit` under action `v2:guild-raid:attack`. The replay endpoint accepts only positive safe-integer IDs, requires guild membership, validates replay payload shape, and returns avatar/cosmetic metadata using existing helpers.

- [x] **Step 5: Implement authenticated cron rollover**

Use `requireCronAuth` and return `{ ok: true, settled, eventId }` from `rolloverGuildRaids`.

- [x] **Step 6: Run route tests and confirm GREEN**

Run the same four-suite command from Step 2.

Expected: all route tests pass.

- [x] **Step 7: Commit the API unit**

```bash
git add src/app/api/v2/guild/raid src/app/api/cron/guild-raid-rollover
git commit -m "feat: expose guild raid APIs"
```

---

### Task 6: Guild Raid Client and Replay UI

**Files:**
- Create: `src/adventure/v2/guild/guildRaidTypes.ts`
- Create: `src/adventure/v2/guild/useGuildRaid.ts`
- Create: `src/adventure/v2/guild/GuildRaidPanel.tsx`
- Create: `src/adventure/v2/guild/GuildRaidPanel.test.tsx`
- Create: `src/adventure/v2/guild/GuildRaidAttackLogView.tsx`
- Create: `src/app/(game)/guild/raid/log/[attackId]/page.tsx`
- Modify: `src/adventure/v2/guild/guildShared.ts`
- Modify: `src/adventure/v2/V2GuildHome.tsx`

**Interfaces:**
- Produces: `GuildRaidStateResponse`, `useGuildRaid()`, `GuildRaidPanel`, and `GuildRaidAttackLogView`.
- Consumes: Task 5 response contracts and existing `Card`, surfaces, avatars, `ReplayBattleScene`, and guild navigation.

- [x] **Step 1: Write failing panel rendering tests**

Use static rendering or the repository's existing component-test pattern. Assert opaque cards and exact Korean labels for loading, three remaining attacks, daily exhaustion, guild lock mismatch, settlement in progress, final rank, and “보상 정책 준비 중”.

- [x] **Step 2: Run panel tests and confirm RED**

Run: `npx vitest run src/adventure/v2/guild/GuildRaidPanel.test.tsx`

Expected: panel module is missing.

- [x] **Step 3: Implement client types and polling hook**

Poll every 20 seconds while active and refresh immediately after a successful attack. Generate one `crypto.randomUUID()` per button intent and reuse it for network retry. Do not retry a rejected attack with a new request ID. Map server codes to concise Korean messages.

- [x] **Step 4: Implement the panel and tab integration**

Add `{ key: "raid", label: "토벌전" }` to the base guild tabs and render the panel only for guild members. Order sections as boss/HP, personal attempts, viewer guild rank, guild members, full leaderboard, and recent attacks. Use `Card` and shared surface constants; never use opacity on a whole locked card.

- [x] **Step 5: Implement the replay view and page**

Follow the async `params: Promise<...>` convention from current Next 16 dynamic pages. Fetch the guild-raid replay API and render `ReplayBattleScene`; back navigation returns to `/guild?tab=raid`.

- [x] **Step 6: Run panel and existing guild/coop UI tests**

Run: `npx vitest run src/adventure/v2/guild/GuildRaidPanel.test.tsx src/adventure/v2/coop/coopRoutes.test.ts src/adventure/v2/ReplayBattleScene.test.tsx`

Expected: all suites pass.

- [x] **Step 7: Commit the UI unit**

```bash
git add src/adventure/v2/guild src/adventure/v2/V2GuildHome.tsx src/app/'(game)'/guild/raid
git commit -m "feat: add guild raid competition UI"
```

---

### Task 7: Manual, Full Verification, and Scope Audit

**Files:**
- Modify: `src/app/manual/content/guild.tsx`
- Modify: `docs/superpowers/plans/2026-08-17-guild-raid-competition.md` checkbox state only while executing.

**Interfaces:**
- Consumes: every prior task.
- Produces: documented player rules and verified implementation.

- [x] **Step 1: Add manual copy**

Document Monday KST rollover, shared staged HP, three attacks per day, all-member damage sum, first-attack guild lock, three-attack personal eligibility, and that reward policy is not yet available. Do not claim any item or amount.

- [x] **Step 2: Run focused guild-raid tests**

Run: `npx vitest run src/adventure/data/v2/guildRaid.test.ts src/lib/server/guildRaidLifecycle.test.ts src/lib/server/guildRaidBattle.test.ts src/lib/server/guildRaidAttack.test.ts src/app/api/v2/guild/raid/route.test.ts src/app/api/v2/guild/raid/attack/route.test.ts src/app/api/v2/guild/raid/attacks/\[attackId\]/route.test.ts src/app/api/cron/guild-raid-rollover/route.test.ts src/adventure/v2/guild/GuildRaidPanel.test.tsx`

Expected: all focused tests pass.

- [x] **Step 3: Run repository verification**

Run, in order:

```bash
npm run check-migrations
npx tsc --noEmit
npx eslint src/adventure/data/v2/guildRaid.ts src/lib/server/guildRaidLifecycle.ts src/lib/server/guildRaidBattle.ts src/lib/server/guildRaidAttack.ts src/app/api/v2/guild/raid src/app/api/cron/guild-raid-rollover src/adventure/v2/guild/GuildRaidPanel.tsx src/adventure/v2/guild/useGuildRaid.ts src/adventure/v2/guild/GuildRaidAttackLogView.tsx src/adventure/v2/V2GuildHome.tsx src/app/manual/content/guild.tsx
npm test
```

Expected: every command exits 0. If unrelated concurrent changes make the full suite fail, record the exact failing test and still require all guild-raid-focused tests, migration checks, type checks, and changed-file lint to pass.

- [x] **Step 4: Audit the deferred reward boundary**

Run: `rg -n "reward|보상" src/adventure/data/v2/guildRaid.ts src/lib/server/guildRaidLifecycle.ts src/lib/server/guildRaidAttack.ts src/app/api/v2/guild/raid src/adventure/v2/guild`

Expected: only eligibility status and “보상 정책 준비 중” copy; no inventory mutation, gold/fame grant, probability, rank band, or claim endpoint.

- [x] **Step 5: Audit images and surfaces**

Run: `npm run check-images`

Expected: no missing image reference. Inspect the raid panel in light and dark mode at mobile width and confirm no background image shows through content cards.

- [x] **Step 6: Commit documentation and final checkbox updates**

```bash
git add src/app/manual/content/guild.tsx docs/superpowers/plans/2026-08-17-guild-raid-competition.md
git commit -m "docs: explain weekly guild raids"
```
