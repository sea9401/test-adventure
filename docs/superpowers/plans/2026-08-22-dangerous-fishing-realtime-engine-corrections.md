# Dangerous Fishing Realtime Engine Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two load-bearing engine re-review findings before the realtime client consumes the server contract.

**Architecture:** Keep the deterministic 50ms simulation and versioned persistence shape intact. Correct the performance budget at the modifier-to-simulation boundary, broaden production timing coverage to every reachable fish/risk pair, and extend the existing user-first expiry recovery path to legacy boss attempts without awarding rewards or mutating contribution.

**Tech Stack:** TypeScript 5, Vitest 4, Next.js 16.2 Route Handlers, Drizzle transactions through the existing `savesKv` helpers.

## Global Constraints

- The simulation tick remains exactly 50ms and uses integer gameplay values.
- The observed same-target/same-seed duration reduction from all reachable level, heritage, equipment, enhancement, and bait combinations must never exceed 35%; nominal `timeReductionPct` must also remain at most 35.
- Target durations remain 8–15s common, 12–20s rare/epic, 18–25s legendary, and 25–40s boss at every reachable risk.
- Existing v1/v2 encounters, cargo, bait, codex, equipment, boss contribution, and reward claims remain readable.
- Expiry cleanup is no-reward, preserves already consumed bait and prior contribution, and runs under the existing user-row-first transaction order.
- The current client remains on v1; do not add realtime controls or activate `start_realtime` from the client in this plan.
- Do not deploy or change maintenance mode.

---

### Task 1: Enforce the observed 35% duration budget and reachable-risk timing matrix

**Files:**
- Modify: `src/adventure/v2/dangerousFishingRealtime.ts`
- Modify: `src/adventure/v2/dangerousFishingRealtime.test.ts`
- Modify if the authoritative projection needs budget metadata: `src/adventure/v2/dangerousFishingRealtimeModifiers.ts`
- Test: `src/adventure/v2/dangerousFishingRealtime.test.ts`

**Interfaces:**
- Consumes: `dangerousFishingRealtimeProjection`, `dangerousRealtimeModifiers`, production fish/boss catalogs, and `replayDangerousRealtimeInputs`.
- Preserves: `DangerousRealtimeConfig`, persisted modifier-source parsing, exact risk rules, and deterministic replay.
- Produces: a calibrated performance projection for which observed responsive-play duration retains at least 650 permille of the level-50/basic/starter baseline for the same target, risk, and seed.

- [ ] **Step 1: Add the exact failing counterexample and bounded reachable-combination regression**

Add a literal counterexample using `voidfin_coelacanth`, risk 4, seed 169. Its level-50/basic/starter baseline is 312 ticks; the reachable level-100 inherited-assistance loadout using leviathan rod +2, starter reel +0, abyss-chain line +0, and abyss bait currently finishes in 197 ticks. Assert that every reachable projection retains at least `Math.ceil(baselineTicks * 650 / 1000)` and separately assert `timeReductionPct <= 35`.

Enumerate materially distinct reachable values for fishing level/legacy assistance, rod/reel/line IDs, enhancement levels +0 through +3, and every purchasable bait. Keep the matrix bounded by deduplicating identical authoritative projections before replay. The test must name the target/loadout/seed in any failure message.

```ts
expect(counterexampleBaselineTicks).toBe(312);
expect(counterexampleTicks).toBeGreaterThanOrEqual(
  Math.ceil((counterexampleBaselineTicks * 650) / 1000),
);
expect(projected.modifiers.timeReductionPct).toBeLessThanOrEqual(35);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run src/adventure/v2/dangerousFishingRealtime.test.ts`

Expected: FAIL on the reachable partial-loadout case because 197 ticks is below the 203-tick minimum.

- [ ] **Step 3: Correct the performance budget at its source**

Include every time-shortening contributor, including maximum-tension headroom, in one conservative integer performance scale. Apply the same scale to the effective reel, stamina, tension, distance, and maximum-tension contributions rather than capping nominal percentages independently. Preserve monotonic progression: adding a valid level, intrinsic gear, enhancement, or bait benefit may improve or leave unchanged its intended metric, but must not make that metric worse.

Select the largest integer calibration that passes the bounded reachable matrix; encode it as a named constant with a comment stating that it protects the observed 650-permille duration floor. Do not special-case the counterexample target, seed, or equipment IDs.

- [ ] **Step 4: Expand production timing tests to every reachable fish/risk pair**

For each production fish, calculate its initial `clamp(zone.baseRisk + depth.riskBonus, 0, 5)` and test every risk from that initial value through 5. Test bosses only at their actual attempt risk. Replay every existing representative/extreme seed, retain the explicit `abyssal_crownfish <= 500` assertion, and assert the literal rarity bands in ticks: common 160–300, rare/epic 240–400, legendary 360–500, boss 500–800.

```ts
for (let risk = initialRisk; risk <= 5; risk += 1) {
  cases.push({ target, risk });
}
```

- [ ] **Step 5: Run focused verification and commit**

Run: `npx vitest run src/adventure/v2/dangerousFishingRealtime.test.ts src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts src/adventure/v2/dangerousFishingHeritage.test.ts src/adventure/v2/dangerousFishingState.test.ts`

Run: `npx eslint src/adventure/v2/dangerousFishingRealtime.ts src/adventure/v2/dangerousFishingRealtime.test.ts src/adventure/v2/dangerousFishingRealtimeModifiers.ts`

