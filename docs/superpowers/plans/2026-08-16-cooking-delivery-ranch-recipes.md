# Cooking Delivery and Ranch Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand cooking to six premium daily orders plus twenty low-reward standing deliveries, raise pork dishes to final-tier strength, and add six illustrated ranch recipes.

**Architecture:** Keep recipe, order rotation, save normalization, and reward arithmetic as pure functions in `cooking.ts`. Extend the existing transactional cooking route with a `standing_delivery` action so inventory removal, gold rewards, and the daily counter commit atomically, then render the new bulk-delivery controls beneath the existing order cards. Generate each recipe icon independently from existing cooking references, post-process it through the repository image pipeline, and register exact hashes in the asset-rights ledger.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router route handlers, Vitest, Tailwind CSS 4, Sharp image scripts, built-in image generation.

## Global Constraints

- Do not deploy to any environment.
- Preserve unrelated dirty-worktree files and commit only files named in each task.
- Read the relevant local Next.js 16 guides under `node_modules/next/dist/docs/` before modifying route-handler or client-component code.
- Scene-backed panels and cards must use opaque `SURFACE_CARD` or `SURFACE_INSET` surfaces.
- Cooking images must use identifier-matched filenames under `public/images/items/cooking/`.
- Standing deliveries pay no farm reputation and no cooking or mastery XP.
- Standing-delivery limits and rewards are computed on the server; client-supplied reward values are never accepted.
- Use one built-in image-generation call per distinct asset, then use chroma-key removal and the repository `items` optimization profile.

---

### Task 1: Cooking domain, recipes, and standing-delivery rewards

**Files:**
- Modify: `src/adventure/v2/cooking.ts`
- Test: `src/adventure/v2/cooking.test.ts`

**Interfaces:**
- Consumes: existing `CookingRecipe`, `CookingQuality`, `CookingFoodDefinition`, `CookingState`, `cookingOrders`, and `parseCookingState`.
- Produces: `COOKING_DAILY_ORDER_COUNT = 6`, `COOKING_STANDING_DELIVERY_DAILY_LIMIT = 20`, action `standing_delivery`, daily field `standingDeliveries: number`, and `cookingStandingDeliveryReward(recipe, quality, quantity)` returning `{ unitGold, totalGold, qualityBonusPct }`.

- [ ] **Step 1: Write failing recipe and pork-balance tests**

Update the tier-count expectation to:

```ts
expect(recipeCounts).toEqual(
  new Map([
    [1, 7],
    [10, 7],
    [20, 8],
    [35, 8],
    [50, 15],
  ]),
);
expect(COOKING_RECIPES).toHaveLength(45);
```

Add a literal table covering all six new recipe IDs and exact fields from the design spec, then assert each entry with `toMatchObject`. Update the three existing pork assertions to require these effects:

```ts
expect(COOKING_RECIPE_BY_ID.get("herb_roasted_pork")).toMatchObject({
  baseStatPct: { str: 20, vit: 10 },
});
expect(COOKING_RECIPE_BY_ID.get("crispy_pork_cutlet")).toMatchObject({
  baseStatPct: { str: 20, dex: 10 },
  specialStatPct: { str: 25, dex: 12 },
});
expect(COOKING_RECIPE_BY_ID.get("soy_pork_rice_bowl")).toMatchObject({
  baseStatPct: { vit: 20, str: 10 },
  specialStatPct: { vit: 25, str: 12 },
});
```

For every new recipe, assert that `cookingRecipeMatchesQuery()` finds its ranch ingredient name.

- [ ] **Step 2: Run the domain tests and confirm the recipe assertions fail**

Run: `npx vitest run src/adventure/v2/cooking.test.ts`

Expected: FAIL because the six IDs do not exist, the tier counts still total 39, and existing pork values are lower.

- [ ] **Step 3: Add the six recipes and pork effects**

Insert the six exact recipe definitions from the design spec into their matching level sections. Use these descriptions and icons:

