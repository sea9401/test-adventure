# Cooking Research Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a player's recent failed cooking combinations and prevent an already recorded failure from being submitted again from the research screen.

**Architecture:** Reuse the existing relational `cooking_failed_combinations` rows as the authoritative notebook. Add a bounded, secret-free projection to the cooking API and compare selected public ingredient IDs against that projection in the client while retaining the server's existing hash-based duplicate guard.

**Tech Stack:** Next.js 16.2.11 App Router Route Handlers, React 19 Client Components, TypeScript 5, Drizzle ORM/PostgreSQL, Vitest and Testing Library.

## Global Constraints

- Do not deploy.
- Do not expose undiscovered recipe combinations or server-only recipe helpers.
- Return at most the current user's 100 most recent failed combinations.
- Keep the server-side `duplicate_combination` check authoritative.
- Use opaque `SURFACE_CARD` and `SURFACE_INSET` UI surfaces.
- Preserve unrelated dangerous-fishing working-tree changes.

---

### Task 1: Expose the bounded failed-research notebook

**Files:**
- Modify: `src/adventure/v2/cooking/clientTypes.ts`
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/app/api/v2/cooking/route.test.ts`

**Interfaces:**
- Produces `CookingFailedResearchView` and `CookingResponse.failedResearches`.
- Produces `failedCombinationRows(executor, userId)` returning method, ingredient IDs, and millisecond timestamps in newest-first order.

- [ ] **Step 1: Write failing GET and research-response tests**

Add a literal failed row to the route mock and assert:

```ts
expect(json.failedResearches).toEqual([{
  method: "stir_fry",
  ingredientIds: ["farm:wheat", "farm:milk"],
  createdAt: NOW,
}]);
```

For a failed POST, queue the newly inserted row for the response projection and assert it appears in `json.failedResearches`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts`

Expected: FAIL because `failedResearches` is absent.

- [ ] **Step 3: Add the client-safe type and bounded DB projection**

Add:

```ts
export type CookingFailedResearchView = {
  method: CookingMethod;
  ingredientIds: CookingIngredientId[];
  createdAt: number;
};
```

Query only the current user:

```ts
return executor
  .select({
    method: cookingFailedCombinations.method,
    ingredientIds: cookingFailedCombinations.ingredientIds,
    createdAt: cookingFailedCombinations.createdAt,
  })
  .from(cookingFailedCombinations)
  .where(eq(cookingFailedCombinations.userId, userId))
  .orderBy(desc(cookingFailedCombinations.createdAt))
  .limit(100);
```

Map `createdAt` to epoch milliseconds and include the projection in GET and mutation responses.

- [ ] **Step 4: Run route tests and verify GREEN**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the API slice**

```bash
git add src/adventure/v2/cooking/clientTypes.ts src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts
git commit -m "feat: expose cooking research history"
```

### Task 2: Display records and block known duplicate failures

**Files:**
- Modify: `src/adventure/v2/cooking/CookingResearchPanel.tsx`
- Modify: `src/adventure/v2/cooking/CookingResearchPanel.test.tsx`

**Interfaces:**
- Consumes `CookingResponse.failedResearches`.
- Produces a client-only comparison key from `method` and sorted ingredient IDs without importing server-only recipe code.

- [ ] **Step 1: Write failing component tests**

Create a fixture containing:

```ts
failedResearches: [{
  method: "grill",
  ingredientIds: ["farm:wheat", "farm:milk"],
  createdAt: NOW,
}],
```

Assert that the notebook shows `굽기`, `밀 · 우유`, and that selecting wheat plus milk changes the action to the disabled `이미 실패한 조합` state. Click it and assert `mutate` was not called.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/adventure/v2/cooking/CookingResearchPanel.test.tsx`

Expected: FAIL because the notebook and duplicate precheck are absent.

- [ ] **Step 3: Implement the notebook and comparison key**

Use a local public-data key:

```ts
function researchAttemptKey(method: CookingMethod, ingredientIds: readonly CookingIngredientId[]) {
  return `${method}:${[...ingredientIds].sort().join("|")}`;
}
```

Build a `Set` from `failedResearches`, disable the button when the current selection matches, render a `role="status"` explanation, and list the latest records using `cookingIngredientName` and `COOKING_METHOD_NAMES`. Keep the empty state usable.

- [ ] **Step 4: Run component and cooking-panel tests and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking/CookingResearchPanel.test.tsx src/adventure/v2/CookingPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the UI slice**

```bash
git add src/adventure/v2/cooking/CookingResearchPanel.tsx src/adventure/v2/cooking/CookingResearchPanel.test.tsx
git commit -m "feat: add cooking research notebook"
```

### Task 3: Verify the complete notebook flow

**Files:**
- Verify all files changed by Tasks 1 and 2.

**Interfaces:**
- Consumes the API projection and research UI.
- Produces a locally committed, undeployed feature.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts src/adventure/v2/cooking/CookingResearchPanel.test.tsx src/adventure/v2/CookingPanel.test.tsx`

- [ ] **Step 2: Run static checks**

Run: `npx eslint src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts src/adventure/v2/cooking/clientTypes.ts src/adventure/v2/cooking/CookingResearchPanel.tsx src/adventure/v2/cooking/CookingResearchPanel.test.tsx`

Run: `npx tsc --noEmit`

- [ ] **Step 3: Run repository verification**

Run: `npm test`

Run: `npm run build`

- [ ] **Step 4: Review and commit any remaining scoped changes**

Confirm `git diff --check`, inspect the complete scoped diff for secret recipe leakage, and leave unrelated dangerous-fishing files untouched.
