# Guild Raid Practice Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only guild raid practice battle that uses the live character and boss rules without consuming attempts or changing competition data.

**Architecture:** Add a dedicated practice service and Route Handler instead of branching the transactional attack endpoint. Extend the shared battle-preparation path with an explicit read-only mode, then return an ephemeral replay to the existing client-side battle-log handoff.

**Tech Stack:** Next.js 16.2.11 App Router Route Handlers, React 19.2.4 client components, TypeScript, Drizzle ORM/PostgreSQL, Vitest, Testing Library, existing `ReplayBattleScene` and opaque UI surfaces.

## Global Constraints

- Practice requires a current guild and an active current-week raid event.
- Practice remains available after all daily real attacks are consumed.
- Practice must not insert, update, or delete guild raid rows, consume attack counts, alter HP/stage/rank/reward state, or add recent attack logs.
- The live server character, equipment, sanitized skill loadout, and current raid boss rules must be used.
- Real attack behavior and idempotency must remain unchanged.
- Use existing `Card`, `Button`, and shared opaque surfaces; do not introduce translucent content surfaces.
- Do not deploy or change maintenance mode.

---

### Task 1: Read-only guild raid battle preparation

**Files:**
- Create: `src/lib/server/v2BattlePrep.test.ts`
- Modify: `src/lib/server/v2BattlePrep.ts`
- Modify: `src/lib/server/guildRaidBattle.ts`
- Modify: `src/lib/server/guildRaidBattle.test.ts`

**Interfaces:**
- Produces: `prepareV2BattleActor({ ..., lockForUpdate?: boolean })`, defaulting to `true`.
- Produces: `simulateGuildRaidBattle({ ..., lockForUpdate?: boolean })`, defaulting to `true` and forwarding the option.
- Consumes: existing `readSave`, `lockSaveForUpdate`, `derivePlayerCombatV2`, and `prepareV2BattleActor` behavior.

- [ ] **Step 1: Write failing read-only preparation tests**

Add a focused `v2BattlePrep.test.ts` case that calls `prepareV2BattleActor` with
`lockForUpdate: false`, mocks `V2_CORE_LOOP_V2` off, and verifies
`equipment.v2`, `skills.v2`, and `proficiency.v2` are loaded through `readSave`
while `lockSaveForUpdate` is never called. Extend `guildRaidBattle.test.ts` to
call `simulateGuildRaidBattle` with `lockForUpdate: false` and expect
`prepareV2BattleActor` to receive the flag.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npx vitest run src/lib/server/v2BattlePrep.test.ts src/lib/server/guildRaidBattle.test.ts`

Expected: FAIL because neither function accepts or honors `lockForUpdate`.

- [ ] **Step 3: Implement the read strategy**

Import `readSave` beside `lockSaveForUpdate`. Inside `prepareV2BattleActor`,
default `lockForUpdate = true` and load each unprovided save with this helper:

```ts
const loadSave = <T>(key: string, fallback: T) =>
  lockForUpdate
    ? lockSaveForUpdate<T>(tx, userId, key, fallback)
    : readSave<T>(tx, userId, key, fallback);
```

Use `loadSave` for equipment, skills, and proficiency. In
`simulateGuildRaidBattle`, use `readSave` for `character.v2` only when
`lockForUpdate` is false and forward the same flag to `prepareV2BattleActor`.
Leave every existing caller on the locking default.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `npx vitest run src/lib/server/v2BattlePrep.test.ts src/lib/server/guildRaidBattle.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/v2BattlePrep.ts src/lib/server/v2BattlePrep.test.ts src/lib/server/guildRaidBattle.ts src/lib/server/guildRaidBattle.test.ts
git commit -m "refactor: support read-only raid battle prep"
```

### Task 2: Practice service and API

**Files:**
- Create: `src/lib/server/guildRaidPractice.ts`
- Create: `src/lib/server/guildRaidPractice.test.ts`
- Create: `src/app/api/v2/guild/raid/practice/route.ts`
- Create: `src/app/api/v2/guild/raid/practice/route.test.ts`
- Modify: `src/lib/server/highCostRateLimit.ts`
- Modify: `src/adventure/v2/guild/guildRaidTypes.ts`

**Interfaces:**
- Produces: `GuildRaidPracticeResult` with `ok`, `practice`, `bossKind`, `playerName`, `damageDealt`, `damageTaken`, `diedEarly`, `turns`, and `replay`.
- Produces: `createGuildRaidPracticeService(dependencies)` for isolated rule tests.
- Produces: `practiceGuildRaid({ userId, now? })` using read-only Drizzle selects and `simulateGuildRaidBattle(..., lockForUpdate: false)`.
- Produces: high-cost limiter key `guildRaidPractice` and `POST /api/v2/guild/raid/practice`.

- [ ] **Step 1: Write failing service tests**

Use injected `readContext` and `simulate` dependencies to assert:

```ts
await expect(practice({ userId: "u1", now: ACTIVE_NOW })).resolves.toMatchObject({
  ok: true,
  practice: true,
  damageDealt: 1234,
});
expect(simulate).toHaveBeenCalledWith({
  userId: "u1",
  bossKind: "mountain_chief_hard",
});
```

Add separate cases for `no_guild`, missing/settled/expired event as
`event_ended`, invalid boss as `bad_boss`, and missing character as
`no_character`. Verify `simulate` is not called for rejected contexts.

- [ ] **Step 2: Run the service test and confirm RED**

Run: `npx vitest run src/lib/server/guildRaidPractice.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the read-only service**