```ts
recipe({ id: "egg_salad_sandwich", name: "달걀 샐러드 샌드위치", icon: "🥪", requiredLevel: 10, farmIngredients: { egg: 6, wheat: 8, tomato: 4 }, optionalRareItemId: "golden_wheat", xp: 30, baseStatPct: { vit: 7, luk: 3 }, specialStatPct: { vit: 10, luk: 5 }, description: "부드러운 달걀과 신선한 채소를 포갠 든든한 목장식 샌드위치입니다." }),
recipe({ id: "corn_milk_chowder", name: "옥수수 우유 차우더", icon: "🥣", requiredLevel: 20, farmIngredients: { milk: 6, corn: 8, onion: 4 }, optionalRareItemId: "sweet_corn", xp: 56, baseStatPct: { int: 8, vit: 4 }, specialStatPct: { int: 11, vit: 6 }, description: "달콤한 옥수수와 우유를 진하게 끓여 집중력과 활력을 채웁니다." }),
recipe({ id: "strawberry_milk_parfait", name: "딸기 우유 파르페", icon: "🍨", requiredLevel: 35, farmIngredients: { milk: 8, strawberry: 8, sugarcane: 6 }, optionalRareItemId: "white_strawberry", xp: 92, baseStatPct: { luk: 15, spi: 7 }, specialStatPct: { luk: 18, spi: 9 }, description: "차가운 우유 크림과 딸기를 층층이 담아 행운과 정신을 북돋웁니다." }),
recipe({ id: "spicy_pork_stew", name: "매콤한 돼지고기 스튜", icon: "🥘", requiredLevel: 50, farmIngredients: { pork: 8, tomato: 12, onion: 6, herb: 4 }, optionalRareItemId: "heirloom_tomato", xp: 145, baseStatPct: { int: 20, vit: 10 }, specialStatPct: { int: 25, vit: 12 }, description: "오래 비육한 돼지고기를 매콤하게 끓여 지능과 활력을 크게 높입니다." }),
recipe({ id: "royal_pork_pie", name: "왕실 돼지고기 파이", icon: "🥧", requiredLevel: 50, farmIngredients: { pork: 8, wheat: 10, egg: 4, onion: 4 }, optionalRareItemId: "golden_wheat", xp: 145, baseStatPct: { luk: 20, dex: 10 }, specialStatPct: { luk: 25, dex: 12 }, description: "진한 돼지고기 소를 황금빛 파이 껍질에 담아 행운과 민첩을 끌어올립니다." }),
recipe({ id: "ranch_grand_feast", name: "목장 대만찬", icon: "🍽️", requiredLevel: 50, farmIngredients: { pork: 8, egg: 8, milk: 8, wheat: 8 }, xp: 160, baseStatPct: { str: 10, vit: 10, dex: 10, int: 10, spi: 10, luk: 10 }, description: "돼지고기와 달걀, 우유를 한 상에 차린 목장의 최고급 균형 만찬입니다." }),
```

- [ ] **Step 4: Write failing order, state, and reward tests**

Import `COOKING_DAILY_ORDER_COUNT`, `COOKING_STANDING_DELIVERY_DAILY_LIMIT`, and `cookingStandingDeliveryReward`. Replace the three-order assertions with length six and uniqueness at every unlock tier. Capture the old deterministic first three with the pre-change formula and assert the new first three match it for each current tier.

Add parser coverage:

```ts
const sameDay = parseCookingState({
  daily: {
    dayKey: "1970-01-01",
    surplusTrades: 0,
    completedOrderIds: Array.from({ length: 9 }, (_, i) => `1970-01-01:${i}`),
    standingDeliveries: 99,
  },
}, 0);
expect(sameDay.daily.completedOrderIds).toHaveLength(6);
expect(sameDay.daily.standingDeliveries).toBe(20);
expect(parseCookingState({ daily: { dayKey: "old", standingDeliveries: 8 } }, 0).daily.standingDeliveries).toBe(0);
```

Add reward coverage:

```ts
const level50 = COOKING_RECIPE_BY_ID.get("flame_corn_stew")!;
expect(cookingStandingDeliveryReward(level50, "normal", 3)).toEqual({
  unitGold: 50_000,
  totalGold: 150_000,
  qualityBonusPct: 0,
});
expect(cookingStandingDeliveryReward(level50, "careful", 2).totalGold).toBe(120_000);
expect(cookingStandingDeliveryReward(level50, "masterpiece", 2).totalGold).toBe(150_000);
```

Also assert Lv.1/10/20/35 normal unit rewards are 10,000/20,000/30,000/40,000.

- [ ] **Step 5: Run the domain tests and confirm the new API assertions fail**

Run: `npx vitest run src/adventure/v2/cooking.test.ts`

Expected: FAIL because the order count, daily field, constants, and standing reward function have not been implemented.

- [ ] **Step 6: Implement unique six-order rotation and standing-delivery state/rewards**

Change the constants and types, add `standingDeliveries` to `emptyCookingState()` and `parseCookingState()`, and use a duplicate-skipping walk that preserves each old preferred slot when it is unique:

