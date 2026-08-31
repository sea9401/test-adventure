# Life Workshop Material Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group processing recipes by their output and let the player choose one of the two input materials inside a single card.

**Architecture:** Keep the route payload and processing API unchanged. Add an output-grouping helper and a focused client card in `LifeWorkshopView.tsx`; the card owns the selected recipe ID and delegates quantity input to the existing controls.

**Tech Stack:** Next.js 16 Client Components, React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library.

## Global Constraints

- Do not change the `/api/v2/life-workshop` request or response contract.
- Use opaque surface tokens for panels and cards.
- Preserve unrelated working-tree changes.
- Do not deploy.

---

### Task 1: Consolidate processing recipe rows

**Files:**
- Modify: `src/adventure/v2/LifeWorkshopView.tsx`
- Test: `src/adventure/v2/LifeWorkshopView.test.tsx`

**Interfaces:**
- Consumes: the existing `WorkshopRecipeView`, material balances, activity level, and `LifeWorkshopQuantityControls`.
- Produces: `groupWorkshopRecipesByOutput(recipes)` and `LifeWorkshopProcessingRecipeCard`, whose `onProcess` callback receives `(recipeId: string, batches: number)`.

- [x] **Step 1: Write failing grouping and interaction tests**

  Add a literal two-recipe fixture for `pine_softwood` and `birch_softwood`. Assert that grouping returns one group, then render the card, change the `다듬은 목재 재료 선택` select to birch, assert `필요 Lv.10 · 보유 568개` and `최대 71회`, and click `1회 가공` to assert `onProcess("birch_softwood", 1)`.

- [x] **Step 2: Run the focused tests and verify RED**

  Run `npm test -- src/adventure/v2/LifeWorkshopView.test.tsx` and expect failure because the grouping helper and processing card are not exported yet.

- [x] **Step 3: Implement the output grouping and selector card**

  Group recipes in insertion order by `outputId`. In the card, initialize the selected recipe to the first group entry, render an opaque native select containing each input name and amount, derive the detail and maximum from the selected entry, and pass the selected recipe ID through `onProcess`.

- [x] **Step 4: Replace duplicated process rows**

  Change the process tab to render one `LifeWorkshopProcessingRecipeCard` for each output group and keep the existing POST body construction in the parent callback.

- [x] **Step 5: Run focused and project checks**

  Run `npm test -- src/adventure/v2/LifeWorkshopView.test.tsx`, `npx eslint src/adventure/v2/LifeWorkshopView.tsx src/adventure/v2/LifeWorkshopView.test.tsx`, and `npx tsc --noEmit`.

- [x] **Step 6: Commit only task-owned files**

  Stage the two source files and these design/plan documents, review the staged diff, and commit with `fix: consolidate life processing recipes`.