Define a small dependency boundary:

```ts
type PracticeContext = {
  hasGuild: boolean;
  event: { bossKind: string; status: string; endsAt: Date } | null;
};

type PracticeDependencies = {
  readContext(userId: string, weekKey: string): Promise<PracticeContext>;
  simulate(input: {
    userId: string;
    bossKind: CoopBossKindId;
  }): Promise<GuildRaidBattleResult | null>;
};
```

The production `readContext` performs only SELECTs against current guild
membership and `guildRaidEvents`. The production `simulate` calls
`simulateGuildRaidBattle({ tx: db, userId, bossKind, lockForUpdate: false })`.
Do not call `ensureCurrentGuildRaid`, because it may create or settle rows.

- [ ] **Step 4: Write failing Route Handler tests**

Mock `ensureUser`, `enforceHighCostRateLimit`, and `practiceGuildRaid`. Verify
401 without a user, early return for a limiter response, status mapping
`no_guild=403`, `no_character=400`, `bad_boss=500`, `event_ended=410`, and a
successful ephemeral result with HTTP 200.

- [ ] **Step 5: Run the route test and confirm RED**

Run: `npx vitest run src/app/api/v2/guild/raid/practice/route.test.ts`

Expected: FAIL because the practice route and limiter profile do not exist.

- [ ] **Step 6: Implement the Route Handler and limiter profile**

Add this high-cost profile:

```ts
guildRaidPractice: {
  action: "v2:guild-raid:practice",
  userLimit: 20,
  ipLimit: 80,
},
```

The POST handler authenticates, applies that limiter, calls
`practiceGuildRaid({ userId })`, maps expected errors, and returns the result.
It accepts no client-selected boss or progress values.

- [ ] **Step 7: Run service and route tests and confirm GREEN**

Run: `npx vitest run src/lib/server/guildRaidPractice.test.ts src/app/api/v2/guild/raid/practice/route.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/guildRaidPractice.ts src/lib/server/guildRaidPractice.test.ts src/app/api/v2/guild/raid/practice src/lib/server/highCostRateLimit.ts src/adventure/v2/guild/guildRaidTypes.ts
git commit -m "feat: add read-only guild raid practice API"
```

### Task 3: Practice interaction and replay UI

**Files:**
- Create: `src/adventure/v2/guild/useGuildRaid.test.tsx`
- Modify: `src/adventure/v2/guild/useGuildRaid.ts`
- Modify: `src/adventure/v2/guild/GuildRaidPanel.tsx`
- Modify: `src/adventure/v2/guild/GuildRaidPanel.test.tsx`

**Interfaces:**
- Consumes: `GuildRaidPracticeResult` and `POST /api/v2/guild/raid/practice`.
- Produces: hook fields `practicing`, `lastPractice`, and `practice`.
- Produces: panel props `practicing?`, `lastPractice?`, `onPractice?`, `viewerGender?`, and `playerSubtitle?`.

- [ ] **Step 1: Write failing hook tests**

Render `useGuildRaid`, mock the initial state GET, then call `practice`. Verify a
POST goes to `/api/v2/guild/raid/practice`, the result becomes `lastPractice`,
and no extra state GET follows the practice success. Add a simultaneous-action
case showing a second real/practice trigger is ignored while one combat request
is pending.

- [ ] **Step 2: Run the hook test and confirm RED**

Run: `npx vitest run src/adventure/v2/guild/useGuildRaid.test.tsx`

Expected: FAIL because the hook has no practice action.

- [ ] **Step 3: Implement hook state and mutual exclusion**

Add `postGuildRaidPractice`, `practicing`, and `lastPractice`. Replace the
real-attack-only in-flight ref with one shared combat ref so real and practice
requests cannot overlap. Clear the opposite result when a new combat starts.
On practice success, do not call `load`, because the endpoint has no persistent
state to refresh.