```ts
const used = new Set<string>();
return Array.from({ length: Math.min(COOKING_DAILY_ORDER_COUNT, pool.length) }, (_, index) => {
  let cursor = (start + index * 5) % pool.length;
  while (used.has(pool[cursor].id)) cursor = (cursor + 1) % pool.length;
  const selected = pool[cursor];
  used.add(selected.id);
  // build the existing tier reward and `${dayKey}:${index}` ID
});
```

Implement reward calculation with a required-level lookup and the existing 0/20/50 quality multipliers. Clamp quantity to a non-negative integer inside the pure function and return exact per-unit and total gold.

- [ ] **Step 7: Run domain tests and commit**

Run: `npx vitest run src/adventure/v2/cooking.test.ts`

Expected: PASS.

```bash
git add src/adventure/v2/cooking.ts src/adventure/v2/cooking.test.ts
git commit -m "feat: expand cooking delivery domain"
```

---

### Task 2: Transactional standing-delivery API

**Files:**
- Modify: `src/app/api/v2/cooking/route.ts`
- Test: `src/app/api/v2/cooking/route.test.ts`

**Interfaces:**
- Consumes: `CookingAction = "cook" | "order" | "standing_delivery"`, `COOKING_STANDING_DELIVERY_DAILY_LIMIT`, `cookingStandingDeliveryReward()`, `removeCookingFood()`.
- Produces: POST action `standing_delivery` with `{ recipeId, foodId, quantity }`; successful result fields `standingDeliveryRewardGold` and `quantity`; conflict codes `standing_delivery_limit` and `cooked_food_unavailable`.

- [ ] **Step 1: Read the local Next.js route-handler guide**

Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` completely before changing `route.ts`. Preserve the existing Web `Request`/`Response.json` conventions.

- [ ] **Step 2: Write failing success and no-progression tests**

Seed three careful Lv.50 foods, max cooking level, and an existing character gold balance. POST:

```ts
request({
  action: "standing_delivery",
  recipeId: "flame_corn_stew",
  foodId,
  quantity: 3,
})
```

Assert status 200, all three foods removed, gold increased by 180,000, `cooking.daily.standingDeliveries` becomes 3, farm reputation is unchanged, cooking XP is unchanged, `ordersCompleted` is unchanged, `earnedXp` is 0, and `standingDeliveryRewardGold` is 180,000.

- [ ] **Step 3: Write failing validation and atomicity tests**

Add separate tests for:

```ts
// 19 already delivered + quantity 2
expect(response.status).toBe(409);
expect(json.error).toBe("standing_delivery_limit");

// only one held + quantity 2
expect(response.status).toBe(409);
expect(json.error).toBe("cooked_food_unavailable");

// quantity 0 or fractional quantity
expect(response.status).toBe(400);
expect(json.error).toBe("bad_request");
```

For each rejected request, snapshot `character.v2`, `inventory.v2`, and `cooking.v1` before the call and assert deep equality afterward.

- [ ] **Step 4: Run the route tests and confirm they fail**

Run: `npx vitest run src/app/api/v2/cooking/route.test.ts`

Expected: FAIL because `standing_delivery` is rejected as a bad action.

- [ ] **Step 5: Implement the standing-delivery transaction branch**

Accept `standing_delivery` as an action. Require an integer quantity from 1 through 20 for this action; retain existing cook quantity clamping and force regular orders to quantity 1. Resolve and validate the food ID server-side, require it to match `recipeId`, and skip the cooking-level gate for standing delivery so marketplace-acquired food remains deliverable.

Before removing inventory, reject:

```ts
if (
  cooking.daily.standingDeliveries + quantity >
  COOKING_STANDING_DELIVERY_DAILY_LIMIT
) {
  throw new Error("standing_delivery_limit");
}
```

Remove exactly `quantity`, calculate the server reward, set `earnedXp = 0`, add only gold, and write:

```ts
daily: {
  ...cooking.daily,
  standingDeliveries:
    cooking.daily.standingDeliveries + quantity,
}
```

Do not add farm reputation, discovered recipes, cooking stats, mastery, or order IDs for standing deliveries. Return the updated cooking view so inventory and counters refresh without another GET.

- [ ] **Step 6: Run route and domain tests and commit**

Run: `npx vitest run src/adventure/v2/cooking.test.ts src/app/api/v2/cooking/route.test.ts`

Expected: PASS.

```bash
git add src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts
git commit -m "feat: add standing cooking deliveries"
```

---

### Task 3: Standing-delivery user interface

**Files:**
- Modify: `src/adventure/v2/CookingPanel.tsx`
- Test: `src/adventure/v2/CookingPanel.test.tsx`

**Interfaces:**
- Consumes: updated `CookingResponse`, `cookingFoodDefinition()`, `cookingStandingDeliveryReward()`, and the POST action from Task 2.
- Produces: exported `StandingCookingDeliveryBoard` rendering owned food variants and callback `(recipe, foodId, quantity) => void`.

- [ ] **Step 1: Read the local client-component and image guides**

Read these local guides completely before editing the component:

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`

