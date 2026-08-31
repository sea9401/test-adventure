# Simple Cooking Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add twenty intuitive, explicitly-authored cooking discoveries without changing any existing recipe answer, and provide matching game-item artwork and accurate 120-recipe progress UI.

**Architecture:** Add a tiered simple-recipe block to the public catalog while preserving the pre-expansion index of all existing recipes for the procedural answer generator. Store the twenty new answers in the server's explicit-combination map, let valid current answers override historical failure rows, and filter those promoted answers out of the research notebook. Keep API shapes and all cooking production flows unchanged.

**Tech Stack:** TypeScript, React 19, Next.js 16.2, Vitest, Testing Library, Sharp image optimization, built-in image generation

## Global Constraints

- Do not deploy, push, or create a pull request.
- Add exactly twenty `hidden` recipes: twelve T1 recipes with two ingredients and eight T2 recipes with three ingredients.
- Preserve the IDs, effects, answers, first discoveries, and public behavior of all existing one hundred recipes.
- Preserve the existing milestones at 10, 25, 50, 75, and 100; do not add a 120 milestone.
- A valid current hidden or signature answer takes precedence over a historical failed-combination row.
- Filter combinations that are now valid discoverable answers out of GET and POST research notebook payloads.
- Generate one transparent 1:1 image per new recipe, save it under `public/images/items/cooking/<recipe-id>.png`, then use the existing optimizer to produce 256px WebP files and remove PNG originals.
- Do not add dependencies, database migrations, API response fields, or new cooking ingredients.

---

### Task 1: Add the public recipes while preserving legacy ordering inputs

**Files:**
- Modify: `src/adventure/v2/cooking/catalog.ts`
- Modify: `src/lib/server/cooking/recipes.test.ts`

**Interfaces:**
- Consumes: `RecipeRow`, `rowToRecipe`, existing `basic`, `hidden`, and `signature` arrays
- Produces: `SIMPLE_COOKING_RECIPE_IDS: readonly string[]`, `COOKING_LEGACY_RECIPE_INDEX_BY_ID: ReadonlyMap<string, number>`, and a 120-entry `COOKING_PUBLIC_RECIPES`

- [ ] **Step 1: Write failing public-catalog tests**

In `recipes.test.ts`, change the catalog requirement to 120 total, six basic, and 114 non-basic recipes. Add a literal expected table for the twenty IDs, names, fields, methods, and tiers:

```ts
const EXPECTED_SIMPLE_RECIPES = [
  ["fried_egg", "소금 간 계란후라이", "hearth", "fry", 1],
  ["boiled_egg", "소금 삶은 달걀", "pot", "boil", 1],
  ["grilled_potato", "소금 감자구이", "hearth", "grill", 1],
  ["buttered_corn", "버터 옥수수구이", "hearth", "grill", 1],
  ["simple_tomato_soup", "소박한 토마토 수프", "pot", "boil", 1],
  ["milk_bread", "부드러운 우유빵", "baking", "bake", 1],
  ["sugar_cookie", "바삭한 설탕 쿠키", "baking", "bake", 1],
  ["strawberry_jam", "달콤한 딸기잼", "baking", "boil", 1],
  ["campfire_fish", "모닥불 생선구이", "seafood", "grill", 1],
  ["simple_fish_soup", "소박한 생선국", "seafood", "boil", 1],
  ["strawberry_milk", "딸기 우유", "medicinal", "brew", 1],
  ["hot_cacao", "따뜻한 카카오", "medicinal", "brew", 1],
  ["tomato_egg_stir_fry", "토마토 달걀볶음", "hearth", "stir_fry", 2],
  ["potato_fries", "바삭한 감자튀김", "hearth", "fry", 2],
  ["herb_egg_soup", "허브 달걀국", "pot", "boil", 2],
  ["corn_cream_soup", "고소한 옥수수 수프", "pot", "boil", 2],
  ["cacao_cookie", "카카오 쿠키", "baking", "bake", 2],
  ["fish_fry", "바삭한 생선튀김", "seafood", "fry", 2],
  ["steamed_fish", "담백한 생선찜", "seafood", "steam", 2],
  ["herb_pickles", "새콤한 허브 절임", "medicinal", "ferment", 2],
] as const;
```

