# Referral Tutorial Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the referral event's five repeated hunt milestones with an independently completable hunt, guild, and life-skill tutorial roadmap while preserving the existing 12-potion-per-side cap and all previously paid progress.

**Architecture:** A shared, client-safe catalog defines the six roadmap positions and pure threshold mapping. PostgreSQL stores the five paid progression task IDs on each referral conversion; one server-only service locks that conversion, adds only new task IDs, and atomically creates aggregated inbox rewards for both users. Server-authoritative hunt, guild, and life routes emit candidate task IDs, while a separate idempotent sync endpoint catches pre-existing progress and supplies the mobile roadmap UI.

**Tech Stack:** Next.js 16.2 Route Handlers and Client Components, React 19, TypeScript, Drizzle ORM/PostgreSQL, Vitest

## Global Constraints

- Do not deploy to any environment.
- The six positions are exactly: signup, hunt depth 24, guild join/create, highest life level 5, hunt depth 36, highest life level 10.
- Tasks are independent; reaching depth 36 or life level 10 may complete both thresholds at once.
- Life level is the maximum normalized level among fishing, farming, woodcutting, mining, and cooking.
- Each position pays two stamina potions to the referred user and two to the referrer; each side remains capped at twelve per friend.
- Preserve previous payments by filling the new post-signup roadmap positions from the front according to legacy `rewardedStaminaDepth`.
- Do not show migration or legacy-payment labels in the UI; migrated positions look like ordinary completed positions.
- A submitted guild application is not completion; accepted membership, accepted invite, and guild creation are completion.
- Completed task IDs survive guild leave and later state changes.
- Use opaque `Card`/`SURFACE_INSET` surfaces and preserve unrelated worktree changes.
- Follow the repository's Next.js 16.2 documentation before editing Route Handlers or Client Components.
- Execute inline in the current session because project instructions prohibit subagents unless the user explicitly requests them.

---

## File Map

- `src/adventure/data/v2/referralTutorial.ts`: client/server-safe roadmap catalog, IDs, normalization, and hunt/life threshold helpers.
- `src/lib/server/referrals.ts`: authoritative row-locking reward service and existing attribution behavior.
- `src/lib/server/referralTutorialProgress.ts`: loads current frontier, membership, and five normalized life levels for reconciliation.
- `src/app/api/referrals/me/route.ts`: referrer and referred-user summary response.
- `src/app/api/referrals/me/sync/route.ts`: explicit mutating reconciliation endpoint.
- `src/adventure/v2/ReferralTutorialRoadmap.tsx`: reusable opaque vertical roadmap.
- `src/adventure/v2/V2ReferralView.tsx`: fetch flow, personal roadmap, and per-friend expansion.
- `src/db/schema.ts` and `drizzle/0164_referral_tutorial_tasks.sql`: persistent paid-task IDs and legacy backfill.
- Hunt, guild, and five life action routes: emit candidates inside their existing transactions.

### Task 1: Add the roadmap catalog and persistent legacy backfill

