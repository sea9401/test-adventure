# Ranch Ready Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send one deduplicated browser push when ranch products become collectible and open the ranch tab from that push.

**Architecture:** Add a pure ranch-push planner that settles `farm.v2` at the cron timestamp and emits stable per-animal event keys from lifetime and pending cycle counts. Reuse the existing timed-push scan, delivery ledger, retry behavior, and `/town/farm` screen; the UI recognizes a `#ranch` hash on mount.

**Tech Stack:** TypeScript, Next.js App Router, React, Drizzle ORM, Vitest, Testing Library

## Global Constraints

- Keep the existing `farm_ready` in-game notification and current farm, woodcutting, and mining pushes unchanged.
- Do not add a database migration or a new save key.
- Group all newly due ranch animal types for one user into one push execution.
- Record delivery keys only when at least one subscription receives the push; retry otherwise.
- Push title is `목장 생산 완료`, destination is `/town/farm#ranch`, and tag is `ranch-ready`.
- Do not deploy.

---

### Task 1: Pure Ranch Push Plan

**Files:**
- Create: `src/adventure/v2/ranchReadyPush.ts`
- Create: `src/adventure/v2/ranchReadyPush.test.ts`

**Interfaces:**
- Consumes: `parseFarmState(raw: unknown, now?: number): FarmState`, `settleRanch(state: RanchState, now?: number): RanchState`, and ranch animal definitions.
- Produces: `ranchReadyPushCandidates(userId: string, farmRaw: unknown, now?: number): RanchReadyPushCandidate[]` and `pendingRanchReadyPush(candidates: readonly RanchReadyPushCandidate[], deliveredKeys: ReadonlySet<string>): RanchReadyPushPlan | null`.

- [ ] **Step 1: Read the current test guidance**

Read `superpowers:test-driven-development/writing-good-tests.md` completely before editing a test.

- [ ] **Step 2: Write failing completion-boundary and stable-key tests**

Create real ranch states with existing domain functions. Assert that a fed chicken has no candidate one millisecond before two hours and has this candidate at the boundary:

```ts
expect(ranchReadyPushCandidates("user-1", farm, readyAt)).toEqual([
  {
    animalId: "chicken",
    outputName: "달걀",
    eventKey: "ranch:user-1:chicken:1:1",
  },
]);
```

Settle and persist the same state later without completing another cycle, then assert the candidate key stays `ranch:user-1:chicken:1:1`. Complete another cycle and assert it becomes `ranch:user-1:chicken:2:2`.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npx vitest run src/adventure/v2/ranchReadyPush.test.ts`

Expected: FAIL because `./ranchReadyPush` does not exist.

- [ ] **Step 4: Implement the minimal candidate calculation**

Implement focused exported types and functions:

```ts
export type RanchReadyPushCandidate = {
  animalId: RanchAnimalId;
  outputName: string;
  eventKey: string;
};

export type RanchReadyPushPlan = {
  eventKeys: string[];
  body: string;
};
```

Parse the farm at `now`, settle its ranch, sum `readyCycles` across unlocked slots by animal, and pair each positive sum with `chickenCycles`, `cowCycles`, or `pigCycles`. Build keys as `ranch:${userId}:${animalId}:${lifetimeCycles}:${readyCycles}` in `chicken`, `cow`, `pig` definition order.

- [ ] **Step 5: Write failing grouping and delivered-filter tests**

Construct a farm with completed chicken, cow, and pig production. Assert `pendingRanchReadyPush`:

```ts
expect(plan).toEqual({
  eventKeys: [chickenKey, pigKey],
  body: "달걀, 돼지고기를 수확할 수 있습니다.",
});
```

when the cow key is already delivered. Assert it returns `null` when every candidate key is delivered.

- [ ] **Step 6: Run the focused test and verify RED for grouping**

Run: `npx vitest run src/adventure/v2/ranchReadyPush.test.ts`

Expected: FAIL because grouping and delivery filtering are not implemented.

- [ ] **Step 7: Implement minimal grouping**

Filter candidates by `deliveredKeys`, preserve animal order, and return the pending keys plus `${names.join(", ")}를 수확할 수 있습니다.`. Return `null` for no pending candidate.

- [ ] **Step 8: Run the focused test and verify GREEN**

Run: `npx vitest run src/adventure/v2/ranchReadyPush.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 9: Commit the pure planner**

```bash
git add src/adventure/v2/ranchReadyPush.ts src/adventure/v2/ranchReadyPush.test.ts
git commit -m "feat: plan ranch ready push events"
```

### Task 2: Timed Push Integration

**Files:**
- Modify: `src/lib/server/timedPushNotifications.ts`
- Modify: `src/app/api/cron/push-notifications/route.ts`
- Create: `src/lib/server/timedPushNotifications.test.ts`

