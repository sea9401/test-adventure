# Cooking Planning Convenience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display base cooking XP in the recipe codex and let players choose pantry purchase and ingredient-processing quantities.

**Architecture:** Reuse `craftXp` already present in discovered recipe details, so the codex needs no API change. Add isolated client-side row components to the processing panel, backed by `DraftNumberInput`; continue sending the existing `quantity` field to the cooking route and keep server validation authoritative.

**Tech Stack:** Next.js 16 App Router client components, React 19 state, TypeScript, Tailwind CSS, Vitest, Testing Library.

## Global Constraints

- Read relevant documentation from `node_modules/next/dist/docs/` before changing Next.js code.
- Keep content wrappers and nested cards opaque by using the existing surface constants.
- Do not deploy.
- Do not modify or commit concurrent dangerous-fishing work.
- Use TDD for both requested behaviors.

---

### Task 1: Show recipe cooking XP in the codex

**Files:**
- Modify: `src/adventure/v2/cooking/CookingCodexPanel.test.tsx`
- Modify: `src/adventure/v2/cooking/CookingCodexPanel.tsx`

**Interfaces:**
- Consumes: `CookingRecipeSecret.craftXp` from the existing `knownRecipes` map.
- Produces: visible text `기본 조리 XP +{craftXp}` for discovered recipes only.

- [x] **Step 1: Write the failing codex XP test**

Extend the existing pagination test file with a test that renders the basic discovered recipe fixture and asserts:

```tsx
expect(screen.getByText("기본 조리 XP +20")).toBeTruthy();
```

- [x] **Step 2: Run the codex test and verify RED**

Run: `npm test -- src/adventure/v2/cooking/CookingCodexPanel.test.tsx`

Expected: FAIL because the codex currently renders effects and ingredients but not `craftXp`.

- [x] **Step 3: Render the base XP label**

In the discovered recipe details, render a small amber label immediately after the effect text:

```tsx
<div className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
  기본 조리 XP +{detail.craftXp.toLocaleString("ko-KR")}
</div>
```

- [x] **Step 4: Run the codex test and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking/CookingCodexPanel.test.tsx`

Expected: both pagination and XP display tests PASS.

### Task 2: Add pantry purchase quantity controls

**Files:**
- Create: `src/adventure/v2/cooking/CookingProcessingPanel.test.tsx`
- Modify: `src/adventure/v2/cooking/CookingProcessingPanel.tsx`

**Interfaces:**
- Consumes: `CookingPantryItem`, `busy`, and the existing `CookingMutation` callback.
- Produces: `buy_pantry` mutations with an integer `quantity` from 1 through 100 and a button showing total price.

- [x] **Step 1: Write the failing pantry quantity test**

Create a jsdom test fixture containing pantry and processing data. Render the panel, change the input labelled `소금 구매 수량` to 7, assert the button reads `7개 · 350골드 구매`, click it, and assert:

```tsx
expect(mutate).toHaveBeenCalledWith({
  action: "buy_pantry",
  itemId: "pantry:salt",
  quantity: 7,
});
```

- [x] **Step 2: Run the processing panel test and verify RED**

Run: `npm test -- src/adventure/v2/cooking/CookingProcessingPanel.test.tsx`

Expected: FAIL because the purchase row has no labelled quantity input and always submits 1.

- [x] **Step 3: Implement the pantry row control**

Import `useState`, `DraftNumberInput`, and `CookingPantryItem`. Extract `PantryPurchaseRow`, keep a per-row quantity state, render a 1~100 input labelled `${item.name} 구매 수량`, show `item.price * quantity`, and submit that quantity through `buy_pantry`.

- [x] **Step 4: Run the processing panel test and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking/CookingProcessingPanel.test.tsx`

Expected: the pantry quantity test PASS.

### Task 3: Add bounded processing quantity controls

**Files:**
- Modify: `src/adventure/v2/cooking/CookingProcessingPanel.test.tsx`
- Modify: `src/adventure/v2/cooking/CookingProcessingPanel.tsx`

**Interfaces:**
- Consumes: `CookingProcessingRecipe`, `farmItems`, `farmItemDefinitions`, `busy`, and `CookingMutation`.
- Produces: a maximum craftable quantity capped at 100, scaled ingredient requirements, and `process` mutations using the selected quantity.

- [x] **Step 1: Write the failing processing quantity test**

Seed 12 wheat for the flour recipe, enter 8 in `밀가루 가공 수량`, blur the input, and assert it clamps to 4. Assert the row shows `밀 12개`, click `4개 가공`, and verify:

```tsx
expect(mutate).toHaveBeenCalledWith({
  action: "process",
  itemId: "processed:flour",
  quantity: 4,
});
```

- [x] **Step 2: Run the processing panel test and verify RED**

Run: `npm test -- src/adventure/v2/cooking/CookingProcessingPanel.test.tsx`

Expected: FAIL because the processing row has no quantity input and always submits 1.

- [x] **Step 3: Implement maximum calculation and processing row control**

Add a pure `maxProcessingQuantity` helper that floors `owned / required` for every ingredient and returns the minimum capped at 100. Extract `ProcessingRecipeRow`, clamp its displayed selection to that maximum, scale each ingredient count by the selection, disable input and button at zero, and submit the selected value through `process`.

- [x] **Step 4: Run the processing panel tests and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking/CookingProcessingPanel.test.tsx`

Expected: purchase and processing quantity tests PASS.

### Task 4: Verify and commit the scoped feature

**Files:**
- Verify only the two panel sources, their tests, and this plan.

**Interfaces:**
- Consumes: completed UI behavior from Tasks 1–3.
- Produces: one scoped local feature commit without deployment.

- [x] **Step 1: Run focused tests**

Run: `npm test -- src/adventure/v2/cooking/CookingCodexPanel.test.tsx src/adventure/v2/cooking/CookingProcessingPanel.test.tsx src/adventure/v2/cooking/kitchen.test.ts src/app/api/v2/cooking/route.test.ts`

- [x] **Step 2: Run static verification**

Run: `npx eslint src/adventure/v2/cooking/CookingCodexPanel.tsx src/adventure/v2/cooking/CookingCodexPanel.test.tsx src/adventure/v2/cooking/CookingProcessingPanel.tsx src/adventure/v2/cooking/CookingProcessingPanel.test.tsx`

Run: `npx tsc --noEmit`

- [x] **Step 3: Review the scoped diff**

Run `git diff --check` and confirm no deployment or concurrent dangerous-fishing files are included.

- [x] **Step 4: Commit only the plan and feature files**

Commit message: `feat: improve cooking planning controls`