Assert each ID's public recipe matches the four public fields and tier, and assert `SIMPLE_COOKING_RECIPE_IDS` equals the listed ID order.

- [ ] **Step 2: Run the recipe test and verify RED**

Run: `npm test -- src/lib/server/cooking/recipes.test.ts`

Expected: FAIL because the catalog still has 100 recipes and the two new exports do not exist.

- [ ] **Step 3: Add tiered simple rows and a legacy index map**

Define a six-field `SimpleRecipeRow` tuple and add `SIMPLE_ROWS` with the exact twenty rows and icons from this table:

```ts
const SIMPLE_ROWS: readonly SimpleRecipeRow[] = [
  ["fried_egg", "소금 간 계란후라이", "hearth", "fry", "🍳", 1],
  ["boiled_egg", "소금 삶은 달걀", "pot", "boil", "🥚", 1],
  ["grilled_potato", "소금 감자구이", "hearth", "grill", "🥔", 1],
  ["buttered_corn", "버터 옥수수구이", "hearth", "grill", "🌽", 1],
  ["simple_tomato_soup", "소박한 토마토 수프", "pot", "boil", "🥣", 1],
  ["milk_bread", "부드러운 우유빵", "baking", "bake", "🍞", 1],
  ["sugar_cookie", "바삭한 설탕 쿠키", "baking", "bake", "🍪", 1],
  ["strawberry_jam", "달콤한 딸기잼", "baking", "boil", "🍓", 1],
  ["campfire_fish", "모닥불 생선구이", "seafood", "grill", "🐟", 1],
  ["simple_fish_soup", "소박한 생선국", "seafood", "boil", "🍲", 1],
  ["strawberry_milk", "딸기 우유", "medicinal", "brew", "🥛", 1],
  ["hot_cacao", "따뜻한 카카오", "medicinal", "brew", "☕", 1],
  ["tomato_egg_stir_fry", "토마토 달걀볶음", "hearth", "stir_fry", "🍳", 2],
  ["potato_fries", "바삭한 감자튀김", "hearth", "fry", "🍟", 2],
  ["herb_egg_soup", "허브 달걀국", "pot", "boil", "🍲", 2],
  ["corn_cream_soup", "고소한 옥수수 수프", "pot", "boil", "🥣", 2],
  ["cacao_cookie", "카카오 쿠키", "baking", "bake", "🍪", 2],
  ["fish_fry", "바삭한 생선튀김", "seafood", "fry", "🐟", 2],
  ["steamed_fish", "담백한 생선찜", "seafood", "steam", "🐟", 2],
  ["herb_pickles", "새콤한 허브 절임", "medicinal", "ferment", "🌿", 2],
];
```

Build `simple` by passing each row's first five fields and tier to `rowToRecipe(..., "hidden", index)`. Before changing public order, construct the legacy map from `[...basic, ...hidden, ...signature]`. Export simple IDs and publish `[...basic, ...simple, ...hidden, ...signature]`.

- [ ] **Step 4: Run the recipe test to observe the expected intermediate failure**

Run: `npm test -- src/lib/server/cooking/recipes.test.ts`

Expected: FAIL in server catalog validation because secret answers are not yet explicit and the validator still expects 100.

### Task 2: Add explicit answers and freeze all existing answers

**Files:**
- Modify: `src/lib/server/cooking/recipes.ts`
- Modify: `src/lib/server/cooking/recipes.test.ts`

**Interfaces:**
- Consumes: `COOKING_LEGACY_RECIPE_INDEX_BY_ID`, `SIMPLE_COOKING_RECIPE_IDS`, `canonicalCookingCombination`
- Produces: exact answers for all twenty new recipes and catalog validation relative to the public catalog length

- [ ] **Step 1: Add failing exact-answer and legacy-hash tests**

Add a literal table of method and ingredient IDs for all twenty recipes matching the design. For every row, assert the secret recipe tier, method, ingredient ID set, and `findSecretRecipe(method, reversedIngredients)?.id`.

Hash the existing recipes only:

