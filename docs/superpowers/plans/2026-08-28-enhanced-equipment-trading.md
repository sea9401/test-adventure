# Enhanced Equipment Trading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make enhanced equipment tradable, remove enhancement reset, and retain explicit equipment binding as an independent future-facing mechanism.

**Architecture:** Add `bound?: true` to the equipment instance model and make the shared transfer policy depend on it instead of `enhance`. Preserve enhancement metadata in every marketplace payload path, remove legacy enhanced-listing filters, and delete the reset surface end to end.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest

## Global Constraints

- Do not deploy.
- Do not retroactively bind existing equipment.
- Preserve `enhance`, roll, craft quality, crafter, and storm refinement metadata across transfers.
- Keep locked and equipped transfer restrictions unchanged.
- Do not add a current producer for `bound`; retain only parsing, storage, restoration, and transfer enforcement.

---

### Task 1: Explicit equipment binding model

**Files:**
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/data/v2/v2EquipMint.ts`
- Modify: `src/adventure/data/v2/v2EquipMint.test.ts`

**Interfaces:**
- Produces: `V2EquipInstance.bound?: true`
- Produces: `listedEquipBound(payload: unknown): boolean`
- Produces: `mintListedEquipInstance()` restoration of `bound` and `enhance`

- [ ] **Step 1: Write failing parser and payload restoration tests**

Add literal fixtures proving `bound: true` survives save parsing and listing restoration, while false or malformed values do not bind an item.

- [ ] **Step 2: Run the focused tests and verify the new assertions fail**

Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/v2EquipMint.test.ts`

- [ ] **Step 3: Add the optional bound field and strict parsers**

Add `bound?: true`, parse only literal `true`, expose `listedEquipBound`, and preserve the field in listing restoration.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/v2EquipMint.test.ts`

### Task 2: Trade enhanced equipment without metadata loss

**Files:**
- Modify: `src/lib/server/marketplaceV2.ts`
- Modify: `src/lib/server/marketplaceV2.test.ts`
- Modify: `src/app/api/v2/marketplace/list/route.ts`
- Modify: `src/lib/server/marketplaceListRoute.test.ts`
- Modify: `src/app/api/v2/marketplace/browse/route.ts`
- Modify: `src/app/api/v2/marketplace/buy/route.ts`
- Modify: `src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts`
- Modify: `src/lib/server/equipmentBuyOrderSale.ts`
- Modify: `src/lib/server/equipmentBuyOrderSale.test.ts`
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`

**Interfaces:**
- Consumes: `V2EquipInstance.bound` and `listedEquipBound()`
- Produces: `MarketplaceEquipListError` with `bound` instead of `enhanced`
- Produces: listing and buy-order payloads that include `enhance`

- [ ] **Step 1: Change policy tests to require enhanced equipment acceptance and bound equipment rejection**

Update the policy fixture so `{ enhance: { level: 1, bonusPct: 1 } }` returns `null`, while `{ bound: true }` returns `bound`.

- [ ] **Step 2: Add failing integration assertions for enhancement payload preservation**

Extend direct-listing and equipment-buy-order tests to assert the literal normalized enhancement object is stored in `instancePayload`.

- [ ] **Step 3: Run focused marketplace tests and verify they fail for the old policy and missing payload**

Run: `npm test -- src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/equipmentBuyOrderSale.test.ts`

- [ ] **Step 4: Replace enhanced restrictions with bound restrictions**

Change the shared policy, remove enhanced browse and buy guards, add bound defense-in-depth guards, and update the client error label.

- [ ] **Step 5: Serialize enhancement in direct listing and buy-order payloads**

Include `enhance` in both payload builders so marketplace delivery, cancellation, and expiration restore it through `mintListedEquipInstance()`.

- [ ] **Step 6: Run the marketplace tests and verify they pass**

Run: `npm test -- src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/equipmentBuyOrderSale.test.ts src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts src/adventure/data/v2/v2EquipMint.test.ts`

### Task 3: Apply independent binding to guild transfers

**Files:**
- Modify: `src/app/api/v2/guild/warehouse/route.test.ts`
- Modify: `src/adventure/v2/guild/GuildWarehousePanel.tsx`

**Interfaces:**
- Consumes: `marketplaceEquipListError()`
- Produces: enhanced equipment deposit success and bound equipment deposit rejection

- [ ] **Step 1: Change the warehouse regression test**

Require an enhanced equipment deposit to succeed, and add a bound equipment fixture that returns `equipment_not_tradable` with reason `bound`.

- [ ] **Step 2: Run the warehouse test and verify the old enhanced restriction fails**

Run: `npm test -- src/app/api/v2/guild/warehouse/route.test.ts`

- [ ] **Step 3: Update the warehouse error copy**

Replace the enhanced-item warning with a bound-or-locked warning. The route already consumes the shared policy.

- [ ] **Step 4: Run the warehouse test and verify it passes**

Run: `npm test -- src/app/api/v2/guild/warehouse/route.test.ts`

### Task 4: Remove enhancement reset end to end

**Files:**
- Delete: `src/app/api/v2/me/enhance/reset/route.ts`
- Delete: `src/lib/server/enhanceResetRoute.test.ts`
- Delete: `src/adventure/v2/enhancementResetClient.ts`
- Delete: `src/adventure/v2/enhancementResetClient.test.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/v2/V2EnhanceView.tsx`
- Modify: `src/adventure/v2/V2EnhanceView.test.tsx`
- Modify: `src/app/manual/content/enhance.tsx`
- Modify: `docs/v2-equipment-enhance-plan.md`

**Interfaces:**
- Removes: reset route, reset client helper, reset domain helpers, reset UI components and state
- Preserves: the enhancement system and the new independent binding field

- [ ] **Step 1: Remove reset-only tests and product files**

Delete the route/client tests with their implementations and remove reset-only imports and test blocks from shared files.

- [ ] **Step 2: Remove reset UI state and actions**

Delete the button, dialog, request callback, reset power calculation, modal state, and all modal-closing calls from `V2EnhanceView`.

- [ ] **Step 3: Update player documentation**

Remove the manual reset section and state that enhanced equipment can be traded if it is not explicitly bound, locked, or equipped. Update the historical design document to describe explicit binding instead of enhancement binding.

- [ ] **Step 4: Verify no reset product references remain**

Run: `rg -n "enhance/reset|강화 초기화|EnhancementReset|resetInstanceEnhancement|enhancementReset" src docs/v2-equipment-enhance-plan.md`

Expected: no output.

### Task 5: Full verification and commit

**Files:**
- Verify all modified files

- [ ] **Step 1: Run related tests**

Run all equipment, marketplace, warehouse, enhancement view, and route test files changed above.

- [ ] **Step 2: Run static checks**

Run: `npx eslint <all modified TypeScript and TSX files>`

Run: `npx tsc --noEmit`

Run: `npm run check-images`

- [ ] **Step 3: Run the production build**

Run: `npm run build`

- [ ] **Step 4: Inspect the final diff and commit**

Confirm only the requested feature and its tests/docs changed, then commit without deploying.