**Files:**
- Create: `src/adventure/data/v2/referralTutorial.ts`
- Create: `src/adventure/data/v2/referralTutorial.test.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0164_referral_tutorial_tasks.sql`
- Create: `drizzle/meta/0164_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Create: `src/db/referralTutorialMigration.test.ts`

**Interfaces:**
- Produces: `ReferralTutorialTaskId`
- Produces: `ReferralTutorialProgressTaskId`, excluding `signup`
- Produces: `REFERRAL_TUTORIAL_TASKS`, six ordered entries including `signup`
- Produces: `REFERRAL_PROGRESS_TASK_IDS`, the five paid post-signup IDs
- Produces: `normalizeReferralProgressTaskIds(value: unknown): ReferralTutorialProgressTaskId[]`
- Produces: `referralHuntTaskIds(frontierDepth: unknown): ReferralTutorialProgressTaskId[]`
- Produces: `referralLifeTaskIds(lifeLevel: unknown): ReferralTutorialProgressTaskId[]`
- Produces: `referralLegacyTaskIds(rewardedDepth: unknown): ReferralTutorialProgressTaskId[]`
- Produces: `referralConversions.completedTutorialTaskIds: string[]`

- [ ] **Step 1: Write failing pure catalog tests**

Test the exact six-position order, `24 → [hunt_depth_24]`, `36 → [hunt_depth_24, hunt_depth_36]`, `5 → [life_level_5]`, `10 → [life_level_5, life_level_10]`, and normalization of duplicated/unknown IDs. Add a table test mapping legacy depths `0, 6, 12, 18, 24, 36` to the first `0..5` progression IDs.

- [ ] **Step 2: Run the catalog test and verify RED**

Run: `npm test -- src/adventure/data/v2/referralTutorial.test.ts`

Expected: FAIL because `referralTutorial.ts` does not exist.

- [ ] **Step 3: Implement the client-safe catalog and helpers**

Define immutable entries with IDs, Korean title/description, reward `2`, and hrefs `/battle`, `/guild`, or `/character/life`. Implement threshold helpers using finite, floored, non-negative numbers, and normalize IDs through the fixed roadmap order rather than input order.

- [ ] **Step 4: Run the catalog test and verify GREEN**

Run: `npm test -- src/adventure/data/v2/referralTutorial.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the schema and migration contract test**

Add a test that reads the generated `0164` SQL and asserts it adds `completed_tutorial_task_ids text[] NOT NULL`, backfills each legacy `rewarded_stamina_depth` case to the expected prefix, and constrains values to the five allowed IDs with cardinality at most five.

- [ ] **Step 6: Add the Drizzle column and generate migration artifacts**

Add this field to `referralConversions`:

```ts
completedTutorialTaskIds: text("completed_tutorial_task_ids")
  .array()
  .default(sql`ARRAY[]::text[]`)
  .notNull(),
```

Run: `npm run db:generate`

Expected: creates migration `0164` and its snapshot. Rename the generated SQL/tag to `0164_referral_tutorial_tasks` consistently in the SQL filename and `_journal.json`. If concurrent work has claimed `0164` before execution begins, stop and update every plan reference to the next free index before editing schema artifacts.

- [ ] **Step 7: Add deterministic backfill SQL and database guard**

Update every existing row with a prefix array selected from `rewarded_stamina_depth`:

```sql
CASE rewarded_stamina_depth
  WHEN 6 THEN ARRAY['hunt_depth_24']
  WHEN 12 THEN ARRAY['hunt_depth_24','join_guild']
  WHEN 18 THEN ARRAY['hunt_depth_24','join_guild','life_level_5']
  WHEN 24 THEN ARRAY['hunt_depth_24','join_guild','life_level_5','hunt_depth_36']
  WHEN 36 THEN ARRAY['hunt_depth_24','join_guild','life_level_5','hunt_depth_36','life_level_10']
  ELSE ARRAY[]::text[]
END
```

Add a check using `<@` against the allowed ID array and `cardinality(...) <= 5`.

- [ ] **Step 8: Verify migration and schema**

Run: `npm test -- src/adventure/data/v2/referralTutorial.test.ts src/db/referralTutorialMigration.test.ts`

Run: `npm run check-migrations`

Expected: PASS.

- [ ] **Step 9: Commit the data model**

```bash
git add src/adventure/data/v2/referralTutorial.ts src/adventure/data/v2/referralTutorial.test.ts src/db/schema.ts src/db/referralTutorialMigration.test.ts drizzle/0164_referral_tutorial_tasks.sql drizzle/meta/0164_snapshot.json drizzle/meta/_journal.json
git commit -m "feat: define referral tutorial roadmap"
```

### Task 2: Replace depth-only payouts with the idempotent task reward service

**Files:**
- Modify: `src/lib/server/referrals.ts`
- Modify: `src/lib/server/referrals.test.ts`

**Interfaces:**
- Consumes: `ReferralTutorialProgressTaskId[]` and the schema field from Task 1
- Produces: `rewardReferralTutorialTasks(tx, referredUserId, referredName, candidateTaskIds): Promise<{ staminaPotions: number; newlyCompletedTaskIds: ReferralTutorialProgressTaskId[]; completedTaskIds: ReferralTutorialProgressTaskId[] }>`