```ts
const legacyAnswers = COOKING_SECRET_RECIPES
  .filter((recipe) => !SIMPLE_COOKING_RECIPE_IDS.includes(recipe.id))
  .map((recipe) => `${recipe.id}=${canonicalCookingCombination(
    recipe.method,
    recipe.ingredients.map((ingredient) => ingredient.id),
  )}`)
  .sort();

expect(
  createHash("sha256").update(legacyAnswers.join("\n")).digest("hex"),
).toBe("45a79d708249d9c2f82ae664a4bd72396ebff5dffc813f03c570a62003066962");
```

- [ ] **Step 2: Run the recipe test and verify RED**

Run: `npm test -- src/lib/server/cooking/recipes.test.ts`

Expected: FAIL because the twenty answers do not exist and inserting rows shifted procedural generation indices.

- [ ] **Step 3: Implement the explicit combinations**

Rename `BASIC_COMBINATIONS` to `EXPLICIT_COMBINATIONS` and add the exact mappings:

```ts
fried_egg: ["farm:egg", "pantry:salt"],
boiled_egg: ["farm:egg", "pantry:salt"],
grilled_potato: ["farm:potato", "pantry:salt"],
buttered_corn: ["farm:corn", "processed:butter"],
simple_tomato_soup: ["farm:tomato", "processed:broth"],
milk_bread: ["farm:wheat", "farm:milk"],
sugar_cookie: ["farm:wheat", "farm:sugarcane"],
strawberry_jam: ["farm:strawberry", "farm:sugarcane"],
campfire_fish: ["fishing:catch_common", "pantry:salt"],
simple_fish_soup: ["fishing:catch_common", "processed:broth"],
strawberry_milk: ["farm:strawberry", "farm:milk"],
hot_cacao: ["farm:cacao", "farm:milk"],
tomato_egg_stir_fry: ["farm:tomato", "farm:egg", "pantry:oil"],
potato_fries: ["farm:potato", "pantry:oil", "pantry:salt"],
herb_egg_soup: ["farm:egg", "farm:herb", "pantry:salt"],
corn_cream_soup: ["farm:corn", "farm:milk", "pantry:salt"],
cacao_cookie: ["farm:wheat", "farm:cacao", "farm:sugarcane"],
fish_fry: ["fishing:catch_common", "processed:flour", "pantry:oil"],
steamed_fish: ["fishing:catch_fresh", "farm:onion", "pantry:salt"],
herb_pickles: ["farm:herb", "pantry:vinegar", "pantry:salt"],
```

For procedural recipes, pass `COOKING_LEGACY_RECIPE_INDEX_BY_ID.get(recipe.id) ?? index` into `ingredientsForRecipe`. Replace every validator literal `100` with `COOKING_PUBLIC_RECIPES.length`.

- [ ] **Step 4: Run the recipe test and verify GREEN**

Run: `npm test -- src/lib/server/cooking/recipes.test.ts`

Expected: PASS with 120 unique IDs and answers and the unchanged legacy hash.

- [ ] **Step 5: Commit the catalog and answers**

```bash
git add src/adventure/v2/cooking/catalog.ts src/lib/server/cooking/recipes.ts src/lib/server/cooking/recipes.test.ts
git commit -m "feat: add twenty simple cooking recipes"
```

### Task 3: Promote new answers over historical failures

**Files:**
- Modify: `src/lib/server/cooking/research.test.ts`
- Modify: `src/lib/server/cooking/research.ts`
- Modify: `src/app/api/v2/cooking/route.test.ts`
- Modify: `src/app/api/v2/cooking/route.ts`

**Interfaces:**
- Consumes: `findSecretRecipe(method, ingredientIds)` and normalized failed research rows
- Produces: historical failure override for current non-basic answers and notebook payloads containing only current failures

- [ ] **Step 1: Write failing domain and route tests**

In `research.test.ts`, call `resolveCookingResearch` for `fried_egg` with `failedBefore: true`, Lv.10 state, and sufficient egg and salt. Require a successful discovery and ingredient consumption. Keep the existing non-answer duplicate test unchanged to prove invalid repeats are still blocked.

