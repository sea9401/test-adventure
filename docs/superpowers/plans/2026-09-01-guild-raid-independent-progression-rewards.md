# Guild Raid Independent Progression and Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every guild advance its own raid boss, remove the 1,200,000 per-attempt damage ceiling, settle rankings on Saturday, let eligible members claim weekend rewards directly, and paginate rankings and recent attacks by eight.

**Architecture:** Keep `guild_raid_events` as the shared weekly lifecycle and extend `guild_raid_guild_scores` into the per-guild run row. Add an explicit combat damage meter to the PvE engine, snapshot personal rewards during settlement, and expose transactional claim plus server-paginated read APIs. Preserve existing request idempotency and reuse the current panel, replay, save-lock, and surface patterns.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript, Drizzle ORM/PostgreSQL, Vitest, Tailwind shared surfaces.

## Global Constraints

- KST combat window is Monday 00:00 through Saturday 00:00 exclusive.
- KST claim window is Saturday 00:00 through the next Monday 00:00 exclusive; unclaimed rewards then expire.
- Daily attacks remain 3 and never roll over.
- Eligibility remains at least 3 valid weekly attacks and at least 1 personal damage.
- Reward totals are: rank 1 = 5,000,000 gold and 500 mastery certificates; ranks 2-3 = 3,000,000 and 300; ranks 4-10 = 1,000,000 and 100; all other participating guilds = 500,000 and 50.
- Ties use standard competition ranking (`1, 1, 3`) and identical rewards.
- Ranking and recent attack page sizes are fixed at 8 and page numbers are one-based.
- Never parse Korean battle-log text to calculate damage.
- Do not change ordinary hunts, PvP, or ordinary co-op boss behavior.
- Use `SURFACE_CARD`, `SURFACE_INSET`, or `SURFACE_ACCENT` for opaque cards; do not add translucent content surfaces.
- Do not deploy or change maintenance mode.

---

### Task 1: Pure raid schedule, reward, run, and pagination policies

**Files:**
- Modify: `src/adventure/data/v2/guildRaid.ts`
- Modify: `src/adventure/data/v2/guildRaid.test.ts`

**Interfaces:**
- Produces: `GUILD_RAID_PAGE_SIZE = 8`.
- Produces: `guildRaidCombatEndsAt(weekStart: Date): Date`.
- Produces: `guildRaidPhase(now, event): "active" | "claim" | "expired"`.
- Produces: `guildRaidRewardForRank(rank: number): { gold: number; masteryCertificates: number }`.
- Produces: `normalizeGuildRaidPage(page: unknown, total: number): { page: number; totalPages: number; offset: number; limit: 8 }`.
- Keeps: `applyGuildRaidDamage`, `isGuildRaidParticipantEligible`, and `rankGuildRaidScores`.

- [ ] **Step 1: Add failing policy tests**

```ts
it("토벌전은 토요일 00:00 KST에 전투를 끝낸다", () => {
  expect(guildRaidCombatEndsAt(new Date("2026-08-30T15:00:00Z")))
    .toEqual(new Date("2026-09-04T15:00:00Z"));
});

it.each([
  [1, 5_000_000, 500], [3, 3_000_000, 300],
  [10, 1_000_000, 100], [11, 500_000, 50],
])("%i위 보상을 확정한다", (rank, gold, masteryCertificates) => {
  expect(guildRaidRewardForRank(rank)).toEqual({ gold, masteryCertificates });
});

it("8개 단위 페이지를 마지막 유효 범위로 보정한다", () => {
  expect(normalizeGuildRaidPage(9, 17)).toEqual({ page: 3, totalPages: 3, offset: 16, limit: 8 });
});
```

- [ ] **Step 2: Run the pure policy test and confirm RED**

Run: `npx vitest run src/adventure/data/v2/guildRaid.test.ts`

Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Implement the constants and pure helpers**

Use KST week start plus five days for the Saturday boundary. Normalize invalid pages to page 1 and empty collections to `totalPages: 1` so the UI always has a stable page label.

- [ ] **Step 4: Run the pure policy test and confirm GREEN**

Run: `npx vitest run src/adventure/data/v2/guildRaid.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/data/v2/guildRaid.ts src/adventure/data/v2/guildRaid.test.ts
git commit -m "feat: define guild raid weekly reward rules"
```

### Task 2: Structured uncapped raid damage meter