- [ ] **Step 2: Write failing static-render UI tests**

Export `StandingCookingDeliveryBoard` and render it with one rare, extended masterpiece pork food held three times and `standingDeliveries: 4`. Assert the HTML contains:

```ts
expect(html).toContain("상시 납품 4/20");
expect(html).toContain("희귀 특선");
expect(html).toContain("장시간");
expect(html).toContain("보유 3개");
expect(html).toContain("개당 75,000 골드");
expect(html).toContain('value="1"');
expect(html).toContain("총 75,000 골드");
expect(html).toContain(SURFACE_INSET.split(" ")[0]);
```

Add an empty-inventory case containing `납품할 완성 요리가 없습니다.` and a completed-limit case with disabled delivery controls.

- [ ] **Step 3: Run the component tests and confirm they fail**

Run: `npx vitest run src/adventure/v2/CookingPanel.test.tsx`

Expected: FAIL because `StandingCookingDeliveryBoard` does not exist.

- [ ] **Step 4: Implement the board and POST flow**

Build the owned-food list from `Object.entries(data.cookingFoods)`, discard invalid or zero entries, and retain each exact food variant. Render the board below the existing six-order grid inside the opaque order section. Each row uses the recipe image, `food.name`, held count, per-unit reward, numeric input, total reward, and a delivery button.

Keep quantity state keyed by `food.id`, default to 1, and clamp edits to:

```ts
Math.max(
  1,
  Math.min(held, COOKING_STANDING_DELIVERY_DAILY_LIMIT - completed),
)
```

Extend the existing submit callback and response type for `standing_delivery`. Send `{ action, recipeId, foodId, quantity }` and display:

```text
<요리명> <품질> 상시 납품 <수량>개 완료 · 골드 +<총액>
```

Map `standing_delivery_limit` to `오늘의 상시 납품 한도를 모두 사용했습니다.` Leave the existing crop-surplus `daily_limit` message unchanged.

- [ ] **Step 5: Run component, route, and domain tests and commit**

Run: `npx vitest run src/adventure/v2/CookingPanel.test.tsx src/app/api/v2/cooking/route.test.ts src/adventure/v2/cooking.test.ts`

Expected: PASS.

```bash
git add src/adventure/v2/CookingPanel.tsx src/adventure/v2/CookingPanel.test.tsx
git commit -m "feat: show standing cooking deliveries"
```

---

### Task 4: Six identifier-matched cooking images and rights records

**Files:**
- Create: `public/images/items/cooking/egg_salad_sandwich.webp`
- Create: `public/images/items/cooking/corn_milk_chowder.webp`
- Create: `public/images/items/cooking/strawberry_milk_parfait.webp`
- Create: `public/images/items/cooking/spicy_pork_stew.webp`
- Create: `public/images/items/cooking/royal_pork_pie.webp`
- Create: `public/images/items/cooking/ranch_grand_feast.webp`
- Modify: `docs/asset-rights.json`
- Modify: `docs/asset-rights-audit.md`

**Interfaces:**
- Consumes: automatic recipe image paths `/images/items/cooking/${recipe.id}.webp` and repository `items` profile.
- Produces: six 256×256 WebP files with alpha and exact `operator-cleared-game-art` ledger hashes.

- [ ] **Step 1: Read image-generation prompting references and inspect style inputs**

Read completely:

- `/home/sea9401/.codex/skills/.system/imagegen/references/prompting.md`
- `/home/sea9401/.codex/skills/.system/imagegen/references/sample-prompts.md`

Inspect at original detail: `egg_fried_rice.webp`, `ranch_cream_gratin.webp`, `crispy_pork_cutlet.webp`, `milk_custard_pudding.webp`, `herb_roasted_pork.webp`, and `earth_grand_feast.webp`. Treat them as style references, not edit targets.

- [ ] **Step 2: Generate each distinct dish separately**

Use one built-in image-generation call per recipe. Each prompt uses this shared scaffold plus dish-specific plating:

