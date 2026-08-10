# Guild Facility Membership Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve safe weekly facility progress when a solo player joins a guild while preventing association, guild, and cross-guild reward duplication.

**Architecture:** Extend the existing per-user facility source ledger with optional guild ownership and a pure transition policy. Reconcile safe association facilities in both guild join transactions, retain dining personal progress, and treat dining/trade eligibility lists as target-size snapshots rather than midweek access gates.

**Tech Stack:** TypeScript, Next.js 16 App Router Route Handlers, Drizzle ORM transactions, Vitest.

## Global Constraints

- Never deploy without an explicit deployment request.
- Do not change maintenance mode.
- Preserve all unrelated worktree changes.
- Use regression tests before production changes.
- Association-to-guild transfer is one-way and excludes the trade post.
- A weekly guild source is owned by one concrete guild ID.

---

### Task 1: Weekly facility source transition policy

**Files:**
- Modify: `src/adventure/data/v2/adventurerAssociation.ts`
- Modify: `src/adventure/data/v2/adventurerAssociation.test.ts`
- Modify: `src/lib/server/adventurerAssociation.ts`

**Interfaces:**
- Produces: `WeeklyFacilitySourceSelection` with optional `guildId`.
- Produces: `resolveWeeklyFacilitySourceClaim(current, request)` returning an allowed normalized selection or a conflict.
- Produces: `weeklyFacilitySourcesAfterGuildJoin(state, weekKey, guildId)` for safe one-way membership reconciliation.
- Changes: `claimWeeklyFacilitySource(..., source, weekKey, guildId?)` stores and validates guild ownership.

- [x] **Step 1: Write failing policy tests**

Add literal table cases proving training, smithy, alchemy, and dining transfer from association to guild; trade post conflicts; guild-to-association conflicts; another guild conflicts; and a legacy guild selection without `guildId` binds to the current guild.

- [x] **Step 2: Run the policy tests and verify RED**

Run: `npm test -- src/adventure/data/v2/adventurerAssociation.test.ts`

Expected: FAIL because the transition interfaces and behavior do not exist.

- [x] **Step 3: Implement the minimal pure policy and persistence adapter**

Parse valid positive integer `guildId` values, normalize every new guild claim with its guild ID, and make the server helper persist the pure policy result under the existing save key.

- [x] **Step 4: Update all facility claims with their current guild ID**

Pass the resolved guild ID from training ground, workshop, alchemy workshop, dining hall, and trade post guild routes. Keep association routes without a guild ID.

- [x] **Step 5: Run the policy tests and verify GREEN**

Run: `npm test -- src/adventure/data/v2/adventurerAssociation.test.ts`

Expected: PASS.

### Task 2: Membership reconciliation and dining state migration

**Files:**
- Create: `src/lib/server/guildFacilityMembership.ts`
- Create: `src/lib/server/guildFacilityMembership.test.ts`
- Modify: `src/adventure/data/v2/guildDining.ts`
- Modify: `src/adventure/data/v2/guildDining.test.ts`
- Modify: `src/app/api/guilds/requests/[requestId]/accept/route.ts`
- Modify: `src/app/api/guilds/invites/[inviteId]/accept/route.ts`

**Interfaces:**
- Produces: `reconcileGuildFacilitiesOnJoin(tx, userId, guildId, now?)`.
- Consumes: `weeklyFacilitySourcesAfterGuildJoin` from Task 1.

- [x] **Step 1: Write failing dining migration tests**

Add a test proving `guildId: 0 -> guildId: 7` preserves `contributionPoints`, `mealsUsed`, and the active effect, while `guildId: 3 -> guildId: 7` still resets contribution points.

- [x] **Step 2: Run the dining tests and verify RED**

Run: `npm test -- src/adventure/data/v2/guildDining.test.ts`

Expected: FAIL because association contribution currently resets.

- [x] **Step 3: Implement association dining-state preservation**

Treat stored `guildId: 0` as an association owner that may transfer its same-week contribution to a positive guild ID. Preserve the existing cross-guild reset.

- [x] **Step 4: Write failing join reconciliation tests**

Test that the join reconciler updates only safe facility selections, persists dining state only when dining transferred, and leaves trade-post association selection untouched.

- [x] **Step 5: Run the reconciler tests and verify RED**

Run: `npm test -- src/lib/server/guildFacilityMembership.test.ts`

Expected: FAIL because the reconciler does not exist.

- [x] **Step 6: Implement and wire the reconciler**

Lock the source save, transform it once, migrate the dining user save when required, and call the reconciler immediately after member insertion in both request-accept and invite-accept transactions.

- [x] **Step 7: Run the focused tests and verify GREEN**

Run: `npm test -- src/adventure/data/v2/guildDining.test.ts src/lib/server/guildFacilityMembership.test.ts`

Expected: PASS.

### Task 3: Midweek dining and trade access

**Files:**
- Modify: `src/app/api/v2/guild/dining-hall/route.test.ts`
- Modify: `src/app/api/v2/guild/dining-hall/route.ts`
- Modify: `src/app/api/v2/guild/trade-post/route.test.ts`
- Modify: `src/app/api/v2/guild/trade-post/route.ts`

**Interfaces:**
- Consumes: guild-aware `claimWeeklyFacilitySource` from Task 1.
- Behavior: `eligibleUserIds` remains a weekly target snapshot but no longer rejects a current guild member's action.

- [x] **Step 1: Write failing route regression tests**

For dining, use an empty `eligibleUserIds` snapshot with a ready pantry and assert that a current guild member can order a base-ticket meal. For trade, use an empty snapshot and assert that a current guild member with no association source can deliver.

- [x] **Step 2: Run the route tests and verify RED**

Run: `npm test -- src/app/api/v2/guild/dining-hall/route.test.ts src/app/api/v2/guild/trade-post/route.test.ts`

Expected: FAIL with `not_eligible`.

- [x] **Step 3: Remove snapshot access gates**

Keep the snapshot fields and targets unchanged, remove only the two action-level `not_eligible` rejections, and report current guild members as eligible in the views. Let the source claim reject association or other-guild use before consumption.

- [x] **Step 4: Run the route tests and verify GREEN**

Run: `npm test -- src/app/api/v2/guild/dining-hall/route.test.ts src/app/api/v2/guild/trade-post/route.test.ts`

Expected: PASS.

### Task 4: Verification and commit

**Files:**
- Verify all files changed by Tasks 1-3.

- [x] **Step 1: Run focused facility tests**

Run: `npm test -- src/adventure/data/v2/adventurerAssociation.test.ts src/adventure/data/v2/guildDining.test.ts src/lib/server/guildFacilityMembership.test.ts src/app/api/v2/guild/training-ground/route.test.ts src/app/api/v2/guild/alchemy-workshop/route.test.ts src/app/api/v2/guild/workshop/route.test.ts src/app/api/v2/guild/dining-hall/route.test.ts src/app/api/v2/guild/trade-post/route.test.ts`

- [x] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Run: `git diff --check`

- [x] **Step 3: Run the complete test suite**

Run: `npm test`

- [x] **Step 4: Review the diff for migration and transaction safety**

Confirm every guild claim passes its guild ID, association calls do not, both join routes reconcile inside their transaction, and no material consumption occurs before a conflicting source claim.

- [x] **Step 5: Commit the implementation**

```bash
git add src docs/superpowers/plans/2026-08-11-guild-facility-membership-transition.md
git commit -m "fix: carry facility access across guild join"
```