**Files:**
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/tier6UniquePveAdapter.ts`
- Modify: `src/lib/server/guildRaidBattle.ts`
- Modify: `src/lib/server/guildRaidBattle.test.ts`
- Test: `src/adventure/v2/combat/guildRaidDamageMeter.test.ts`

**Interfaces:**
- Produces: optional `ResolveContext.damageMeter` with `{ continueAfterDefeat: true; refillHp: number }`.
- Produces: `BattleState.enemyDamageDealtTotal`, initialized to `0` only when damage-meter mode is enabled.
- Produces: `BattleResolution.damageDealtTotal?: number`.
- Consumes: existing `COOP_ATTACK_TURNS` and `COOP_BOSS_MAX_HP_DAMAGE_MULT`.
- `simulateGuildRaidBattle` returns the structured total instead of `bossHp - finalEnemyHp`.

- [ ] **Step 1: Add failing combat-meter tests**

```ts
it("원형 HP를 넘긴 마지막 타격 전체를 계측한다", () => {
  const result = resolveBattleAtb(highDamagePlayer, boss, "공격자", {
    ...context,
    damageMeter: { continueAfterDefeat: true, refillHp: boss.hp },
    maxTurns: 1,
  });
  expect(result.damageDealtTotal).toBeGreaterThan(boss.hp);
});

it("구간 돌파 뒤 플레이어 상태를 유지하고 3000틱까지 계속한다", () => {
  expect(result.finalState.log.some((entry) => entry.text.includes("피해 계측 구간 돌파"))).toBe(true);
  expect(result.damageDealtTotal).toBeGreaterThan(1_200_000);
});
```

Also add an adapter test in which mocked `resolveBattle` returns `damageDealtTotal: 1_500_000` and assert `simulateGuildRaidBattle().damageDealt === 1_500_000`.

- [ ] **Step 2: Run meter tests and confirm RED**

Run: `npx vitest run src/adventure/v2/combat/guildRaidDamageMeter.test.ts src/lib/server/guildRaidBattle.test.ts`

Expected: FAIL because the context and structured total are absent.

- [ ] **Step 3: Implement structured damage accounting**

Add a single engine helper that applies resolved player-origin damage before HP clamping:

```ts
function applyEnemyDamage(state: BattleState, rawDamage: number): BattleState {
  const damage = Math.max(0, Math.floor(rawDamage));
  return {
    ...state,
    enemyHp: Math.max(0, state.enemyHp - damage),
    ...(state.enemyDamageDealtTotal == null
      ? {}
      : { enemyDamageDealtTotal: state.enemyDamageDealtTotal + damage }),
  };
}
```

Route direct attacks, skills, DoTs, counters, reflections, and player-origin extra damage through the helper without altering their existing formulas. At the ATB actor boundary, when damage-meter mode sees an enemy victory while the player is alive, append a structured checkpoint log, restore `enemyHp` to `refillHp`, clear only enemy defeat outcome/phase, and continue with player HP/MP/buffs/cooldowns/timeline intact. Ordinary contexts retain the old stop-on-defeat path byte-for-byte.

- [ ] **Step 4: Return and consume the structured total**

Set `BattleResolution.damageDealtTotal` from final state only for meter mode. Change `guildRaidBattle.ts` to require that value and retain the old subtraction only as backward-compatible fallback for tests or old feature-flag paths.

- [ ] **Step 5: Run focused engine and adapter tests**

Run: `npx vitest run src/adventure/v2/combat/guildRaidDamageMeter.test.ts src/lib/server/guildRaidBattle.test.ts src/adventure/v2/combat/combatAtb.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adventure/v2/combat src/lib/server/guildRaidBattle.ts src/lib/server/guildRaidBattle.test.ts
git commit -m "fix: remove guild raid damage ceiling"
```

### Task 3: Persist per-guild runs and reward snapshots

**Files:**
- Modify: `src/db/schema.ts`
- Create: next generated `drizzle/0179_*.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: next generated Drizzle snapshot if generation emits one

**Interfaces:**
- `guildRaidGuildScores` adds non-null `stage`, `hp`, and `maxHp`.
- `guildRaidParticipants` adds nullable `rewardGold`, `rewardMasteryCertificates`, and `rewardClaimedAt`.

- [ ] **Step 1: Extend the Drizzle schema**