```text
Use case: stylized-concept
Asset type: 256px fantasy RPG cooking inventory icon
Primary request: Create one clearly recognizable dish from the per-asset subject list below, using the attached existing cooking icons only as visual style references.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for removal
Style/medium: polished hand-painted fantasy game food icon with softly realistic texture, warm highlights, rich appetizing color, and the same rendering density as the references
Composition/framing: one complete plated dish centered in a square frame, three-quarter elevated view, strong readable silhouette, generous padding, no crop
Lighting/mood: warm tavern light, inviting and premium
Constraints: one dish only; flat uniform background; no cast shadow outside the plate; no text, border, person, hand, logo, or watermark; do not use #00ff00 in the food or serving ware
```

Dish-specific subjects:

- sandwich cut diagonally to reveal egg filling, tomato, and greens on a small wooden plate
- creamy golden corn-and-milk chowder with kernels and herb garnish in a rustic bowl
- layered strawberry-and-milk parfait in a short clear dessert cup with whole strawberries
- deep red spicy pork stew with visible pork cubes, tomato, onion, and herbs in a dark earthen pot
- golden lattice pork pie with one cut wedge revealing pork-and-egg filling on a royal red plate
- abundant ranch feast platter containing roast pork, eggs, creamy milk bread, and small side dishes as one cohesive plated meal

- [ ] **Step 3: Remove chroma key, optimize, and inspect**

Copy each selected generated source into `tmp/imagegen/`, then run the installed helper with `--auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`. Validate alpha channel, transparent corners, no green fringe, centered coverage, no text, and correct food identity. Retry a single asset only with a targeted correction if validation fails.

Place the alpha PNGs under `public/images/items/cooking/` with identifier-matched names, run `npm run optimize-images`, and confirm the script replaces them with 256×256 WebP files.

- [ ] **Step 4: Update rights evidence and exact hashes**

Set `reviewedAt` and the audit date to `2026-08-16`. Extend the `operator-cleared-game-art` rights basis and evidence with this implementation plan. Add a short audit paragraph stating that six ranch cooking icons were generated in the operator-controlled Codex/OpenAI session for this repository, then run:

```bash
npm run update-asset-rights
npm run check-asset-rights -- --strict
```

Expected: all six files are registered under `operator-cleared-game-art` and strict check passes.

- [ ] **Step 5: Run image-reference checks and commit**

Run: `npm run check-images`

Expected: PASS with no missing cooking references and no new orphan images.

```bash
git add public/images/items/cooking/egg_salad_sandwich.webp public/images/items/cooking/corn_milk_chowder.webp public/images/items/cooking/strawberry_milk_parfait.webp public/images/items/cooking/spicy_pork_stew.webp public/images/items/cooking/royal_pork_pie.webp public/images/items/cooking/ranch_grand_feast.webp docs/asset-rights.json docs/asset-rights-audit.md
git commit -m "feat: add ranch cooking artwork"
```

---

### Task 5: Final regression and repository checks

**Files:**
- Modify only files from Tasks 1–4 if verification exposes an in-scope defect.

**Interfaces:**
- Consumes: complete cooking delivery, recipe, UI, and asset changes.
- Produces: verified local commits without deployment.

- [ ] **Step 1: Run focused cooking tests**

Run:

```bash
npx vitest run src/adventure/v2/cooking.test.ts src/app/api/v2/cooking/route.test.ts src/adventure/v2/CookingPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run static checks on touched TypeScript files**

Run:

```bash
npx tsc --noEmit
npx eslint src/adventure/v2/cooking.ts src/adventure/v2/cooking.test.ts src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts src/adventure/v2/CookingPanel.tsx src/adventure/v2/CookingPanel.test.tsx
```

Expected: PASS. If the global type check reports unrelated dirty-worktree errors, rerun the focused tests and report the exact unrelated paths without modifying them.

- [ ] **Step 3: Run asset checks**

Run:

```bash
npm run check-images
npm run check-asset-rights -- --strict
```

Expected: PASS.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`

Expected: PASS. Classify any failure against `git diff` before changing code so pre-existing user work is not overwritten.

- [ ] **Step 5: Review the final diff and commit verification fixes if any**

Run:

```bash
git diff --check HEAD~4..HEAD
git status --short
```

Confirm only the plan/spec, cooking domain/API/UI, six cooking images, and asset-rights records were committed. If an in-scope verification fix was required, stage only the affected paths already listed in Tasks 1–4 and commit them with:

```bash
git commit -m "fix: verify cooking delivery expansion"
```

Do not deploy or alter maintenance mode.
