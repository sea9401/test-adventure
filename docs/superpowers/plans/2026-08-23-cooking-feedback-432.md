# Cooking Feedback #432 Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore cooking purchases and production for existing players and display authoritative nicknames for cooking first discoveries.

**Architecture:** Keep published version-1 cooking mastery definitions stable for the 45 legacy recipes while applying the expanded catalog rules only to new recipes. Route pantry purchases through the shared bank-aware gold spender, and resolve discovery names from `users.gameName` with the profile save fallback while preserving valid historical snapshots.

**Tech Stack:** Next.js 16.2.11 App Router Route Handlers, TypeScript, Drizzle ORM, PostgreSQL, Vitest.

## Global Constraints

- Do not deploy or change production data.
- Preserve the user's pending `CookingCodexPanel` pagination changes.
- Use bank-first spending only through the existing core-loop payment helper.
- Keep valid discovery-name snapshots unchanged; repair only the default placeholder on reads.

---

### Task 1: Preserve published cooking mastery definitions

**Files:**
- Modify: `src/adventure/data/v2/codexMasteryProductionCatalog.ts`
- Modify: `src/adventure/data/v2/codexMasteryProductionCatalog.test.ts`
- Modify: `src/lib/server/codexMasteryService.test.ts`

**Interfaces:**
- Consumes: persisted `CodexMasteryProgress` rows created by the 45-recipe catalog.
- Produces: stable legacy thresholds and `scoreWeightMilli` accepted by `createCodexMasteryRecorder` after the 100-recipe expansion.

- [x] **Step 1: Write failing catalog and recorder tests**

Add literal expectations that `egg_salad_sandwich` retains the old rare-ingredient thresholds and the published cooking weight `10_101`, and exercise a persisted bronze row with `count: 1` and `scoreMilli: 20_202` through a real mastery recorder mutation.

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/adventure/data/v2/codexMasteryProductionCatalog.test.ts src/lib/server/codexMasteryService.test.ts`

Expected: FAIL because the expanded catalog currently classifies the legacy entry with normal thresholds and weight `4_545`, causing the locked progress inconsistency.

- [x] **Step 3: Restore stable legacy definitions**

Keep the version-1 cooking score source count at 45. Classify legacy recipe IDs with their pre-overhaul normal, advanced, or rare-ingredient threshold profile; classify only new IDs from the new recipe tier.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- src/adventure/data/v2/codexMasteryProductionCatalog.test.ts src/lib/server/codexMasteryService.test.ts`

Expected: PASS, including the persisted legacy cooking progress mutation.

### Task 2: Make pantry purchases bank-aware

**Files:**
- Modify: `src/adventure/v2/cooking/kitchen.ts`
- Modify: `src/adventure/v2/cooking/kitchen.test.ts`
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/app/api/v2/cooking/route.test.ts`

**Interfaces:**
- Consumes: `CharacterSave.gold`, `CharacterSave.bankedGold`, `spendGold`, pantry item ID and quantity.
- Produces: updated wallet, bank balance, and kitchen inventory in the same transaction.

- [x] **Step 1: Write a failing route regression test**

Enable `NEXT_PUBLIC_V2_CORE_LOOP_V2` before importing the route, seed `{ gold: 0, bankedGold: 500 }`, buy one salt, and assert `{ gold: 0, bankedGold: 450 }` plus one salt.

- [x] **Step 2: Run the route test and verify RED**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts`

Expected: FAIL with HTTP 409 `not_enough_gold` because only wallet gold is passed to the purchase helper.

- [x] **Step 3: Use the shared payment helper**

Extend the kitchen purchase input/output with `bankedGold`, call `spendGold`, reject unsuccessful payments with `not_enough_gold`, and persist both balances from the route.

- [x] **Step 4: Run kitchen and route tests and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking/kitchen.test.ts src/app/api/v2/cooking/route.test.ts`

Expected: PASS with wallet-only behavior unchanged and bank-only payment covered.

### Task 3: Resolve first-discovery nicknames authoritatively

**Files:**
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/app/api/v2/cooking/route.test.ts`

**Interfaces:**
- Consumes: `users.gameName`, `character-profile.v2.name`, and the stored discovery snapshot.
- Produces: correct actor name on new inserts and a read-time fallback for legacy placeholder rows.

- [x] **Step 1: Write failing insert and read fallback tests**

Mock `resolveUserDisplayName` as `나리`; seed `character.v2` without a name; assert the discovery insert uses `나리`. Return a placeholder discovery row through GET and assert the response uses the joined authoritative name while a non-placeholder snapshot remains unchanged.

- [x] **Step 2: Run the route test and verify RED**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts`

Expected: FAIL because inserts currently use `character.v2.name` and reads return the placeholder verbatim.

- [x] **Step 3: Resolve names at write and read boundaries**

Resolve the current actor name once for research mutations. Join discovery reads to `users` and the profile save, replacing only `이름 없는 모험가` with `gameName`, then profile name, then the stored placeholder.

- [x] **Step 4: Run the route test and verify GREEN**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts`

Expected: PASS for authoritative inserts, legacy placeholder display, and valid historical snapshots.

### Task 4: Full verification and commit

**Files:**
- Verify all modified source and test files.

**Interfaces:**
- Consumes: the three completed fixes.
- Produces: one local commit without deployment.

- [x] **Step 1: Run focused cooking and mastery tests**

Run: `npm test -- src/adventure/v2/cooking src/app/api/v2/cooking/route.test.ts src/adventure/data/v2/codexMasteryProductionCatalog.test.ts src/lib/server/codexMasteryService.test.ts`

- [x] **Step 2: Run static verification**

Run: `npx eslint src/adventure/v2/cooking/kitchen.ts src/adventure/v2/cooking/kitchen.test.ts src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts src/adventure/data/v2/codexMasteryProductionCatalog.ts src/adventure/data/v2/codexMasteryProductionCatalog.test.ts src/lib/server/codexMasteryService.test.ts`

Run: `npx tsc --noEmit`

- [x] **Step 3: Review the scoped diff**

Confirm the diff does not include `src/adventure/v2/cooking/CookingCodexPanel.tsx` or its pending test and does not contain deployment changes.

- [x] **Step 4: Commit only the fix files and plan**

Commit message: `fix: restore cooking purchases and production`
