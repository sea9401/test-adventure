# Giant Fish Unclaimed Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep past defeated giant-fish rewards claimable after a newer giant fish appears without hiding or blocking the current event.

**Architecture:** Extend the boss store with a user-scoped query for the oldest defeated, unclaimed event and expose it as a separate `pendingReward` in the existing boss status response. Render that response in an opaque accent card that calls the existing transactional claim endpoint, then refresh to reveal the next pending reward.

**Tech Stack:** Next.js 16 App Router route handlers, React 19 client components, Drizzle ORM, PostgreSQL, TypeScript, Vitest, React Testing Library.

## Global Constraints

- Do not add a reward claim deadline or automatically settle rewards.
- Keep the latest/current giant-fish event visible and playable.
- Preserve the existing claim transaction and idempotency marker.
- Use `SURFACE_ACCENT` or another shared opaque surface token for the new card.
- Preserve unrelated worktree changes and do not deploy.

---

### Task 1: Return a past unclaimed reward beside the latest event

**Files:**
- Modify: `src/lib/server/dangerousFishingBoss.ts`
- Modify: `src/lib/server/dangerousFishingBoss.test.ts`
- Modify: `src/lib/server/dangerousFishingBossRoute.test.ts`

**Interfaces:**
- Produces: `DangerousFishingBossStore.findOldestUnclaimedReward(userId: string): Promise<DangerousFishingBossEventRecord | null>`
- Produces: `readDangerousFishingBossView(...).pendingReward`, containing the past event, contribution, and calculated reward preview, or `null`.

- [ ] **Step 1: Write the failing service regression tests**

Add a test with an older defeated event, a successful unclaimed contribution, and a newer active event. Assert that `event.id` is the active event and `pendingReward.event.id` is the defeated event. Add a second assertion that the latest event is not duplicated into `pendingReward` when both IDs are equal.

```ts
expect(view).toMatchObject({
  event: { id: "new-active" },
  pendingReward: {
    event: { id: "old-defeated", name: "해일의 거신" },
    contribution: { totalContribution: 240, successfulAttempts: 1 },
    rewardPreview: { fishingCoins: 80, materialCount: 1 },
  },
});
```

- [ ] **Step 2: Run the service test and verify RED**

Run: `npm test -- src/lib/server/dangerousFishingBoss.test.ts`

Expected: FAIL because `pendingReward` and `findOldestUnclaimedReward` do not exist.

- [ ] **Step 3: Implement the store query and response mapping**

Use a Drizzle join from `dangerous_fishing_boss_contributions` to `dangerous_fishing_boss_events`, filtered by the user, `reward_claimed_at IS NULL`, positive successful attempts, event status `defeated`, and stamina `0`. Order by event spawn time ascending and return one event. Map that event and its contribution to `pendingReward` unless it is already the main `event`.

- [ ] **Step 4: Update the route transaction double**

Add the same oldest-unclaimed selection behavior to the route test store so the route continues exercising the complete production store interface.

- [ ] **Step 5: Run service and route tests and verify GREEN**

Run: `npm test -- src/lib/server/dangerousFishingBoss.test.ts src/lib/server/dangerousFishingBossRoute.test.ts`

Expected: PASS with no failures or warnings.

### Task 2: Render and claim past rewards without hiding the active boss

**Files:**
- Modify: `src/adventure/v2/DangerousFishingBossPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingBossPanel.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.test.tsx`
- Modify: `src/adventure/v2/useDangerousFishing.ts`

**Interfaces:**
- Consumes: `DangerousFishingBossViewModel.pendingReward` from Task 1.
- Produces: `onClaim(eventId: string, bossName: string): Promise<boolean>` so feedback names the claimed past boss rather than the current boss.

- [ ] **Step 1: Write the failing component regression test**

Render an active current event with a past `pendingReward`. Assert that both `개인 시도 준비` and `지난 거대어 보상 수령` are visible, then click the reward button and assert the old event ID and old boss name are passed to `onClaim`.

```ts
fireEvent.click(screen.getByRole("button", { name: "지난 거대어 보상 수령" }));
expect(onClaim).toHaveBeenCalledWith("old-defeated", "해일의 거신");
expect(screen.getByRole("button", { name: "개인 시도 준비" })).toBeDefined();
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/adventure/v2/DangerousFishingBossPanel.test.tsx`

Expected: FAIL because the view model and pending reward card do not exist.

- [ ] **Step 3: Implement the pending reward card**

Extend the view-model type, render an opaque `SURFACE_ACCENT` card before the current event controls, and display the prior boss name, contribution, reward preview, and dedicated claim button. Keep the card out of an active individual-attempt screen.

- [ ] **Step 4: Preserve the claimed boss name in feedback**

Thread the boss name through `DangerousFishingView` and let `useDangerousFishing.claimBossReward` prefer the supplied name while retaining the current-event name as a fallback.

- [ ] **Step 5: Run the component and hook-adjacent tests and verify GREEN**

Run: `npm test -- src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingRealtimeFinish.test.tsx`

Expected: PASS with no failures or warnings.

### Task 3: Verify and commit the complete fix

**Files:**
- Modify: all files from Tasks 1 and 2
- Include: `docs/superpowers/plans/2026-08-26-dangerous-fishing-unclaimed-rewards.md`

**Interfaces:**
- Consumes: all behavior from Tasks 1 and 2.
- Produces: one verified local commit; no deployment, push, or PR.

- [ ] **Step 1: Run focused regression tests**

Run: `npm test -- src/lib/server/dangerousFishingBoss.test.ts src/lib/server/dangerousFishingBossRoute.test.ts src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingRealtimeFinish.test.tsx`

- [ ] **Step 2: Run static and build verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/lib/server/dangerousFishingBoss.ts src/lib/server/dangerousFishingBoss.test.ts src/lib/server/dangerousFishingBossRoute.test.ts src/adventure/v2/DangerousFishingBossPanel.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/DangerousFishingRealtimeFinish.test.tsx src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/useDangerousFishing.ts`

Run: `npm run build`

- [ ] **Step 3: Review the diff and protect unrelated changes**

Run: `git diff --check`

Run: `git status --short`

Confirm that `V2CombatPatternView.tsx` and `V2CombatPatternView.test.tsx` remain unstaged and untouched by this task.

- [ ] **Step 4: Commit only the planned files**

```bash
git add docs/superpowers/plans/2026-08-26-dangerous-fishing-unclaimed-rewards.md \
  src/lib/server/dangerousFishingBoss.ts \
  src/lib/server/dangerousFishingBoss.test.ts \
  src/lib/server/dangerousFishingBossRoute.test.ts \
  src/adventure/v2/DangerousFishingBossPanel.tsx \
  src/adventure/v2/DangerousFishingBossPanel.test.tsx \
  src/adventure/v2/DangerousFishingRealtimeFinish.test.tsx \
  src/adventure/v2/DangerousFishingView.tsx \
  src/adventure/v2/DangerousFishingView.test.tsx \
  src/adventure/v2/useDangerousFishing.ts
git commit -m "fix: keep giant fish rewards claimable"
```