In the GET route test, add a valid row `{ method: "fry", ingredientIds: ["pantry:salt", "farm:egg"] }` to the failed-row result and require it to be absent from `json.failedResearches`, while the existing non-answer row remains.

- [ ] **Step 2: Run research and route tests and verify RED**

Run: `npm test -- src/lib/server/cooking/research.test.ts src/app/api/v2/cooking/route.test.ts`

Expected: FAIL because `failedBefore` is checked before recipe lookup and GET returns every structurally valid failed row.

- [ ] **Step 3: Prioritize valid recipes and filter notebook rows**

In `resolveCookingResearch`, look up the recipe before the `failedBefore` branch. Continue to treat missing and `basic` recipes as failures, but only throw `duplicate_combination` when `failedBefore` is true and the current combination is not a discoverable answer. Preserve `recipe_already_known` and `recipe_locked` checks before consuming ingredients.

Import `findSecretRecipe` into the cooking route and filter normalized failed rows:

```ts
const recipe = findSecretRecipe(normalized.method, normalized.ingredientIds);
return recipe && recipe.discovery !== "basic" ? [] : [normalized];
```

- [ ] **Step 4: Run research and route tests and verify GREEN**

Run: `npm test -- src/lib/server/cooking/research.test.ts src/app/api/v2/cooking/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit compatibility handling**

```bash
git add src/lib/server/cooking/research.ts src/lib/server/cooking/research.test.ts src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts
git commit -m "fix: promote new cooking answers over failures"
```

### Task 4: Make catalog totals dynamic in API and UI

**Files:**
- Modify: `src/app/api/v2/cooking/route.test.ts`
- Modify: `src/adventure/v2/cooking/CookingCodexPanel.test.tsx`
- Modify: `src/adventure/v2/cooking/CookingCodexPanel.tsx`

**Interfaces:**
- Consumes: `CookingResponse.recipes`, existing 12-item pagination
- Produces: API count assertion at 120 and UI progress text derived from `data.recipes.length`

- [ ] **Step 1: Write failing total and pagination tests**

Change the GET assertion to `expect(json.recipes).toHaveLength(120)` while keeping `knownRecipes` at six. Add a codex test with all public recipes that requires `개인 발견 6/120`, clicks the `10 페이지` button, and expects twelve articles with page 10 marked current.

- [ ] **Step 2: Run API and codex tests and verify RED**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts src/adventure/v2/cooking/CookingCodexPanel.test.tsx`

Expected: the API count passes after Tasks 1–2, but the UI progress assertion fails because it still renders `/100`.

- [ ] **Step 3: Derive the UI denominator from the response**

Replace the hard-coded denominator in `CookingCodexPanel.tsx`:

```tsx
개인 발견 {data.cooking.discoveredRecipeIds.length}/{data.recipes.length} · 기본 6종은 경험치용으로 자동 습득합니다.
```

- [ ] **Step 4: Run API and codex tests and verify GREEN**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts src/adventure/v2/cooking/CookingCodexPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit dynamic totals**

```bash
git add src/app/api/v2/cooking/route.test.ts src/adventure/v2/cooking/CookingCodexPanel.tsx src/adventure/v2/cooking/CookingCodexPanel.test.tsx
git commit -m "fix: show expanded cooking catalog total"
```

### Task 5: Generate and integrate twenty cooking images

**Files:**
- Modify: `src/lib/server/cooking/recipes.test.ts`
- Create then optimize: `public/images/items/cooking/{fried_egg,boiled_egg,grilled_potato,buttered_corn,simple_tomato_soup,milk_bread,sugar_cookie,strawberry_jam,campfire_fish,simple_fish_soup,strawberry_milk,hot_cacao,tomato_egg_stir_fry,potato_fries,herb_egg_soup,corn_cream_soup,cacao_cookie,fish_fry,steamed_fish,herb_pickles}.png`
- Produce: matching `.webp` files in the same directory

**Interfaces:**
- Consumes: style references `rustic_bread.webp`, `herb_omelet.webp`, `milk_custard_pudding.webp`, `legendary_sea_banquet.webp`
- Produces: twenty 256×256 transparent WebP assets referenced by the catalog template

