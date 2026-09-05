# Weekly Facility Conflict Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent expected weekly facility source conflicts from appearing as missing rewards and block conflicting guild facility actions before POST.

**Architecture:** Reuse the authoritative weekly source resolver for read-time eligibility and keep the transactional POST guard. Filter the known policy rejection at the reward logging boundary and classify historical rows separately for operations.

**Tech Stack:** Next.js 16 route handlers, React 19 client components, TypeScript, Vitest.

## Global Constraints

- Preserve the same-week different-guild anti-reset policy.
- Keep POST transaction validation authoritative.
- Treat a missing `weeklySourceEligible` response field as eligible for rolling deployment compatibility.
- Use existing opaque `SURFACE_*` tokens for new UI notices.
- Do not deploy or change maintenance mode.

---

### Task 1: Shared weekly source read model

**Files:**
- Modify: `src/lib/server/adventurerAssociation.ts`
- Modify: `src/lib/server/adventurerAssociation.test.ts`

**Interfaces:**
- Produces: `readWeeklyFacilitySourceSelection(executor, userId, buildingId, weekKey): Promise<WeeklyFacilitySourceSelection | null>`.
- Preserves: `readWeeklyFacilitySource(...): Promise<WeeklyFacilitySource | null>`.

- [x] Add a failing test proving a current `guildId: 11` selection conflicts with a request for `guildId: 6`.
- [x] Run the focused test and confirm the expected failure if the read-model API is not yet present.
- [x] Implement the selection reader and delegate the existing source reader to it.
- [x] Run the focused test and confirm it passes.

### Task 2: Read-time blocking in training and alchemy

**Files:**
- Modify: `src/app/api/v2/guild/training-ground/route.ts`
- Modify: `src/app/api/v2/guild/alchemy-workshop/route.ts`
- Modify: `src/adventure/v2/guild/trainingGroundClient.ts`
- Modify: `src/adventure/v2/guild/GuildTrainingGroundPanel.tsx`
- Modify: `src/adventure/v2/guild/GuildAlchemyWorkshopPanel.tsx`
- Create: `src/adventure/v2/guild/weeklyFacilityClient.test.ts`
- Create: `src/adventure/v2/guild/weeklyFacilityClient.ts`

**Interfaces:**
- Consumes: `readWeeklyFacilitySourceSelection` and `resolveWeeklyFacilitySourceClaim`.
- Produces: optional response field `weeklySourceEligible: boolean` and `weeklyFacilityActionLimit(eligible, limit): number`.

- [x] Add failing pure-client tests proving an explicit conflict makes training claims and alchemy quantities zero while an omitted field preserves compatibility.
- [x] Run the focused tests and confirm they fail because the helper is missing.
- [x] Implement the shared client limit helper and use it in both panels.
- [x] Add GET eligibility calculation to both route handlers using the authoritative resolver.
- [x] Render an opaque conflict notice and disable individual/recommended training and alchemy controls.
- [x] Run the focused route/client tests and confirm they pass.

### Task 3: Reward logging and historical ops classification

**Files:**
- Modify: `src/lib/server/economyLog.ts`
- Modify: `src/lib/server/economyLogBatching.test.ts`
- Create: `src/lib/server/rewardFailureClassification.ts`
- Create: `src/lib/server/rewardFailureClassification.test.ts`
- Modify: `src/app/api/admin/ops-dashboard/route.ts`

**Interfaces:**
- Produces: `isExpectedRewardRejection(error): boolean`.
- Produces: `classifyRewardFailure(row, currentDayEconomyRows)` in the focused classification module.

- [x] Add a failing logging test proving `weekly_source_conflict` causes no economy insert while an unknown failure still inserts.
- [x] Run the logging test and confirm it fails on the unexpected insert.
- [x] Implement the narrow expected-rejection filter.
- [x] Add a failing classifier test expecting `policy_rejection`, info tone, and no-compensation guidance.
- [x] Run it and confirm the classifier is absent or returns the old missing-reward result.
- [x] Extract and implement the classifier, then update the dashboard import.
- [x] Run both focused tests and confirm they pass.

### Task 4: Verification and commit

**Files:**
- Verify all files above without staging unrelated guild raid work.

- [ ] Run all focused tests for weekly source, routes, UI helpers, logging, and classification.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run ESLint on the changed source and test files.
- [ ] Inspect `git diff --check` and the scoped diff.
- [ ] Stage only this plan, spec, and implementation files.
- [ ] Commit with message `fix: separate weekly facility policy conflicts`.