- [ ] **Step 1: Replace the depth-only service tests with task-ID tests**

Cover first completion, simultaneous two-task completion, unknown/duplicate candidate normalization, already-completed retry, migrated-prefix retry, missing conversion, deleted referred user, and all-five cap. Assert one aggregated inbox row per side and `2 × newlyCompletedTaskIds.length` potions.

- [ ] **Step 2: Run the referral service tests and verify RED**

Run: `npm test -- src/lib/server/referrals.test.ts`

Expected: FAIL because the task service and new selected column do not exist.

- [ ] **Step 3: Implement the row-locking task service**

Select `referrerUserId`, `referredUserId`, and `completedTutorialTaskIds` with `FOR UPDATE`. Normalize stored and candidate IDs, compute only missing candidates, return without writes when empty, update the completed array, and insert two aggregated `admin_gift` inbox messages in the same transaction.

The referred message names completed tasks and the referrer message includes the referred character name. Do not update `rewardedStaminaDepth`; it remains legacy audit data.

- [ ] **Step 4: Remove the old depth milestone constants and function**

Delete `REFERRAL_REWARD_DEPTHS`, `ReferralRewardMilestone`, `referralRewardMilestones`, and the old depth-loop payout implementation after all local service tests use task IDs. Keep signup constants and attribution behavior unchanged.

- [ ] **Step 5: Run service regressions**

Run: `npm test -- src/lib/server/referrals.test.ts src/lib/server/referralIdentity.test.ts`

Expected: PASS, including signup double-claim protection.

- [ ] **Step 6: Commit the reward service**

```bash
git add src/lib/server/referrals.ts src/lib/server/referrals.test.ts
git commit -m "feat: reward referral tutorial tasks"
```

### Task 3: Add progress reconciliation and summary APIs

**Files:**
- Create: `src/lib/server/referralTutorialProgress.ts`
- Create: `src/lib/server/referralTutorialProgress.test.ts`
- Modify: `src/app/api/referrals/me/route.ts`
- Modify: `src/app/api/referrals/me/route.test.ts`
- Create: `src/app/api/referrals/me/sync/route.ts`
- Create: `src/app/api/referrals/me/sync/route.test.ts`

**Interfaces:**
- Produces: `loadReferralTutorialSnapshot(executor, userId): Promise<{ frontierDepth: number; hasGuild: boolean; maxLifeLevel: number; taskIds: ReferralTutorialProgressTaskId[] }>`
- Produces: `POST /api/referrals/me/sync`, returning `{ ok: true, newlyCompletedTaskIds, staminaPotions }`
- Extends: `GET /api/referrals/me` with `tutorialTasks`, `myReferralProgress`, and friend `completedTaskIds`

- [ ] **Step 1: Write failing snapshot tests**

Build raw save fixtures for all five life systems and assert the loader takes the maximum normalized level, derives both lower threshold IDs when level/depth are high, and reports actual guild membership rather than character affiliation text.

- [ ] **Step 2: Run the snapshot test and verify RED**

Run: `npm test -- src/lib/server/referralTutorialProgress.test.ts`

Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Implement the focused snapshot loader**

Read `character.v2`, `farm.v2`, `fishing-progress.v1`, `woodcutting-log.v1`, `mining-log.v1`, and `cooking.v1`; query `guild_members`; reuse each domain parser and level helper. Return the ordered union of hunt, guild, and life task IDs.

- [ ] **Step 4: Write failing sync route tests**

Assert authentication/session checks, snapshot candidates passed to `rewardReferralTutorialTasks`, no-op for a user without referral attribution, and an idempotent success response.

- [ ] **Step 5: Implement the explicit POST sync route**

Use `ensureOriginalUser` plus `requireActiveDeviceSession`, rate-limit the action, and run snapshot loading plus task payout in one database transaction. Load the character name from the snapshot or profile data for inbox copy. Do not mutate state in GET.

- [ ] **Step 6: Write failing summary response tests**