```ts
stage: integer("stage").notNull().default(1),
hp: bigint("hp", { mode: "number" }).notNull(),
maxHp: bigint("max_hp", { mode: "number" }).notNull(),
// participant fields
rewardGold: bigint("reward_gold", { mode: "number" }),
rewardMasteryCertificates: integer("reward_mastery_certificates"),
rewardClaimedAt: timestamp("reward_claimed_at"),
```

Add positive run HP/stage checks and nonnegative reward checks.

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`

Expected: one new migration and matching journal/snapshot entries.

- [ ] **Step 3: Amend generated SQL with active-event backfill**

Before making run HP columns non-null, copy each score row's event `stage`, `hp`, and `max_hp`. New application inserts always provide explicit run values. Inspect the SQL rather than accepting destructive drop/recreate statements.

- [ ] **Step 4: Validate migrations**

Run: `npm run check-migrations`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle
git commit -m "feat: persist independent guild raid runs"
```

### Task 4: Move attacks from the global event to the guild run

**Files:**
- Modify: `src/lib/server/guildRaidAttack.ts`
- Modify: `src/lib/server/guildRaidAttack.test.ts`
- Modify: `src/lib/server/guildRaidLifecycle.ts`
- Modify: `src/lib/server/guildRaidLifecycle.test.ts`

**Interfaces:**
- `GuildRaidAttackMutationInput` consumes separate `event` lifecycle and `run: GuildRaidStageState`.
- Successful mutation returns `run`, never a mutated global event.
- `GuildRaidScoreRecord` includes `stage`, `hp`, and `maxHp`.

- [ ] **Step 1: Add failing independent-run and Saturday-boundary tests**

Test two guild runs under one event and assert an attack changes only its supplied run. Change lifecycle fixtures so `endsAt` is Saturday 00:00 KST and assert Friday 23:59:59 accepts while Saturday 00:00 rejects.

- [ ] **Step 2: Run attack and lifecycle tests and confirm RED**

Run: `npx vitest run src/lib/server/guildRaidAttack.test.ts src/lib/server/guildRaidLifecycle.test.ts`

Expected: FAIL against global event mutation and Monday ending.

- [ ] **Step 3: Create and lock the guild run row**

In the attack transaction, insert an initial run with `stage: 1`, `hp: guildRaidMaxHp(1)`, `maxHp: guildRaidMaxHp(1)`, and `damage: 0` using conflict-do-nothing. Then select `(eventId, guildId) FOR UPDATE`, validate participant lock and request idempotency, and apply total damage to that run.

- [ ] **Step 4: Stop mutating event HP**

Update only `guildRaidGuildScores.stage/hp/maxHp/damage` and keep event fields unchanged. Persist attack log `stageBefore`, `stageAfter`, `hpBefore`, and `hpAfter` from the guild run.

- [ ] **Step 5: Use Saturday lifecycle ending**

Create new events with `guildRaidCombatEndsAt(startsAt)`. Settlement continues to rank the full score set and snapshots participant eligibility.

- [ ] **Step 6: Run focused server tests**

Run: `npx vitest run src/lib/server/guildRaidAttack.test.ts src/lib/server/guildRaidLifecycle.test.ts src/lib/server/guildRaidBattle.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/guildRaidAttack.ts src/lib/server/guildRaidAttack.test.ts src/lib/server/guildRaidLifecycle.ts src/lib/server/guildRaidLifecycle.test.ts
git commit -m "feat: isolate guild raid boss progression"
```

### Task 5: Snapshot and claim weekend rewards transactionally

**Files:**
- Create: `src/lib/server/guildRaidReward.ts`
- Create: `src/lib/server/guildRaidReward.test.ts`
- Create: `src/app/api/v2/guild/raid/claim/route.ts`
- Create: `src/app/api/v2/guild/raid/claim/route.test.ts`
- Modify: `src/lib/server/guildRaidLifecycle.ts`
- Modify: `src/lib/server/guildRaidLifecycle.test.ts`

**Interfaces:**
- Produces: `claimGuildRaidReward({ userId, now }): Promise<GuildRaidClaimOutcome>`.
- Success returns `{ ok: true, alreadyClaimed, gold, masteryCertificates }`.
- Stable errors: `not_settled`, `not_eligible`, `reward_expired`, `no_participation`.

- [ ] **Step 1: Add failing settlement reward snapshot tests**

