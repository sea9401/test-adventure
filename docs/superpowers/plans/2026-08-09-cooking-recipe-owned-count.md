# Cooking Recipe Owned Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the total number of every cooked recipe currently held beside its name in the personal kitchen recipe list.

**Architecture:** Keep the existing cooking API and inventory model unchanged. Add a small presentational component to `CookingPanel.tsx` that derives a recipe total from `deliverableCookingFoods`, then render it in every recipe heading; existing POST response state replacement supplies immediate updates after cooking or delivery.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, React server rendering tests, Tailwind CSS

## Global Constraints

- Sum every valid inventory variant with the same `recipeId`, including all qualities, rare-ingredient variants, and durations.
- Render `보유 0개` when no matching food is held.
- Keep recipe-card surfaces opaque in light and dark modes.
- Do not change APIs, persistence, order delivery, the codex, or deployment state.
- Preserve unrelated working-tree changes and do not create subagents.

---

### Task 1: Recipe Owned Count Badge

**Files:**
- Modify: `src/adventure/v2/CookingPanel.test.tsx`
- Modify: `src/adventure/v2/CookingPanel.tsx`

**Interfaces:**
- Consumes: `deliverableCookingFoods(raw: unknown, recipeId: string): DeliverableCookingFood[]`, `CookingFoodInventory`, and each recipe card's `recipe.id`.
- Produces: `RecipeOwnedCount({ recipeId, cookingFoods }: { recipeId: string; cookingFoods: CookingFoodInventory }): React.JSX.Element`.

- [x] **Step 1: Write the failing component tests**

Add tests that render `RecipeOwnedCount` with literal, independently derived inventory fixtures:

```tsx
const inventory = {
  "food:herb_tea:normal:base:standard": 2,
  "food:herb_tea:careful:base:standard": 5,
  "food:rustic_bread:masterpiece:base:standard": 11,
} as CookingFoodInventory;

expect(
  renderToStaticMarkup(
    <RecipeOwnedCount recipeId="herb_tea" cookingFoods={inventory} />,
  ),
).toContain("보유 <strong>7</strong>개");

expect(
  renderToStaticMarkup(
    <RecipeOwnedCount recipeId="herb_tea" cookingFoods={{}} />,
  ),
).toContain("보유 <strong>0</strong>개");
```

The tests catch a missing badge, summing only one food variant, including another recipe, or hiding zero.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/v2/CookingPanel.test.tsx`

Expected: FAIL because `RecipeOwnedCount` is not exported from `CookingPanel.tsx`.

- [x] **Step 3: Implement the minimal owned-count badge**

In `CookingPanel.tsx`, export a presentational component that sums the counts returned by `deliverableCookingFoods` and renders an opaque light/dark badge:

```tsx
export function RecipeOwnedCount({
  recipeId,
  cookingFoods,
}: {
  recipeId: string;
  cookingFoods: CookingFoodInventory;
}) {
  const owned = deliverableCookingFoods(cookingFoods, recipeId).reduce(
    (total, entry) => total + entry.count,
    0,
  );
  return (
    <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
      보유 <strong>{owned}</strong>개
    </span>
  );
}
```

Render it immediately after `recipe.name` inside the recipe-card `<h4>`, passing `data.cookingFoods`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/adventure/v2/CookingPanel.test.tsx`

Expected: all `CookingPanel.test.tsx` tests PASS without warnings.

- [x] **Step 5: Run related verification**

Run: `npm test -- src/adventure/v2/CookingPanel.test.tsx src/adventure/v2/cooking.test.ts src/app/api/v2/cooking/route.test.ts`

Run: `npx tsc --noEmit`

Expected: all selected tests PASS and TypeScript exits with status 0.

- [x] **Step 6: Review and commit**

Inspect `git diff --check`, the scoped diff, and `git status --short`. Confirm unrelated changes remain untouched, then commit only the plan, test, and component:

```bash
git add docs/superpowers/plans/2026-08-09-cooking-recipe-owned-count.md src/adventure/v2/CookingPanel.test.tsx src/adventure/v2/CookingPanel.tsx
git commit -m "feat: show owned counts in cooking recipes"
```
