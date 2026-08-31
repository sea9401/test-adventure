# Public Cooking Discoveries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sortable `공개 발견` kitchen tab that lists only server-first-discovered dishes using image, dish name, and first discoverer.

**Architecture:** Reuse the existing `/api/v2/cooking` `recipes` and `firstDiscoveries` fields. A pure client helper narrows those inputs into safe public card models and owns stable sorting; a focused panel owns sorting UI and pagination; `CookingPanel` only adds the tab and routes its existing response into the panel.

**Tech Stack:** TypeScript, React 19, Next.js 16 `Image`, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Show only recipes with a server first-discovery record; do not expose undiscovered silhouettes or counts.
- Cards show only image, recipe name, and first discoverer name.
- Do not display ingredients, cooking method, effect, tier, required level, or discovery time.
- Offer `recent`, `oldest`, `recipe_name`, and `actor_name`; default invalid values to `recent`.
- Paginate at 20 cards; use one column on mobile and two columns on wide screens.
- Do not add an API, database table, profile link, search, filter, or feed-rule change.
- Use `SURFACE_CARD`/`SURFACE_INSET` for opaque content surfaces and make the six-item kitchen tab bar horizontally scrollable.
- Do not deploy.

---

### Task 1: Safe Public Discovery Model and Sorting

**Files:**
- Create: `src/adventure/v2/cooking/publicDiscoveries.ts`
- Create: `src/adventure/v2/cooking/publicDiscoveries.test.ts`

**Interfaces:**
- Consumes: `CookingRecipePublic` from `cooking/types.ts` and `CookingFirstDiscoveryView` from `cooking/clientTypes.ts`.
- Produces: `PublicCookingDiscoverySort`, `PublicCookingDiscovery`, and `publicCookingDiscoveries(recipes, firstDiscoveries, sort)`.

- [ ] **Step 1: Write the failing model tests**

Create literal recipes and discovery rows. Assert that an unknown recipe ID is removed, output objects contain exactly `recipeId`, `recipeName`, `imageSrc`, `actorName`, and `discoveredAt`, and all sort modes return the expected literal ID sequence.

```ts
const recipes = [
  { id: "r1", name: "나물", imageSrc: "/r1.webp" },
  { id: "r2", name: "국", imageSrc: "/r2.webp" },
  { id: "r3", name: "빵", imageSrc: "/r3.webp" },
];
const discoveries = [
  { recipeId: "r1", actorName: "하린", discoveredAt: 200 },
  { recipeId: "r2", actorName: "가람", discoveredAt: 300 },
  { recipeId: "r3", actorName: "하린", discoveredAt: 100 },
  { recipeId: "missing", actorName: "누락", discoveredAt: 400 },
];

expect(publicCookingDiscoveries(recipes, discoveries, "recent").map((v) => v.recipeId))
  .toEqual(["r2", "r1", "r3"]);
expect(publicCookingDiscoveries(recipes, discoveries, "oldest").map((v) => v.recipeId))
  .toEqual(["r3", "r1", "r2"]);
expect(publicCookingDiscoveries(recipes, discoveries, "recipe_name").map((v) => v.recipeId))
  .toEqual(["r2", "r1", "r3"]);
expect(publicCookingDiscoveries(recipes, discoveries, "actor_name").map((v) => v.recipeId))
  .toEqual(["r2", "r1", "r3"]);
expect(publicCookingDiscoveries(recipes, discoveries, "invalid").map((v) => v.recipeId))
  .toEqual(["r2", "r1", "r3"]);
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/adventure/v2/cooking/publicDiscoveries.test.ts`

Expected: FAIL because `publicDiscoveries.ts` and its exports do not exist.

- [ ] **Step 3: Implement the narrow model and stable sorting**

```ts
export type PublicCookingDiscoverySort =
  | "recent"
  | "oldest"
  | "recipe_name"
  | "actor_name";

export type PublicCookingDiscovery = {
  recipeId: string;
  recipeName: string;
  imageSrc: string;
  actorName: string;
  discoveredAt: number;
};

export function publicCookingDiscoveries(
  recipes: readonly Pick<CookingRecipePublic, "id" | "name" | "imageSrc">[],
  firstDiscoveries: readonly Pick<CookingFirstDiscoveryView, "recipeId" | "actorName" | "discoveredAt">[],
  sort: unknown = "recent",
): PublicCookingDiscovery[];
```

Build a recipe map, flat-map only matching discovery rows, normalize unknown sort values to `recent`, and sort a copied array. Use `localeCompare(..., "ko-KR")`; after the primary comparator, compare recipe name and then recipe ID for deterministic ties.

- [ ] **Step 4: Run the model tests and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking/publicDiscoveries.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the model**

```bash
git add src/adventure/v2/cooking/publicDiscoveries.ts src/adventure/v2/cooking/publicDiscoveries.test.ts
git commit -m "feat: model public cooking discoveries"
```

### Task 2: Public Discovery Panel

**Files:**
- Create: `src/adventure/v2/cooking/CookingPublicDiscoveryPanel.tsx`
- Create: `src/adventure/v2/cooking/CookingPublicDiscoveryPanel.test.tsx`

**Interfaces:**
- Consumes: `recipes: CookingResponse["recipes"]`, `firstDiscoveries: CookingResponse["firstDiscoveries"]`, and Task 1's `publicCookingDiscoveries`.
- Produces: `CookingPublicDiscoveryPanel({ recipes, firstDiscoveries })`.

