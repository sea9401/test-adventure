# Cooking Public Undiscovered Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players show only publicly discovered recipes that are not yet registered in their personal cooking codex.

**Architecture:** The cooking API annotates each already-public discovery with a personalized boolean instead of exposing the server-only recipe ID. A pure client helper filters those annotated entries and preserves recent-first ordering; the existing public-discovery selector activates it.

**Tech Stack:** Next.js 16.2.11 Client Components and route handlers, React 19, TypeScript, Vitest, Testing Library.

## Global Constraints

- Do not deploy or change production data.
- Preserve unrelated working-tree changes in battle and combat files.
- Do not expose recipe IDs, ingredients, methods, effects, or other undiscovered recipe secrets.
- Keep the existing opaque `SURFACE_CARD` and `SURFACE_INSET` surfaces.
- Use `도감 미등록` as the selector label and recent-first order for its results.

---

### Task 1: Annotate public discoveries with personal codex registration

**Files:**
- Modify: `src/app/api/v2/cooking/route.test.ts`
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/adventure/v2/cooking/clientTypes.ts`
- Modify: cooking response fixtures that construct `PublicCookingDiscovery`

**Interfaces:**
- Consumes: `CookingStateV2.discoveredRecipeIds` and each server-side first discovery's `recipeId`.
- Produces: `PublicCookingDiscovery.codexRegistered: boolean` without exposing `recipeId`.

- [x] **Step 1: Write the failing API test**

Update the GET fixture to include one recipe present in the current cooking state's `discoveredRecipeIds` and one absent recipe. Assert that their public objects contain `codexRegistered: true` and `codexRegistered: false` respectively, while retaining the assertion that neither object has `recipeId` or secret fields.

- [x] **Step 2: Run the API test and verify RED**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts`

Expected: FAIL because public discovery objects do not yet contain `codexRegistered`.

- [x] **Step 3: Implement the minimal API annotation**

Change the public discovery serializer to accept the current discovered recipe IDs, build a `Set`, and return:

```ts
{
  recipeName: recipe.name,
  imageSrc: recipe.imageSrc,
  actorName,
  discoveredAt: row.discoveredAt.getTime(),
  codexRegistered: discoveredIds.has(row.recipeId),
}
```

Add `codexRegistered: boolean` to `PublicCookingDiscovery` and update existing typed fixtures with explicit values.

- [x] **Step 4: Run the API test and verify GREEN**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts`

Expected: PASS and the response still omits recipe IDs and secret recipe fields.

### Task 2: Filter and render codex-unregistered public discoveries

**Files:**
- Modify: `src/adventure/v2/cooking/publicDiscoveries.test.ts`
- Modify: `src/adventure/v2/cooking/publicDiscoveries.ts`
- Modify: `src/adventure/v2/cooking/CookingPublicDiscoveryPanel.test.tsx`
- Modify: `src/adventure/v2/cooking/CookingPublicDiscoveryPanel.tsx`

**Interfaces:**
- Consumes: `PublicCookingDiscovery.codexRegistered` and `PublicCookingDiscoverySort`.
- Produces: the `unregistered` selector value, labeled `도감 미등록`, returning only `codexRegistered === false` entries in recent-first order.

- [x] **Step 1: Write failing pure-helper and component tests**

Add `codexRegistered` values to the discovery fixtures. Assert:

```ts
expect(
  publicCookingDiscoveries(discoveries, "unregistered").map(
    (entry) => entry.recipeName,
  ),
).toEqual(["국", "빵"]);
```

In the component test, select `도감 미등록`, assert registered cards disappear, unregistered cards remain in recent-first order, the displayed count changes, and pagination returns to page 1. Add a second assertion that all-registered input shows `공개 발견 요리는 모두 도감에 등록했습니다.`.

- [x] **Step 2: Run focused UI tests and verify RED**

Run: `npm test -- src/adventure/v2/cooking/publicDiscoveries.test.ts src/adventure/v2/cooking/CookingPublicDiscoveryPanel.test.tsx`

Expected: FAIL because `unregistered` is not a supported selection and no dedicated empty state exists.

- [x] **Step 3: Implement the minimal filter and UI option**

Extend `PublicCookingDiscoverySort` and its allowlist with `unregistered`. Before sorting, filter only entries where `codexRegistered` is false when that selection is active. Treat that selection's comparator as recent-first. Add:

```tsx
<option value="unregistered">도감 미등록</option>
```

Use the dedicated all-registered empty message only while `sort === "unregistered"`.

- [x] **Step 4: Run focused UI tests and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking/publicDiscoveries.test.ts src/adventure/v2/cooking/CookingPublicDiscoveryPanel.test.tsx`

Expected: PASS with filtering, ordering, count, pagination reset, and empty state covered.

- [x] **Step 5: Run scoped regression and static verification**

Run: `npm test -- src/adventure/v2/cooking src/adventure/v2/CookingPanel.test.tsx src/app/api/v2/cooking/route.test.ts`

Run: `npx eslint src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts src/adventure/v2/cooking/clientTypes.ts src/adventure/v2/cooking/publicDiscoveries.ts src/adventure/v2/cooking/publicDiscoveries.test.ts src/adventure/v2/cooking/CookingPublicDiscoveryPanel.tsx src/adventure/v2/cooking/CookingPublicDiscoveryPanel.test.tsx src/adventure/v2/CookingPanel.test.tsx`

Run: `npx tsc --noEmit`

Expected: all commands exit successfully without new errors.

- [x] **Step 6: Review and commit only scoped files**

Run `git diff --check`, inspect the cooking and documentation diffs, and confirm unrelated battle/combat changes remain unstaged. Commit the scoped files with message:

```bash
git commit -m "feat: filter unregistered public recipes"
```
