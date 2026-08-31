# Admin Mail Cooking Ingredients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins attach the twelve cooking kitchen ingredients to bulk mail and credit them to the recipient's cooking save on claim.

**Architecture:** Introduce a dedicated `cookingIngredients` attachment field instead of overloading general materials. Reuse the cooking pantry and processing catalogs as the allowlist, carry the typed entries through `admin_gift`, and merge them into `cooking.v2.kitchenItems` during inbox claim.

**Tech Stack:** Next.js 16 Route Handlers, React 19 Client Components, TypeScript, Vitest, Testing Library, Drizzle transaction mocks.

## Global Constraints

- The catalog contains exactly the six `COOKING_PANTRY_ITEMS` and six `COOKING_PROCESSING_RECIPES` outputs.
- Missing `cookingIngredients` remains backward-compatible as an empty array.
- Invalid IDs and non-positive quantities are rejected before persistence.
- Existing opaque surface and admin form components remain in use.
- Preserve unrelated working-tree changes and do not deploy.

---

### Task 1: Catalog and administrator UI

**Files:**
- Modify: `src/admin/adminCatalogOptions.ts`
- Modify: `src/admin/tabs/BroadcastTab.tsx`
- Test: `src/admin/tabs/BroadcastTab.test.tsx`

**Interfaces:**
- Produces: `cookingIngredientOptions(): CatalogOption[]` and request entries shaped as `{ ingredientId: string; count: number }`.

- [x] **Step 1: Write the failing UI test**

  Render `BroadcastTab` and assert that the `요리 재료 첨부` section contains all twelve catalog options.

- [x] **Step 2: Verify RED**

  Run `npm test -- src/admin/tabs/BroadcastTab.test.tsx`; expect the new section assertion to fail because it is absent.

- [x] **Step 3: Implement the catalog and picker**

  Build options from `COOKING_PANTRY_ITEMS` and `COOKING_PROCESSING_RECIPES`, add `attachCookingIngredients` state and an `AttachmentPicker`, include it in `hasReward`, the POST body, reset flow, toast summary, and all-user confirmation copy.

### Task 2: Administrator route validation

**Files:**
- Modify: `src/app/api/admin/mail/route.ts`
- Create: `src/app/api/admin/mail/route.test.ts`

**Interfaces:**
- Consumes: `isCookingKitchenItemId(id: string): id is CookingKitchenItemId`.
- Produces: validated `AdminGiftCookingIngredient[]` in the `admin_gift` payload and response.

- [x] **Step 1: Write the failing route test**

  POST one valid `pantry:salt`, one valid `processed:flour`, and one invalid ID. Assert the response and stored inbox payload contain only the two valid entries.

- [x] **Step 2: Verify RED**

  Run `npm test -- src/app/api/admin/mail/route.test.ts`; expect `cookingIngredients` to be absent.

- [x] **Step 3: Implement catalog validation**

  Export a catalog-backed ID guard from `kitchen.ts`, parse the new attachment with the existing count and entry limits, accept cooking-only mail, and include the field in audit and response data.

### Task 3: Payload parsing and claim persistence

**Files:**
- Modify: `src/lib/server/inboxPayload.ts`
- Modify: `src/lib/server/inboxPayload.test.ts`
- Modify: `src/app/api/marketplace/inbox/claim/route.ts`
- Modify: `src/lib/server/inboxClaimSeasonReward.test.ts`
- Modify: `src/adventure/v2/V2InboxView.tsx`
- Modify: `src/adventure/v2/V2InboxView.test.tsx`

**Interfaces:**
- Produces: `AdminGiftCookingIngredient`, `admin_gift.cookingIngredients`, and `cookingIngredientsAdded` in the claim response.

- [x] **Step 1: Write failing parser, claim, and display tests**

  Assert the parser preserves valid positive entries, defaults a missing field to `[]`, and treats cooking-only mail as claimable. Claim an admin gift containing salt and flour over an existing salt balance and assert `cooking.v2.kitchenItems` becomes `{ "pantry:salt": 7, "processed:flour": 3 }`. Assert the mail detail shows the ingredient names and quantities.

- [x] **Step 2: Verify RED**

  Run `npm test -- src/lib/server/inboxPayload.test.ts src/lib/server/inboxClaimSeasonReward.test.ts`; expect the new field and cooking save assertions to fail.

- [x] **Step 3: Implement parsing, claiming, and display**

  Normalize the payload entries, aggregate valid catalog IDs while scanning rows, lock and parse `COOKING_SAVE_KEY`, add counts to `kitchenItems`, persist the cooking state, return the credited entries, and show them in mail details and the claim toast.

### Task 4: Verification and commit

**Files:**
- Verify all files listed above plus `src/adventure/v2/cooking/kitchen.ts`.

- [x] **Step 1: Run focused tests**

  Run all new and affected Vitest files and confirm zero failures.

- [x] **Step 2: Run static checks**

  Run ESLint on changed source/test files and `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`.

- [x] **Step 3: Commit only task-owned files**

  Use a path-limited commit so concurrent unrelated changes cannot enter the commit. Commit message: `feat: add cooking ingredients to admin mail`.