**Interfaces:**
- Consumes: `ranchReadyPushCandidates` and `pendingRanchReadyPush` from Task 1.
- Produces: the existing `sendDueTimedPushNotifications(now?: number)` with an added ranch push side effect and unchanged return shape.

- [ ] **Step 1: Write a failing integration test with controlled dependencies**

Mock the Drizzle query chains, `sendWebPushToUser`, and rows for one subscribed user whose `farm.v2` contains a completed pig. Assert:

```ts
expect(sendWebPushToUser).toHaveBeenCalledWith("user-1", {
  title: "목장 생산 완료",
  body: "돼지고기를 수확할 수 있습니다.",
  url: "/town/farm#ranch",
  tag: "ranch-ready",
});
expect(recordedValues).toContainEqual({
  userId: "user-1",
  eventKey: expect.stringMatching(/^ranch:user-1:pig:/),
});
```

Add a failed-delivery case with `{ delivered: 0, failed: 1 }` and assert no ranch key is inserted.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `npx vitest run src/lib/server/timedPushNotifications.test.ts`

Expected: FAIL because the timed scanner does not create or send a ranch plan.

- [ ] **Step 3: Integrate ranch candidates into the existing scan**

During candidate collection, append every ranch candidate key. During per-user delivery, call `pendingRanchReadyPush` with the delivered-key set. Send one push for a non-null plan, update delivered/failed counters, and pass all plan event keys to the existing `recordDeliveries` only after `result.delivered > 0`.

Update the route comment from “농장·자동 벌목·자동 채광” to “농장·목장·자동 벌목·자동 채광”.

- [ ] **Step 4: Run focused push tests and verify GREEN**

Run: `npx vitest run src/adventure/v2/ranchReadyPush.test.ts src/lib/server/timedPushNotifications.test.ts src/lib/server/webPush.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 5: Commit the timed push integration**

```bash
git add src/lib/server/timedPushNotifications.ts src/lib/server/timedPushNotifications.test.ts src/app/api/cron/push-notifications/route.ts
git commit -m "feat: send ranch production push alerts"
```

### Task 3: Ranch Deep Link

**Files:**
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.test.tsx`

**Interfaces:**
- Consumes: the browser location hash supplied by `/town/farm#ranch`.
- Produces: `farmSectionFromHash(hash: string): FarmSectionKey | null` and a mount effect that selects the returned section.

- [ ] **Step 1: Read the installed Next.js client-component guide**

Locate and read the relevant client component and navigation guidance in `node_modules/next/dist/docs/` before editing the component. Do not rely on remembered Next.js APIs.

- [ ] **Step 2: Write failing hash parsing tests**

Add pure assertions:

```ts
expect(farmSectionFromHash("#ranch")).toBe("ranch");
expect(farmSectionFromHash("")).toBeNull();
expect(farmSectionFromHash("#unknown")).toBeNull();
```

- [ ] **Step 3: Run the focused UI test and verify RED**

Run: `npx vitest run src/adventure/v2/AdventurerFarmPanel.test.tsx`

Expected: FAIL because `farmSectionFromHash` is not exported.

- [ ] **Step 4: Implement hash recognition and mount selection**

Keep the allowed hash scope narrow:

```ts
export function farmSectionFromHash(hash: string): FarmSectionKey | null {
  return hash === "#ranch" ? "ranch" : null;
}
```

On client mount, read `window.location.hash`; when it resolves to `ranch`, update both `lastFarmSection` and `activeSection`. Do nothing for ordinary or unknown hashes so the existing remembered/default tab behavior remains intact.

- [ ] **Step 5: Run the focused UI test and verify GREEN**

Run: `npx vitest run src/adventure/v2/AdventurerFarmPanel.test.tsx`

Expected: PASS with no warnings.

- [ ] **Step 6: Commit the deep link**

```bash
git add src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx
git commit -m "feat: open ranch tab from push link"
```

### Task 4: Full Verification

**Files:**
- Verify only; modify production or test files only to correct observed failures.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: fresh evidence that the complete repository accepts the change.

- [ ] **Step 1: Run the related regression suite**

Run: `npx vitest run src/adventure/v2/ranch.test.ts src/adventure/v2/ranchReadyPush.test.ts src/adventure/v2/AdventurerFarmPanel.test.tsx src/lib/server/timedPushNotifications.test.ts src/lib/server/webPush.test.ts`

Expected: all tests pass.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit 0 with no errors.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: image checks and Next.js production build exit 0.

- [ ] **Step 5: Inspect the final change**

Run: `git status --short`, `git diff HEAD~3 --check`, and `git log -4 --oneline`.

Expected: no uncommitted files, no whitespace errors, and five feature-related commits including the design and implementation plan documents.