- [ ] **Step 1: Write failing panel tests**

Use Testing Library with 21 literal recipe/discovery pairs. Assert:

```tsx
render(<CookingPublicDiscoveryPanel recipes={recipes} firstDiscoveries={discoveries} />);
expect(screen.getByRole("heading", { name: "공개 발견 요리" })).toBeTruthy();
expect(screen.getByText("공개된 요리 21개")).toBeTruthy();
expect(screen.getAllByRole("article")).toHaveLength(20);
expect(screen.getByText("최초 발견자: 발견자 21")).toBeTruthy();
expect(screen.queryByText("비밀 재료")).toBeNull();
fireEvent.click(screen.getByRole("button", { name: "2 페이지" }));
expect(screen.getAllByRole("article")).toHaveLength(1);
```

Add a second test with no discoveries for `아직 공개된 요리가 없습니다.`. Add a third test that moves to page 2, changes `공개 발견 정렬` to `recipe_name`, and asserts page 1 is active again.

- [ ] **Step 2: Run the panel tests and verify RED**

Run: `npm test -- src/adventure/v2/cooking/CookingPublicDiscoveryPanel.test.tsx`

Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Implement the panel**

Use local `sort` state with a default of `recent`, derive cards with `useMemo`, and call `usePagination(cards, 20, sort)` so sort changes reset the page. Render a `select` with four Korean labels, `Image` at 72×72, opaque `SURFACE_CARD`/`SURFACE_INSET` wrappers, responsive `grid gap-3 lg:grid-cols-2`, and existing `Pagination`.

The component accepts only `recipes` and `firstDiscoveries`; it must not accept `knownRecipes`, `farmItems`, or any other secret/detail source.

- [ ] **Step 4: Run panel tests and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking/CookingPublicDiscoveryPanel.test.tsx src/adventure/v2/cooking/publicDiscoveries.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the panel**

```bash
git add src/adventure/v2/cooking/CookingPublicDiscoveryPanel.tsx src/adventure/v2/cooking/CookingPublicDiscoveryPanel.test.tsx
git commit -m "feat: add public cooking discovery panel"
```

### Task 3: Kitchen Integration and Manual

**Files:**
- Modify: `src/adventure/v2/CookingPanel.tsx`
- Modify: `src/adventure/v2/CookingPanel.test.tsx`
- Modify: `src/app/manual/content/town.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: Task 2's `CookingPublicDiscoveryPanel`.
- Produces: a selectable `public` kitchen section labeled `공개 발견`.

- [ ] **Step 1: Write failing integration and manual tests**

Extend the `CookingPanel` fixture with one `firstDiscoveries` row. Add `public` to the render helper call and assert that the resulting markup contains the public recipe name and discoverer but not `비밀 재료`, `T1`, or `Lv 1`. Update the tab-label assertion to include `공개 발견`.

In `current-content.test.tsx`, assert that the town manual mentions that the public-discovery tab shows image, name, and first discoverer without recipe ingredients.

- [ ] **Step 2: Run integration tests and verify RED**

Run: `npm test -- src/adventure/v2/CookingPanel.test.tsx src/app/manual/current-content.test.tsx`

Expected: FAIL because `public` is not a valid/handled section and the manual copy is absent.

- [ ] **Step 3: Integrate the tab and panel**

In `CookingPanel.tsx`:

```ts
type CookingSection =
  | "research"
  | "codex"
  | "public"
  | "specialty"
  | "delivery"
  | "processing";
```

Import `CookingPublicDiscoveryPanel`, add `{ key: "public", label: "공개 발견" }`, set `scrollable` on the six-tab `TabBar`, and render:

```tsx
{section === "public" ? (
  <CookingPublicDiscoveryPanel
    recipes={data.recipes}
    firstDiscoveries={data.firstDiscoveries}
  />
) : null}
```

Update the town manual's kitchen paragraph to explain that the public tab exposes only image, dish name, and first discoverer; ingredients remain private until personally discovered.

- [ ] **Step 4: Run integration and cooking regression tests**

Run: `npm test -- src/adventure/v2/CookingPanel.test.tsx src/adventure/v2/cooking/CookingPublicDiscoveryPanel.test.tsx src/adventure/v2/cooking/publicDiscoveries.test.ts src/adventure/v2/cooking/CookingCodexPanel.test.tsx src/app/manual/current-content.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run static and project verification**

Run:

```bash
npx eslint src/adventure/v2/CookingPanel.tsx src/adventure/v2/CookingPanel.test.tsx src/adventure/v2/cooking/CookingPublicDiscoveryPanel.tsx src/adventure/v2/cooking/CookingPublicDiscoveryPanel.test.tsx src/adventure/v2/cooking/publicDiscoveries.ts src/adventure/v2/cooking/publicDiscoveries.test.ts src/app/manual/content/town.tsx src/app/manual/current-content.test.tsx
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npm run check-images
npm test
env NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

Expected: all commands exit 0; the full test summary has zero failures; the production build compiles and generates pages successfully.

- [ ] **Step 6: Commit integration**

```bash
git add src/adventure/v2/CookingPanel.tsx src/adventure/v2/CookingPanel.test.tsx src/app/manual/content/town.tsx src/app/manual/current-content.test.tsx
git commit -m "feat: expose public cooking discoveries"
```