For ranks 1, 3, 10, and 11, assert eligible participants receive the exact reward fields while ineligible participants keep null reward fields.

- [ ] **Step 2: Add failing claim service tests**

Use a memory store boundary to assert successful additions to `character.v2.gold` and `inventory.v2.masteryCertificates`, an idempotent second claim, rejection before Saturday, and expiration at Monday 00:00.

- [ ] **Step 3: Run reward tests and confirm RED**

Run: `npx vitest run src/lib/server/guildRaidLifecycle.test.ts src/lib/server/guildRaidReward.test.ts`

Expected: FAIL because reward snapshots and claim service do not exist.

- [ ] **Step 4: Snapshot rewards during settlement**

Map participant fixed `guildId` to the settled score rank. If eligible, persist `guildRaidRewardForRank(finalRank)`; otherwise persist null reward values. Never recompute on claim.

- [ ] **Step 5: Implement the claim transaction**

Lock the participant row first, validate the current event's claim window, then use `lockSavesForUpdate` for `character.v2` and `inventory.v2`. Add rewards with nonnegative safe-integer clamping, call `upsertSaves`, and conditionally set `rewardClaimedAt`. Return `alreadyClaimed: true` without another grant on retry.

- [ ] **Step 6: Add authenticated rate-limited claim route**

Map errors to stable HTTP statuses and record economy success/failure through existing economy-log helpers.

- [ ] **Step 7: Run service and route tests**

Run: `npx vitest run src/lib/server/guildRaidReward.test.ts src/app/api/v2/guild/raid/claim/route.test.ts src/lib/server/guildRaidLifecycle.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/guildRaidReward.ts src/lib/server/guildRaidReward.test.ts src/lib/server/guildRaidLifecycle.ts src/lib/server/guildRaidLifecycle.test.ts src/app/api/v2/guild/raid/claim
git commit -m "feat: add guild raid weekend rewards"
```

### Task 6: Serve per-guild state and two server-paginated lists

**Files:**
- Modify: `src/lib/server/guildRaidRead.ts`
- Create: `src/lib/server/guildRaidRead.test.ts`
- Modify: `src/app/api/v2/guild/raid/route.ts`
- Modify: `src/app/api/v2/guild/raid/route.test.ts`
- Modify: `src/adventure/v2/guild/guildRaidTypes.ts`

**Interfaces:**
- `readGuildRaidState(userId, { now, leaderboardPage, recentPage })`.
- `leaderboard` and `recentAttacks` become `{ items, page, pageSize, totalItems, totalPages }`.
- State includes `claim: { status, gold, masteryCertificates, claimedAt, claimEndsAt }`.

- [ ] **Step 1: Add failing read tests**

Assert an absent score returns virtual stage 1/full HP, a present score returns that guild's run, leaderboard pages preserve globally calculated tie ranks, recent attacks filter by locked/current guild, and page 9 clamps to the last page.

- [ ] **Step 2: Add failing route query tests**

Call `GET(new Request("http://localhost/api/v2/guild/raid?leaderboardPage=2&recentPage=3"))` and assert the service receives pages 2 and 3.

- [ ] **Step 3: Run read and route tests and confirm RED**

Run: `npx vitest run src/lib/server/guildRaidRead.test.ts src/app/api/v2/guild/raid/route.test.ts`

Expected: FAIL against flat arrays and a parameterless route.

- [ ] **Step 4: Implement read pagination and no-current-guild claim access**

Resolve the current participant before rejecting no guild. Use current guild ID when present, otherwise the participant's fixed guild ID during settlement. Rank the full score set, then slice eight. Filter recent logs to the viewer run guild, count them, clamp the page, and query eight stable rows by `createdAt DESC, id DESC`.

- [ ] **Step 5: Parse one-based query parameters in the route**

Pass raw query values through `normalizeGuildRaidPage`; never trust client page size.

- [ ] **Step 6: Run focused read tests**

Run: `npx vitest run src/lib/server/guildRaidRead.test.ts src/app/api/v2/guild/raid/route.test.ts src/app/api/v2/guild/raid/attacks/\[attackId\]/route.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/guildRaidRead.ts src/lib/server/guildRaidRead.test.ts src/app/api/v2/guild/raid/route.ts src/app/api/v2/guild/raid/route.test.ts src/adventure/v2/guild/guildRaidTypes.ts
git commit -m "feat: paginate guild raid results"
```