Run: `npx tsc --noEmit`

Expected: all commands exit 0, the counterexample retains at least 650 permille, and every production target/risk/seed remains in band.

```bash
git add src/adventure/v2/dangerousFishingRealtime.ts src/adventure/v2/dangerousFishingRealtime.test.ts src/adventure/v2/dangerousFishingRealtimeModifiers.ts
git commit -m "fix: enforce realtime fishing duration budget"
```

### Task 2: Recover terminal legacy boss attempts without rewards

**Files:**
- Modify: `src/adventure/v2/dangerousFishingState.ts`
- Modify: `src/adventure/v2/dangerousFishingState.test.ts`
- Modify: `src/lib/server/dangerousFishingBoss.ts`
- Modify: `src/lib/server/dangerousFishingBossRoute.test.ts`
- Modify: `src/lib/server/dangerousFishingService.ts`
- Modify: `src/lib/server/dangerousFishingRoute.test.ts`
- Modify: `src/lib/server/savesKv.ts`

**Interfaces:**
- Extends: the shared expiry recovery helper used after acquiring the user row and dangerous-fishing save lock.
- Preserves: v2 completion idempotency, cargo, bait inventory, boss contribution, reward claims, and unrelated save fields.
- Produces: no-reward cleanup for v1 boss attempts whose encounter has expired, plus boss-status cleanup when the referenced event is terminal or missing.

- [ ] **Step 1: Add forward-only failing legacy recovery tests**

Create a real v1 boss attempt, advance time monotonically to `encounter.expiresAt`, then prove both normal entry paths recover it before applying symmetric exclusion: voyage start succeeds and normal encounter start succeeds. Assert the boss attempt becomes null while existing contribution, cargo, bait inventory, and unrelated state are byte-for-byte unchanged.

Add boss GET cases for a v1 attempt whose referenced event is terminal and whose event is missing. Both must clear the attempt without contribution or reward mutation.

```ts
expect(after.dangerousState.bossAttempt).toBeNull();
expect(after.contribution).toEqual(before.contribution);
expect(after.dangerousState.baitInventory).toEqual(before.dangerousState.baitInventory);
```

- [ ] **Step 2: Run the route/state tests and confirm RED**

Run: `npx vitest run src/adventure/v2/dangerousFishingState.test.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBossRoute.test.ts`

Expected: FAIL because the current shared recovery helper handles only `simulationVersion: 2` and symmetric exclusion still sees the v1 attempt.

- [ ] **Step 3: Extend recovery under the existing lock order**

After the user row and dangerous save are locked, clear a v1 boss attempt when `now >= encounter.expiresAt`. Do not append a v2 realtime completion for a v1 attempt. In boss GET, also clear a v1 attempt when its referenced event is missing or terminal. Persist the cleaned dangerous state in the same transaction before returning or evaluating voyage/normal-start exclusion.

Keep lock order user row first, then sorted save rows, then event rows. Update `src/lib/server/savesKv.ts` so its comment explicitly requires the caller to lock the user row before calling the sorted save-lock helper; remove the obsolete advice that `character.v2` must be the leading save lock.

- [ ] **Step 4: Run focused verification and commit**

Run: `npx vitest run src/adventure/v2/dangerousFishingState.test.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBoss.test.ts src/lib/server/dangerousFishingBossRoute.test.ts`

Run: `npx eslint src/adventure/v2/dangerousFishingState.ts src/adventure/v2/dangerousFishingState.test.ts src/lib/server/dangerousFishingService.ts src/lib/server/dangerousFishingBoss.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBossRoute.test.ts src/lib/server/savesKv.ts`

Run: `npx tsc --noEmit`

Expected: all commands exit 0; forward-only legacy cleanup succeeds without rewards or state loss.

```bash
git add src/adventure/v2/dangerousFishingState.ts src/adventure/v2/dangerousFishingState.test.ts src/lib/server/dangerousFishingBoss.ts src/lib/server/dangerousFishingBossRoute.test.ts src/lib/server/dangerousFishingService.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/savesKv.ts
git commit -m "fix: recover expired legacy boss attempts"
```

### Task 3: Correction verification gate

**Files:**
- Modify only files required to correct failures caused by Tasks 1–2.

**Interfaces:**
- Produces: an engine contract approved for the realtime client plan.

- [ ] **Step 1: Run the complete affected regression set**

Run: `npx vitest run src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts src/adventure/v2/dangerousFishingRealtime.test.ts src/adventure/v2/dangerousFishingHeritage.test.ts src/adventure/v2/dangerousFishingEncounter.test.ts src/adventure/v2/dangerousFishingState.test.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBoss.test.ts src/lib/server/dangerousFishingBossRoute.test.ts src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx`

Expected: all affected engine/server/client-containment tests pass with zero unhandled errors.

- [ ] **Step 2: Run static and scope verification**

Run: `npm run lint`

Run: `npx tsc --noEmit`

Run: `npm run check-module-budgets`

Run: `git diff --check`

Run: `rg -n 'start_realtime|DangerousFishingRealtime' src/adventure/v2/useDangerousFishing.ts src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingBossPanel.tsx`

Expected: static commands exit 0, and the search finds no realtime start/control integration in the current client.

- [ ] **Step 3: Commit only if verification required a product correction**

If Step 1 or 2 exposed a product defect, add a failing regression first, implement the minimum correction, rerun the affected command, and commit only those files. If no product file changed, record verification without an empty commit.