Assert the response includes the six roadmap definitions, the current referred user's own completed IDs when applicable, friend task IDs, `completedRewardStages = signup + completed IDs`, and total referrer potions computed from the same count. Assert migrated IDs have no legacy label field.

- [ ] **Step 7: Implement the summary response**

Query the current user's referred conversion separately from their outgoing referrals. Normalize every stored task array, retain deleted friend rows in referrer totals, and remove depth-derived milestone counts from the response.

- [ ] **Step 8: Run API tests**

Run: `npm test -- src/lib/server/referralTutorialProgress.test.ts src/app/api/referrals/me/route.test.ts src/app/api/referrals/me/sync/route.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit reconciliation and APIs**

```bash
git add src/lib/server/referralTutorialProgress.ts src/lib/server/referralTutorialProgress.test.ts src/app/api/referrals/me/route.ts src/app/api/referrals/me/route.test.ts src/app/api/referrals/me/sync/route.ts src/app/api/referrals/me/sync/route.test.ts
git commit -m "feat: sync referral tutorial progress"
```

### Task 4: Connect hunt and all guild membership success paths

**Files:**
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/lib/server/huntRoute.test.ts`
- Modify: `src/app/api/guilds/invites/[inviteId]/accept/route.ts`
- Create: `src/app/api/guilds/invites/[inviteId]/accept/route.test.ts`
- Modify: `src/app/api/guilds/requests/[requestId]/accept/route.ts`
- Create: `src/app/api/guilds/requests/[requestId]/accept/route.test.ts`
- Modify: `src/app/api/v2/guild/create/route.ts`
- Create: `src/app/api/v2/guild/create/route.test.ts`

**Interfaces:**
- Consumes: `referralHuntTaskIds` and `rewardReferralTutorialTasks`
- Emits: `join_guild` only after an actual `guild_members` insert succeeds

- [ ] **Step 1: Update hunt route mocks and add failing threshold tests**

Assert depths below 24 emit no candidate, crossing 24 emits `hunt_depth_24`, crossing directly to 36 emits both hunt IDs, and the response mail-refresh flag is true only when `staminaPotions > 0`.

- [ ] **Step 2: Implement hunt task emission**

Replace `rewardReferralProgress(...frontierDepth)` with `rewardReferralTutorialTasks(...referralHuntTaskIds(next.frontierDepth))` at the existing server-authoritative frontier update boundary.

- [ ] **Step 3: Add failing tests for the three guild success paths**

In invite acceptance, join-request acceptance, and guild creation tests, assert `rewardReferralTutorialTasks` is called once with the newly joined/created user's ID and `["join_guild"]`. Assert failed, pending, declined, full, cooldown, or duplicate membership paths do not call it.

- [ ] **Step 4: Implement guild task emission inside each transaction**

Call the reward service after membership creation succeeds and before returning/committing. Use the joining user's character/game name; fall back to `"새 모험가"` only when no profile name is available.

- [ ] **Step 5: Run hunt and guild route tests**

Run: `npm test -- src/lib/server/huntRoute.test.ts src/app/api/guilds/invites/[inviteId]/accept/route.test.ts src/app/api/guilds/requests/[requestId]/accept/route.test.ts src/app/api/v2/guild/create/route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit hunt and guild hooks**

```bash
git add src/app/api/v2/dungeon/hunt/route.ts src/lib/server/huntRoute.test.ts src/app/api/guilds/invites/[inviteId]/accept/route.ts src/app/api/guilds/requests/[requestId]/accept/route.ts src/app/api/v2/guild/create/route.ts src/app/api/guilds/invites/[inviteId]/accept/route.test.ts src/app/api/guilds/requests/[requestId]/accept/route.test.ts src/app/api/v2/guild/create/route.test.ts
git commit -m "feat: track referral hunt and guild tasks"
```

### Task 5: Connect the five life-level success paths

**Files:**
- Modify: `src/app/api/v2/fishing/reel/route.ts`
- Modify: `src/lib/server/fishingReelRoute.test.ts`
- Modify: `src/app/api/v2/farm/harvest/route.ts`
- Modify: `src/lib/server/farmHarvestRoute.test.ts`
- Modify: `src/app/api/v2/woodcutting/chop/route.ts`
- Modify: `src/lib/server/woodcuttingRoute.test.ts`
- Modify: `src/app/api/v2/mining/strike/route.ts`
- Modify: `src/lib/server/miningRoute.test.ts`
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/app/api/v2/cooking/route.test.ts`