- [ ] **Step 4: Write failing panel tests**

Mock `ReplayBattleScene` with an accessible placeholder. Verify:

- `연습 전투` and `공격 횟수와 피해·보상에 반영되지 않습니다.` are shown.
- the practice button remains enabled when `remainingAttacks` is zero.
- the practice button is disabled when the event is not active.
- a practice result shows `연습 결과`, formatted damage, non-persistence copy,
  and the replay placeholder.
- clicking the practice button calls `onPractice` and not `onAttack`.

- [ ] **Step 5: Run the panel tests and confirm RED**

Run: `npx vitest run src/adventure/v2/guild/GuildRaidPanel.test.tsx`

Expected: FAIL because the practice controls and result card are absent.

- [ ] **Step 6: Implement the panel**

Place the secondary practice button directly below the danger real-attack
button. Disable both controls while either request is busy; keep practice
independent of `remainingAttacks` and `guildLocked`, but require `active`.
Render an opaque result card and:

```tsx
<ReplayBattleScene
  payload={lastPractice.replay}
  startPlayerHp={lastPractice.replay.playerMaxHp}
  playerName={lastPractice.playerName}
  gender={viewerGender}
  exp={0}
  maxExp={1}
  playerSubtitle={playerSubtitle}
  outcome={lastPractice.diedEarly ? "lose" : undefined}
  logTitle={`${boss.name} 연습 전투 로그`}
/>
```

Read identity values in `GuildRaidPanel` through the existing
`useGameIdentityState` provider and pass them to the presentational component.

- [ ] **Step 7: Run hook and panel tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/guild/useGuildRaid.test.tsx src/adventure/v2/guild/GuildRaidPanel.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/adventure/v2/guild/useGuildRaid.ts src/adventure/v2/guild/useGuildRaid.test.tsx src/adventure/v2/guild/GuildRaidPanel.tsx src/adventure/v2/guild/GuildRaidPanel.test.tsx
git commit -m "feat: add guild raid practice controls"
```

### Task 4: Manual and integrated verification

**Files:**
- Modify: `src/app/manual/content/guild.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Documents: practice availability, real-state isolation, and ephemeral results.

- [ ] **Step 1: Write the failing manual assertion**

In the guild manual test, require `연습 전투`, `공격 횟수`, `기여도`, `보상`,
and `기록되지 않습니다` in the rendered guild content.

- [ ] **Step 2: Run the manual test and confirm RED**

Run: `npx vitest run src/app/manual/current-content.test.tsx`

Expected: FAIL because the guild manual does not mention practice.

- [ ] **Step 3: Document practice behavior**

Add a guild raid bullet explaining that `연습 전투` remains available after
daily attempts are exhausted and does not change real attack count,
contribution, rewards, or recent records.

- [ ] **Step 4: Run focused and broader verification**

Run:

```bash
npx vitest run src/lib/server/v2BattlePrep.test.ts src/lib/server/guildRaidBattle.test.ts src/lib/server/guildRaidPractice.test.ts src/app/api/v2/guild/raid/practice/route.test.ts src/adventure/v2/guild/useGuildRaid.test.tsx src/adventure/v2/guild/GuildRaidPanel.test.tsx src/lib/server/guildRaidAttack.test.ts src/app/api/v2/guild/raid/attack/route.test.ts src/app/manual/current-content.test.tsx
npx eslint src/lib/server/v2BattlePrep.ts src/lib/server/v2BattlePrep.test.ts src/lib/server/guildRaidBattle.ts src/lib/server/guildRaidBattle.test.ts src/lib/server/guildRaidPractice.ts src/lib/server/guildRaidPractice.test.ts src/app/api/v2/guild/raid/practice/route.ts src/app/api/v2/guild/raid/practice/route.test.ts src/adventure/v2/guild/guildRaidTypes.ts src/adventure/v2/guild/useGuildRaid.ts src/adventure/v2/guild/useGuildRaid.test.tsx src/adventure/v2/guild/GuildRaidPanel.tsx src/adventure/v2/guild/GuildRaidPanel.test.tsx src/lib/server/highCostRateLimit.ts src/app/manual/content/guild.tsx src/app/manual/current-content.test.tsx
git diff --check
```

Expected: all focused tests and lint pass; diff check exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/manual/content/guild.tsx src/app/manual/current-content.test.tsx
git commit -m "docs: explain guild raid practice mode"
```

- [ ] **Step 6: Confirm scope**

Inspect `git status --short` and the implementation commit range. Confirm no
deployment, maintenance-mode, migration, reward, or unrelated user-owned file
was changed by this implementation.