### Task 7: Add claim and independent pagination UI states

**Files:**
- Modify: `src/adventure/v2/guild/useGuildRaid.ts`
- Modify: `src/adventure/v2/guild/GuildRaidPanel.tsx`
- Modify: `src/adventure/v2/guild/GuildRaidPanel.test.tsx`
- Modify: `src/adventure/v2/V2GuildHome.tsx`

**Interfaces:**
- Hook produces `claiming`, `claimReward`, `setLeaderboardPage`, and `setRecentPage`.
- Panel consumes paginated `items` and renders independent previous/next controls.

- [ ] **Step 1: Add failing panel tests**

Assert active state shows the guild's stage/HP and Saturday deadline; settled eligible state shows exact reward and claim button; claimed state shows completion; ineligible state shows the threshold; each list renders at most eight entries with independent `현재/전체 페이지` labels and disabled boundary controls.

- [ ] **Step 2: Run panel tests and confirm RED**

Run: `npx vitest run src/adventure/v2/guild/GuildRaidPanel.test.tsx`

Expected: FAIL against flat lists and the old no-reward copy.

- [ ] **Step 3: Update the hook**

Include both pages in GET query parameters, retain them across 20-second quiet refresh and post-attack reload, update only the selected paginator, and POST `/api/v2/guild/raid/claim` with duplicate-click protection mirroring attacks.

- [ ] **Step 4: Update the panel**

Replace `보상 정책 준비 중` with active-period guidance or the settled reward card. Add shared small paginator controls below ranking and recent lists. Render `state.leaderboard.items` and `state.recentAttacks.items`. Keep all cards opaque through existing `Card` and `SURFACE_INSET` usage.

- [ ] **Step 5: Preserve no-guild participant access**

When server state contains a settled participant but no current guild, render the raid result/reward view and hide attack-only guild management areas.

- [ ] **Step 6: Run UI tests**

Run: `npx vitest run src/adventure/v2/guild/GuildRaidPanel.test.tsx src/adventure/v2/MainTabNav.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/adventure/v2/guild src/adventure/v2/V2GuildHome.tsx
git commit -m "feat: finish guild raid reward UI"
```

### Task 8: Documentation and full verification

**Files:**
- Modify: `src/app/manual/content/guild.tsx`
- Create: `docs/patch-notes/2026-09-01-guild-raid-independent-progression.txt`

**Interfaces:**
- Manual describes independent runs, Monday-Friday combat, weekend direct claim, expiry, eligibility, reward tiers, and eight-row pages.

- [ ] **Step 1: Update player-facing documentation**

Remove the old “no rewards” pilot copy. State exact KST boundaries, rewards, eligibility, and expiration without promising deployment.

- [ ] **Step 2: Run focused guild raid suite**

Run: `npx vitest run src/adventure/data/v2/guildRaid.test.ts src/adventure/v2/combat/guildRaidDamageMeter.test.ts src/lib/server/guildRaidBattle.test.ts src/lib/server/guildRaidLifecycle.test.ts src/lib/server/guildRaidAttack.test.ts src/lib/server/guildRaidReward.test.ts src/lib/server/guildRaidRead.test.ts src/app/api/v2/guild/raid/route.test.ts src/app/api/v2/guild/raid/attack/route.test.ts src/app/api/v2/guild/raid/claim/route.test.ts src/adventure/v2/guild/GuildRaidPanel.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run migration, type, lint, and build checks**

Run: `npm run check-migrations`

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/guildRaid.ts src/adventure/v2/combat src/lib/server/guildRaidBattle.ts src/lib/server/guildRaidLifecycle.ts src/lib/server/guildRaidAttack.ts src/lib/server/guildRaidReward.ts src/lib/server/guildRaidRead.ts src/app/api/v2/guild/raid src/adventure/v2/guild src/adventure/v2/V2GuildHome.tsx src/app/manual/content/guild.tsx`

Run: `npm run build`

Expected: all PASS.

- [ ] **Step 4: Run the full suite sequentially if parallel module isolation is flaky**

Run: `npm test -- --maxWorkers=1`

Expected: all non-skipped tests PASS.

- [ ] **Step 5: Inspect final diff and commit**

Run: `git diff --check`

```bash
git add src/app/manual/content/guild.tsx docs/patch-notes/2026-09-01-guild-raid-independent-progression.txt
git commit -m "docs: explain independent guild raids"
```