**Interfaces:**
- Consumes: `referralLifeTaskIds(currentDomainLevel)` and `rewardReferralTutorialTasks`
- Emits: `life_level_5` and/or `life_level_10` after the new life state is persisted in the same transaction

- [ ] **Step 1: Add failing route-level emission tests for all five domains**

For each domain, mock the common service and construct a successful action whose normalized post-action level is 5 or 10. Assert the exact candidate IDs and referred user ID. Add one below-threshold case and assert the service is either skipped or receives an empty list without producing mail.

- [ ] **Step 2: Run the five focused test files and verify RED**

Run: `npm test -- src/lib/server/fishingReelRoute.test.ts src/lib/server/farmHarvestRoute.test.ts src/lib/server/woodcuttingRoute.test.ts src/lib/server/miningRoute.test.ts src/app/api/v2/cooking/route.test.ts`

Expected: FAIL because no route emits life candidates.

- [ ] **Step 3: Implement fishing and farming hooks**

After saving `progressResult.state`, pass `progressView.level` to `referralLifeTaskIds`. After saving harvested farm state, pass `harvestResult.farmingLevel`. Keep calls inside the current transaction and after server-side XP computation.

- [ ] **Step 4: Implement woodcutting and mining hooks**

After recording each successful log, compute the normalized level with the existing progression view/helper and pass it to the common service. Do not reward failed chops/strikes or activity-verification rejections.

- [ ] **Step 5: Implement cooking hook**

After cooking/order XP is added and `cooking.v1` is saved, pass `cookingLevelForXp(cooking.xp)` to the common service. Favorite toggles and non-XP requests must not emit tasks.

- [ ] **Step 6: Run life route regressions**

Run: `npm test -- src/lib/server/fishingReelRoute.test.ts src/lib/server/farmHarvestRoute.test.ts src/lib/server/woodcuttingRoute.test.ts src/lib/server/miningRoute.test.ts src/app/api/v2/cooking/route.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit life hooks**

```bash
git add src/app/api/v2/fishing/reel/route.ts src/lib/server/fishingReelRoute.test.ts src/app/api/v2/farm/harvest/route.ts src/lib/server/farmHarvestRoute.test.ts src/app/api/v2/woodcutting/chop/route.ts src/lib/server/woodcuttingRoute.test.ts src/app/api/v2/mining/strike/route.ts src/lib/server/miningRoute.test.ts src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts
git commit -m "feat: track referral life tasks"
```

### Task 6: Replace milestone tiles with the mobile tutorial roadmap

**Files:**
- Create: `src/adventure/v2/ReferralTutorialRoadmap.tsx`
- Create: `src/adventure/v2/ReferralTutorialRoadmap.test.tsx`
- Modify: `src/adventure/v2/V2ReferralView.tsx`
- Modify: `src/adventure/v2/V2ReferralView.test.ts`

**Interfaces:**
- Consumes: ordered `tutorialTasks`, `signupRewarded`, and `completedTaskIds`
- Produces: `<ReferralTutorialRoadmap tasks completedTaskIds signupRewarded showActions />`
- Changes: initial load performs `POST /api/referrals/me/sync`, then `GET /api/referrals/me`

- [ ] **Step 1: Write failing roadmap rendering tests**

Render the pure component to static markup. Assert six ordered rows, completed checks, uncompleted action links, no link on signup, opaque surface classes, and absence of `기존 지급분`, `승계`, or legacy depth 6/12/18 copy.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/adventure/v2/ReferralTutorialRoadmap.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the vertical roadmap component**

Use an ordered list with numbered circles, completed check icons, title/description, `양쪽 회복약 2개`, and a compact action link for incomplete tasks. Use `SURFACE_INSET`; never apply whole-card opacity to incomplete rows.

- [ ] **Step 4: Update the referral view data model and load flow**

Replace milestone-depth fields with task definitions and completed IDs. On initial/retry load, POST sync first; then fetch the summary even if sync returns no new tasks. If sync fails, keep the page retryable rather than showing stale success.

- [ ] **Step 5: Replace the six-column depth grid and friend progress details**

Show the roadmap preview to all users, the referred user's own live roadmap when `myReferralProgress` exists, and each friend's `completed/6` with a native `<details>` expansion containing the same roadmap in read-only mode. Migrated tasks render exactly like ordinary completed tasks.

- [ ] **Step 6: Update view helper tests**

Make status copy task-based rather than current hunt-depth-based. Deleted referrals show `탈퇴 · 보상 완료 N단계`; active referrals show `보상 완료 N단계` without treating hunt depth as the overall progression label.

- [ ] **Step 7: Run UI tests and scoped lint**

Run: `npm test -- src/adventure/v2/ReferralTutorialRoadmap.test.tsx src/adventure/v2/V2ReferralView.test.ts`

Run: `npx eslint src/adventure/v2/ReferralTutorialRoadmap.tsx src/adventure/v2/ReferralTutorialRoadmap.test.tsx src/adventure/v2/V2ReferralView.tsx src/adventure/v2/V2ReferralView.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the roadmap UI**