- [ ] **Step 1: Add and run the failing asset-existence test**

In `recipes.test.ts`, resolve each `SIMPLE_COOKING_RECIPE_IDS` entry through `COOKING_SECRET_RECIPE_BY_ID` and assert that `existsSync(path.join(process.cwd(), "public", recipe.imageSrc))` is true.

Run: `npm test -- src/lib/server/cooking/recipes.test.ts`

Expected: FAIL listing the twenty absent `/images/items/cooking/<recipe-id>.webp` files. The general image checker cannot enumerate IDs hidden behind the catalog's template path, so this recipe-aware test is the missing-file authority.

- [ ] **Step 2: Generate one image per recipe with the built-in image tool**

Use all four reference images as style references for each call. Shared prompt:

```text
Use case: stylized-concept
Asset type: fantasy RPG cooking item icon
Primary request: create one polished game-item illustration of <SUBJECT>
Style/medium: match the supplied cooking icons—detailed hand-painted fantasy food illustration with clean readable shapes and warm natural color
Composition/framing: one centered dish or drink, three-quarter or slightly top-down view, square composition, generous transparent margin
Constraints: transparent background; only the named food and minimal plate/bowl/cup; no text, border, badge, logo, watermark, people, hands, utensils, scenery, or cast shadow outside the object; do not copy the reference subjects
```

Use these exact subjects in ID order: sunny-side-up fried egg lightly seasoned with visible salt; two peeled boiled egg halves with salt; roasted whole potato split open with salt; grilled corn coated with melted butter; simple red tomato soup in a rustic bowl; soft round milk bread; small crisp sugar cookies; strawberry jam in a small glass jar with strawberries; rustic campfire-grilled common fish on a plain plate; clear simple fish soup in a bowl; pink strawberry milk in a glass; warm cacao in a ceramic cup; tomato-and-egg stir-fry; golden potato fries; clear herb egg-drop soup; creamy corn soup; cacao cookies; golden battered fried fish fillet; steamed fresh fish with onion slices; herb pickles in a small ceramic dish.

Save each accepted generated PNG to its exact project path. Inspect every output before accepting it; regenerate only the mismatched subject.

- [ ] **Step 3: Optimize the assets**

Run: `npm run optimize-images`

Expected: twenty PNG files converted to 256px WebP at quality 85 and the PNG originals removed.

- [ ] **Step 4: Verify image dimensions and references**

Run: `npm test -- src/lib/server/cooking/recipes.test.ts`

Expected: PASS with all twenty recipe-aware asset checks.

Run: `npm run check-images`

Expected: PASS with no missing recipe image and no new orphan image.

Run a Sharp metadata check over the twenty files and require `width <= 256`, `height <= 256`, `format === "webp"`, and `hasAlpha === true` for every image.

- [ ] **Step 5: Commit the artwork**

```bash
git add src/lib/server/cooking/recipes.test.ts public/images/items/cooking
git commit -m "feat: add simple cooking recipe artwork"
```

### Task 6: Run full regression and production verification

**Files:**
- Verify only; modify files only when a check reveals an in-scope regression.

**Interfaces:**
- Consumes: Tasks 1–5
- Produces: a clean, committed local branch with no deployment

- [ ] **Step 1: Run focused cooking tests**

Run: `npm test -- src/lib/server/cooking/recipes.test.ts src/lib/server/cooking/research.test.ts src/app/api/v2/cooking/route.test.ts src/adventure/v2/cooking/CookingCodexPanel.test.tsx src/adventure/v2/cooking/CookingResearchPanel.test.tsx src/adventure/v2/cooking/state.test.ts src/adventure/v2/cooking/food.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the complete suite**

Run: `npm test`

Expected: PASS with no new failures.

- [ ] **Step 3: Run static checks**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

- [ ] **Step 4: Run asset and build checks**

Run: `npm run check-images`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0, including image optimization and all 120 cooking image references.

- [ ] **Step 5: Inspect final repository state**

Run: `git diff --check && git status --short && git log -7 --oneline`

Expected: no uncommitted changes and the implementation retained on the current branch. Do not deploy, push, or create a pull request.