```bash
git add src/adventure/v2/ReferralTutorialRoadmap.tsx src/adventure/v2/ReferralTutorialRoadmap.test.tsx src/adventure/v2/V2ReferralView.tsx src/adventure/v2/V2ReferralView.test.ts
git commit -m "feat: show referral tutorial roadmap"
```

### Task 7: Update help copy and perform final verification

**Files:**
- Modify: `src/app/manual/content/controls.tsx`
- Modify: `src/app/manual/current-content.test.tsx`
- Modify: all files listed above only as required by verification findings

**Interfaces:**
- Produces: user-facing help matching the six final tasks and 12-potion cap

- [ ] **Step 1: Update the manual**

Replace the old statement that every reward comes from designated hunt-stage clears with concise copy naming hunt depth 24/36, guild membership, and highest life level 5/10. State that each completed position pays two potions to both users and each side can receive twelve total.

- [ ] **Step 2: Run all focused referral and integration tests**

Run:

```bash
npm test -- \
  src/adventure/data/v2/referralTutorial.test.ts \
  src/db/referralTutorialMigration.test.ts \
  src/lib/server/referrals.test.ts \
  src/lib/server/referralTutorialProgress.test.ts \
  src/app/api/referrals/me/route.test.ts \
  src/app/api/referrals/me/sync/route.test.ts \
  src/lib/server/huntRoute.test.ts \
  src/lib/server/fishingReelRoute.test.ts \
  src/lib/server/farmHarvestRoute.test.ts \
  src/lib/server/woodcuttingRoute.test.ts \
  src/lib/server/miningRoute.test.ts \
  src/app/api/v2/cooking/route.test.ts \
  src/adventure/v2/ReferralTutorialRoadmap.test.tsx \
  src/adventure/v2/V2ReferralView.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run migration, type, and lint checks**

Run: `npm run check-migrations`

Run: `npx tsc --noEmit --pretty false`

Run scoped ESLint for every modified TypeScript/TSX file.

Expected: all commands exit 0.

- [ ] **Step 4: Run the full suite**

Run: `npm test`

Expected: PASS with only the repository's known skipped tests.

- [ ] **Step 5: Review scope and whitespace**

Run `git diff --check` for the referral roadmap files and inspect `git status --short`. Confirm activity-verification and other unrelated changes are neither edited nor staged by this feature.

- [ ] **Step 6: Commit final documentation or verification fixes**

```bash
git add src/app/manual/content/controls.tsx src/app/manual/current-content.test.tsx
git commit -m "docs: explain referral tutorial rewards"
```

- [ ] **Step 7: Preserve the branch without deployment**

Report the commits, verification evidence, and any untouched unrelated worktree changes. Do not push, create a PR, merge, deploy, or change maintenance mode unless the user explicitly requests it.
