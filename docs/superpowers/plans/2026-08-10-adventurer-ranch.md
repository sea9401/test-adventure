# Adventurer Ranch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a four-pen chicken-and-cow ranch to the existing farm, with crafted shared feed, twelve-hour lazy production, shared farm progression and deliveries, four cooking recipes, and matching generated art.

**Architecture:** Keep persistence inside `farm.v2`, but isolate deterministic ranch rules in `ranch.ts`. Farm mutation routes settle production inside database transactions; feed crafting alone locks `skills.v2 → farm.v2 → life-workshop.v1` so farm ingredients, feed output, and crafting records change atomically. The farm UI receives ranch actions through `useFarm`, while the life workshop exposes the feed recipe through a dedicated farm endpoint.

**Tech Stack:** Next.js 16.2.11 App Router, React 19, TypeScript, Vitest, Drizzle transactions, Tailwind CSS, Phosphor icons, Next Image, Sharp/WebP asset pipeline

## Global Constraints

- Do not deploy or change maintenance mode.
- Do not create subagents; execute inline in the current workspace.
- Preserve unrelated changes in `src/adventure/data/v2/dungeon.test.ts`, `src/adventure/data/v2/monsterScale.ts`, `src/adventure/v2/V2LoadoutPanel.test.tsx`, and `src/adventure/v2/V2LoadoutPanel.tsx`.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before changing routes or client pages.
- Use server time only; do not add a cron, interval worker, or client-authored timestamp.
- Use `SURFACE_CARD`, `SURFACE_INSET`, and `SURFACE_ACCENT` for content surfaces; do not add translucent content cards or whole-card disabled opacity.
- Use the existing `items` image optimization profile and identifier-matched filenames.
- Implement behavior changes with failing regression tests first.

---

### Task 1: Deterministic Ranch Domain and Farm Persistence

**Files:**
- Create: `src/adventure/v2/ranch.ts`
- Create: `src/adventure/v2/ranch.test.ts`
- Modify: `src/adventure/v2/farm.ts`
- Modify: `src/adventure/v2/farm.test.ts`

**Interfaces:**
- Produces: `RANCH_ANIMALS`, `RANCH_PEN_DEFINITIONS`, `RANCH_FEED_RECIPE`, `RanchState`, `emptyRanchState(now)`, `parseRanchState(raw, now)`, `settleRanch(state, now)`, `addRanchFeed(state, penId, amount, now)`, `collectRanchProducts(state, now)`, and `unlockRanchPen(state, penId, farmingLevel, now)`.
- Produces farm wrappers: `feedFarmRanch`, `collectFarmRanch`, and `buyFarmRanchPen`.
- Extends: `FarmItemId` with `compound_feed | egg | milk` and `FarmState` with `ranch`.

- [ ] **Step 1: Write failing production and migration tests**

Add tests that fix the four definitions and boundary behavior:

```ts
const HOUR = 60 * 60 * 1000;

it("settles at exact cycle boundaries and stops when feed is exhausted", () => {
  let ranch = emptyRanchState(1_000);
  ranch = addRanchFeed(ranch, "coop-1", 6, 1_000);
  expect(settleRanch(ranch, 1_000 + 2 * HOUR - 1).pens["coop-1"].readyItems).toBe(0);
  const settled = settleRanch(ranch, 1_000 + 12 * HOUR);
  expect(settled.pens["coop-1"]).toMatchObject({
    feed: 0,
    progressMs: 0,
    readyItems: 12,
    readyCycles: 6,
  });
});

it("does not turn idle time after depletion into production after refill", () => {
  let ranch = addRanchFeed(emptyRanchState(1_000), "coop-1", 1, 1_000);
  ranch = settleRanch(ranch, 1_000 + 20 * HOUR);
  ranch = addRanchFeed(ranch, "coop-1", 1, 1_000 + 20 * HOUR);
  expect(settleRanch(ranch, 1_000 + 20 * HOUR + 2 * HOUR - 1).pens["coop-1"].readyItems).toBe(2);
  expect(settleRanch(ranch, 1_000 + 22 * HOUR).pens["coop-1"].readyItems).toBe(4);
});

it("migrates an old farm without retroactive ranch production", () => {
  const parsed = parseFarmState({ ...emptyFarmState(1_000), ranch: undefined }, 50_000);
  expect(parsed.ranch.pens["coop-1"]).toMatchObject({
    unlocked: true,
    feed: 0,
    readyItems: 0,
    lastSettledAt: 50_000,
  });
});
```

Also cover partial progress preservation, future timestamp clamping, negative and over-cap feed normalization, chicken capacity 6, cow capacity 2, collection outputs/XP, level-gated unlocks, reputation costs, and duplicate unlock rejection.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npm test -- src/adventure/v2/ranch.test.ts src/adventure/v2/farm.test.ts
```

Expected: FAIL because `ranch.ts`, the ranch state, and the new farm item IDs do not exist.

- [ ] **Step 3: Implement the ranch state machine**

Define the fixed pens as:

```ts
export const RANCH_ANIMALS = {
  chicken: { name: "닭", outputName: "달걀", imageSrc: "/images/items/farm/chicken.webp" },
  cow: { name: "소", outputName: "우유", imageSrc: "/images/items/farm/cow.webp" },
} as const;

export const RANCH_PEN_DEFINITIONS = [
  { id: "coop-1", animalId: "chicken", outputItemId: "egg", cycleMs: 2 * HOUR, outputAmount: 2, feedCapacity: 6, xpPerCycle: 2, requiredLevel: 1, costReputation: 0 },
  { id: "coop-2", animalId: "chicken", outputItemId: "egg", cycleMs: 2 * HOUR, outputAmount: 2, feedCapacity: 6, xpPerCycle: 2, requiredLevel: 10, costReputation: 30 },
  { id: "cowshed-1", animalId: "cow", outputItemId: "milk", cycleMs: 6 * HOUR, outputAmount: 3, feedCapacity: 2, xpPerCycle: 6, requiredLevel: 20, costReputation: 60 },
  { id: "cowshed-2", animalId: "cow", outputItemId: "milk", cycleMs: 6 * HOUR, outputAmount: 3, feedCapacity: 2, xpPerCycle: 6, requiredLevel: 35, costReputation: 120 },
] as const;

export const RANCH_FEED_RECIPE = {
  id: "compound_feed",
  name: "배합 사료",
  outputAmount: 5,
  costs: { wheat: 4, corn: 3, herb: 1 },
} as const;
```

Use `lastSettledAt` plus `progressMs`; when feed reaches zero, discard excess elapsed time and leave `progressMs` at zero. Collection returns `{ ranch, items: { egg, milk }, farmingXp, cycles }` without knowing `FarmState`.

- [ ] **Step 4: Integrate ranch state into farm parsing and mutations**

Extend `parseFarmState(raw, now = Date.now())`. Add farm wrappers that spend `compound_feed`, merge collected items into `FarmItemInventory`, increment `stats.farmingXp`, and spend `stats.reputationSpent` for unlocks. Add item definitions with these paths:

```ts
compound_feed: { name: "배합 사료", icon: "🌾", imageSrc: "/images/items/farm/compound_feed.webp" },
egg: { name: "달걀", icon: "🥚", imageSrc: "/images/items/farm/egg.webp" },
milk: { name: "우유", icon: "🥛", imageSrc: "/images/items/farm/milk.webp" },
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
npm test -- src/adventure/v2/ranch.test.ts src/adventure/v2/farm.test.ts
git diff --check
```

Expected: both files PASS and `git diff --check` prints nothing.

Commit only Task 1 files:

```bash
git add src/adventure/v2/ranch.ts src/adventure/v2/ranch.test.ts src/adventure/v2/farm.ts src/adventure/v2/farm.test.ts
git commit -m "feat: add ranch production domain"
```

---

### Task 2: Ranch Deliveries, Feed Crafting, and Transactional Routes

**Files:**
- Modify: `src/adventure/v2/farm.ts`
- Modify: `src/adventure/v2/farm.test.ts`
- Modify: `src/adventure/v2/lifeCrafting.ts`
- Modify: `src/adventure/v2/lifeCrafting.test.ts`
- Create: `src/app/api/v2/farm/ranch/feed/route.ts`
- Create: `src/app/api/v2/farm/ranch/collect/route.ts`
- Create: `src/app/api/v2/farm/ranch/upgrade/route.ts`
- Create: `src/app/api/v2/farm/feed-craft/route.ts`
- Modify: `src/app/api/v2/farm/route.ts`
- Create: `src/lib/server/ranchRoutes.test.ts`

**Interfaces:**
- Consumes: Task 1 ranch wrappers and `RANCH_FEED_RECIPE`.
- Produces endpoints accepting `{ penId, amount }`, `{}`, `{ penId }`, and `{ quantity }` respectively.
- Produces result shapes `ranchFeedResult`, `ranchCollectResult`, `ranchUpgradeResult`, and `feedCraftResult` alongside the refreshed farm payload.

- [ ] **Step 1: Add failing daily-delivery and route tests**

Update the farm delivery invariant so only crop deliveries must return two matching seeds, then assert the ranch choices:

```ts
expect(getFarmDeliveryRequests().find((request) => request.id === "bakery-eggs")).toMatchObject({
  requiredItemId: "egg",
  requiredQuantity: 8,
  rewardSeeds: {},
  rewardReputation: 3,
});
expect(getFarmDeliveryRequests().find((request) => request.id === "inn-milk")).toMatchObject({
  requiredItemId: "milk",
  requiredQuantity: 6,
  rewardSeeds: {},
  rewardReputation: 4,
});
```

In `ranchRoutes.test.ts`, mock saves like `farmHarvestRoute.test.ts` and assert:

- feeding spends exactly the requested feed and preserves partial progress;
- collecting a fully fed chicken after 12 hours grants 12 eggs and 12 farming XP once;
- a second collect returns `nothing_to_collect` without changing the save;
- upgrading `coop-2` spends 30 available reputation and rejects a repeat purchase;
- feed crafting with `quantity: 2` spends wheat 8, corn 6, herb 2 and grants feed 10;
- feed crafting without `씨앗 선별` or sufficient crops writes neither save;
- crafting records `compound_feed` in `craftCounts`, `discoveredRecipeIds`, and `totalCrafts`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/adventure/v2/farm.test.ts src/adventure/v2/lifeCrafting.test.ts src/lib/server/ranchRoutes.test.ts
```

Expected: FAIL because the delivery definitions and four routes do not exist.

- [ ] **Step 3: Add ranch delivery choices and external recipe persistence**

Add `bakery-eggs` and `inn-milk` to `getFarmDeliveryRequests()`. Keep them inside the existing `deliveries.claimedIds` and `FARM_DAILY_DELIVERY_LIMIT` path. Extend life-crafting parsing so `compound_feed` remains a recognized discovered recipe and craft-count key even though its output is stored in the farm.

- [ ] **Step 4: Implement route handlers with locked revalidation**

Read the Next.js route-handler guide listed in Global Constraints before editing. Each route must call `ensureUser`, validate body types, lock current saves, call pure domain functions, and `upsertSave` only after all validation succeeds. The three ranch action routes must load `skills.v2` before `farm.v2` and reject users who have not learned `FARM_CROP_REQUIRED_SKILL_ID` with `ranch_locked`.

For feed crafting, lock in this exact order:

```ts
const skills = parseV2SkillsState(await lockSaveForUpdate(tx, userId, "skills.v2", emptyV2SkillsState()));
const farm = parseFarmState(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)), now);
const workshop = parseLifeWorkshopState(await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}));
```

Apply `recipeMasteryStage` batch limits, require `FARM_CROP_REQUIRED_SKILL_ID`, spend multiplied farm costs, add `5 * quantity` feed, and update crafting records atomically. Return 409 for insufficient feed, crops, reputation, or collectable output; return 400 for invalid IDs, quantities, locked pens, levels, or batch limits.

- [ ] **Step 5: Return a lazy-settled ranch view from farm GET**

The GET route should derive `viewFarm = { ...farm, ranch: settleRanch(farm.ranch, now) }` without writing it. Mutation routes persist settlement inside their transactions.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npm test -- src/adventure/v2/farm.test.ts src/adventure/v2/lifeCrafting.test.ts src/lib/server/ranchRoutes.test.ts
git diff --check
```

Commit:

```bash
git add src/adventure/v2/farm.ts src/adventure/v2/farm.test.ts src/adventure/v2/lifeCrafting.ts src/adventure/v2/lifeCrafting.test.ts src/app/api/v2/farm/route.ts src/app/api/v2/farm/feed-craft/route.ts src/app/api/v2/farm/ranch src/lib/server/ranchRoutes.test.ts
git commit -m "feat: add transactional ranch routes"
```

---

### Task 3: Farm Client State and Ranch UI

**Files:**
- Modify: `src/adventure/v2/useFarm.ts`
- Create: `src/adventure/v2/FarmRanchPanel.tsx`
- Create: `src/adventure/v2/FarmRanchPanel.test.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.test.tsx`
- Modify: `src/app/(game)/town/farm/page.tsx`

**Interfaces:**
- Consumes: ranch definitions/state and Task 2 route result shapes.
- Produces hook actions `feedRanchPen`, `collectRanch`, `buyRanchPen`, and `craftFeed` plus busy flags.
- Produces `FarmRanchPanel` props for state, unlock status, current server-derived time, callbacks, and workshop navigation.

- [ ] **Step 1: Write failing rendered-output tests**

Create a settled mock farm and assert:

```ts
expect(html).toContain("목장");
expect(html).toContain("닭");
expect(html).toContain("달걀 12개");
expect(html).toContain("사료 0 / 6");
expect(html).toContain("모두 수확");
expect(html).toContain("생활 제작으로 이동");
expect(html).toContain("농사 Lv.20");
expect(html).toContain("농장 증표 60개");
expect(html).toContain("/images/items/farm/chicken.webp");
```

Update the farm shell test to expect five tabs, a ranch home shortcut, a ranch badge equal to ready pen count, and opaque shared surface classes.

- [ ] **Step 2: Run component tests and verify failure**

Run:

```bash
npm test -- src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx
```

Expected: FAIL because the ranch panel and hook actions do not exist.

- [ ] **Step 3: Extend `useFarm` without replaying requests**

Add independent busy state for feed, collect, upgrade, and feed crafting. Use the same response-to-state helper as existing actions: update `now`, `farm`, static lists, and notices from the successful response; never retry a POST automatically. Map exact server errors to Korean, including `ranch_locked`, `pen_locked`, `feed_capacity`, `not_enough_feed`, `nothing_to_collect`, `level_required`, `not_enough_reputation`, `already_unlocked`, and `not_enough_items`.

- [ ] **Step 4: Build the isolated ranch panel**

Render one card per fixed pen with `SURFACE_INSET`, animal art, output art, feed capacity, ready amount, next cycle countdown, and lock requirements. Use a bounded integer input and explicit `가득 채우기`; do not partially accept a request larger than remaining capacity. Show `모두 수확` once above the grid and disable it when all `readyItems` values are zero.

- [ ] **Step 5: Integrate the farm tab and home summary**

Add `"ranch"` to `FarmSectionKey`, place it between grow and delivery, expand the shortcut grid to four responsive columns, and count ready pens rather than ready items for badges. Add `onOpenLifeWorkshop` to `AdventurerFarmPanel`; in the farm page navigate it to `/town/life-workshop/craft`.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm test -- src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx
npx eslint src/adventure/v2/useFarm.ts src/adventure/v2/FarmRanchPanel.tsx src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx 'src/app/(game)/town/farm/page.tsx'
```

Commit:

```bash
git add src/adventure/v2/useFarm.ts src/adventure/v2/FarmRanchPanel.tsx src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx 'src/app/(game)/town/farm/page.tsx'
git commit -m "feat: add ranch management UI"
```

---

### Task 4: Life Workshop Feed Card and Direct Navigation

**Files:**
- Modify: `src/app/api/v2/life-workshop/route.ts`
- Modify: `src/adventure/v2/LifeWorkshopView.tsx`
- Modify: `src/adventure/v2/LifeWorkshopView.test.tsx`
- Modify: `src/app/(game)/town/life-workshop/page.tsx`
- Create: `src/app/(game)/town/life-workshop/craft/page.tsx`

**Interfaces:**
- Consumes: `RANCH_FEED_RECIPE`, farm inventory, crafting records, and `/api/v2/farm/feed-craft`.
- Produces: a `ranchCraftingRecipe` payload with `unlocked`, `craftCount`, `masteryStage`, `batchLimit`, `maxCraftable`, `ownedFeed`, and ingredient balances.
- Produces: `LifeWorkshopView({ onBack, initialTab?: WorkshopTab })`.

- [ ] **Step 1: Write failing payload and view tests**

Add a server payload test or exported-pure-view test that supplies wheat 8, corn 6, herb 2 and craft count 1, then expects two craftable batches and feed ownership. Extend the static render test:

```ts
expect(html).toContain("목장 용품");
expect(html).toContain("배합 사료");
expect(html).toContain("밀 4개");
expect(html).toContain("옥수수 3개");
expect(html).toContain("허브 1개");
expect(html).toContain("5개 완성");
```

Assert `initialTab="craft"` renders the life-crafting panel without a state-setting effect.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/adventure/v2/LifeWorkshopView.test.tsx src/lib/server/lifeWorkshopRoute.test.ts
```

Expected: FAIL because ranch crafting payload/UI and the direct route do not exist.

- [ ] **Step 3: Extend the read-only workshop payload**

Read `farm.v2` and `skills.v2` in `readWorkshopSnapshot`. Compute the recipe batch limit from its craft count, max batches from the three farm costs, unlock from `씨앗 선별`, and owned feed from farm inventory. Do not write or settle ranch production in this GET path.

- [ ] **Step 4: Add the feed card and specialized mutation call**

Extend the visible crafting kind UI with a `목장 용품` section. Its submit handler POSTs `{ quantity }` to `/api/v2/farm/feed-craft`; on success show `배합 사료 N개를 완성했습니다.` and refresh the workshop payload. Keep ordinary recipes on `/api/v2/life-workshop`.

- [ ] **Step 5: Add a static direct route**

Read the client-components guide listed in Global Constraints. Add `initialTab?: WorkshopTab` with a state initializer, keep the existing page defaulting to requests, and create `/town/life-workshop/craft` rendering `initialTab="craft"`. This avoids query parsing, hydration changes, and `useSearchParams` suspense requirements.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm test -- src/adventure/v2/LifeWorkshopView.test.tsx src/lib/server/lifeWorkshopRoute.test.ts
npx eslint src/app/api/v2/life-workshop/route.ts src/adventure/v2/LifeWorkshopView.tsx src/adventure/v2/LifeWorkshopView.test.tsx 'src/app/(game)/town/life-workshop/page.tsx' 'src/app/(game)/town/life-workshop/craft/page.tsx'
```

Commit:

```bash
git add src/app/api/v2/life-workshop/route.ts src/adventure/v2/LifeWorkshopView.tsx src/adventure/v2/LifeWorkshopView.test.tsx 'src/app/(game)/town/life-workshop/page.tsx' 'src/app/(game)/town/life-workshop/craft/page.tsx'
git commit -m "feat: expose ranch feed crafting"
```

---

### Task 5: Ranch Cooking Recipes

**Files:**
- Modify: `src/adventure/v2/cooking.ts`
- Modify: `src/adventure/v2/cooking.test.ts`
- Modify: `src/app/api/v2/cooking/route.test.ts`

**Interfaces:**
- Consumes: Task 1 `egg` and `milk` farm item IDs.
- Produces: four normal cooking recipes using the existing `farmIngredients` consumption path.

- [ ] **Step 1: Write failing recipe and route tests**

Assert the exact recipes and tier counts:

```ts
expect(COOKING_RECIPE_BY_ID.get("country_egg_bread")).toMatchObject({
  name: "시골식 달걀빵",
  requiredLevel: 1,
  farmIngredients: { wheat: 8, egg: 4 },
  xp: 13,
  baseStatPct: { str: 5 },
});
expect(COOKING_RECIPE_BY_ID.get("herb_omelet")).toMatchObject({
  requiredLevel: 10,
  farmIngredients: { egg: 6, tomato: 5, herb: 3 },
  xp: 29,
  baseStatPct: { dex: 7, vit: 3 },
});
expect(COOKING_RECIPE_BY_ID.get("milk_potato_soup")).toMatchObject({
  requiredLevel: 20,
  farmIngredients: { milk: 6, potato: 8, onion: 4 },
  xp: 54,
  baseStatPct: { vit: 8, spi: 4 },
});
expect(COOKING_RECIPE_BY_ID.get("ranch_cream_gratin")).toMatchObject({
  requiredLevel: 35,
  farmIngredients: { milk: 8, egg: 6, potato: 8 },
  xp: 90,
  baseStatPct: { int: 15, vit: 7 },
});
```

Update tier counts to `Lv.1=7`, `Lv.10=6`, `Lv.20=5`, `Lv.35=5`, `Lv.50=9`. Add a route test that cooks one egg recipe and one milk recipe and verifies exact farm-inventory subtraction.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/adventure/v2/cooking.test.ts src/app/api/v2/cooking/route.test.ts
```

Expected: FAIL because the four recipe IDs are absent and tier counts are unchanged.

- [ ] **Step 3: Add the recipes using the standard recipe helper**

Add the four entries at their level tiers. Do not add rare ingredient variants, custom consumption code, or new buff mechanics. Use these descriptions:

- 시골식 달걀빵: `갓 구운 빵과 달걀로 힘을 북돋우는 소박한 목장식입니다.`
- 허브 오믈렛: `부드러운 달걀과 향긋한 허브로 몸놀림과 활력을 돕습니다.`
- 우유 감자 수프: `우유와 감자를 천천히 끓여 활력과 정신을 따뜻하게 채웁니다.`
- 목장 크림 그라탱: `진한 우유와 달걀을 겹겹이 구워 집중력과 생존력을 높입니다.`

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm test -- src/adventure/v2/cooking.test.ts src/app/api/v2/cooking/route.test.ts
git diff --check
```

Commit:

```bash
git add src/adventure/v2/cooking.ts src/adventure/v2/cooking.test.ts src/app/api/v2/cooking/route.test.ts
git commit -m "feat: add ranch cooking recipes"
```

---

### Task 6: Matching Ranch and Cooking Artwork

**Files:**
- Create: `public/images/items/farm/chicken.webp`
- Create: `public/images/items/farm/cow.webp`
- Create: `public/images/items/farm/compound_feed.webp`
- Create: `public/images/items/farm/egg.webp`
- Create: `public/images/items/farm/milk.webp`
- Create: `public/images/items/cooking/country_egg_bread.webp`
- Create: `public/images/items/cooking/herb_omelet.webp`
- Create: `public/images/items/cooking/milk_potato_soup.webp`
- Create: `public/images/items/cooking/ranch_cream_gratin.webp`
- Modify: `docs/asset-rights.json`

**Interfaces:**
- Consumes: current farm references `wheat.webp`, `corn.webp` and cooking references `rustic_bread.webp`, `potato_stew.webp`.
- Produces: nine identifier-matched 256×256 WebP assets referenced by Tasks 1, 3, and 5.

- [ ] **Step 1: Read and apply the image-generation skill**

Use the repository `imagegen` skill. Inspect the four reference files at original detail before generation. Generate original raster assets without third-party characters, logos, text, borders, or watermarks.

- [ ] **Step 2: Generate five farm-style assets**

Use the farm references and this fixed art direction: `square 256px game inventory illustration, warm ivory lightly textured paper background, centered single subject, delicate hand-painted storybook rendering, soft grounded shadow, no text, no border`.

Generate distinct prompts for a friendly brown hen, a calm cream-and-brown dairy cow, a small tied sack/bowl of mixed grain feed, two clean cream-colored eggs, and a stoppered clear milk bottle. Save them first as identifier-matched PNGs under `public/images/items/farm/`.

- [ ] **Step 3: Generate four cooking-style assets**

Use the cooking references and this fixed art direction: `square 256px polished fantasy RPG food icon, transparent background, centered plated finished dish, warm appetizing light, softly realistic painterly 3D volume, no text, no border, no utensils cut off by frame`.

Generate the exact visible dishes: round egg bread, herb-and-tomato omelet, creamy milk potato soup in a wooden bowl, and browned cream gratin in a small baking dish. Save identifier-matched PNGs under `public/images/items/cooking/`.

- [ ] **Step 4: Optimize and register rights metadata**

Run:

```bash
npm run optimize-images
npm run check-images
npm run update-asset-rights
npm run check-asset-rights
```

Expected: PNG inputs are replaced by 256px WebP files, image references pass, and the asset ledger reports all deployed visual assets registered under `operator-cleared-game-art`. Before writing the ledger, extend that source's `rightsBasis` to record that the nine ranch and cooking rasters were generated for this repository on 2026-08-10 in the operator-controlled Codex/OpenAI image-generation session.

- [ ] **Step 5: Visually inspect all nine final WebP files and commit**

Check original detail for consistent backgrounds, transparent food edges, no accidental text, recognizable subjects, and no cropped primary object.

Commit:

```bash
git add public/images/items/farm/chicken.webp public/images/items/farm/cow.webp public/images/items/farm/compound_feed.webp public/images/items/farm/egg.webp public/images/items/farm/milk.webp public/images/items/cooking/country_egg_bread.webp public/images/items/cooking/herb_omelet.webp public/images/items/cooking/milk_potato_soup.webp public/images/items/cooking/ranch_cream_gratin.webp docs/asset-rights.json
git commit -m "art: add ranch and dairy recipe assets"
```

---

### Task 7: Regression Verification and Final Commit Audit

**Files:**
- Verify all files from Tasks 1–6.
- Do not modify the unrelated dirty files listed in Global Constraints.

**Interfaces:**
- Consumes: complete ranch feature.
- Produces: verified local commits with no deployment.

- [ ] **Step 1: Run focused ranch and cooking tests**

Run:

```bash
npm test -- src/adventure/v2/ranch.test.ts src/adventure/v2/farm.test.ts src/lib/server/ranchRoutes.test.ts src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx src/adventure/v2/LifeWorkshopView.test.tsx src/lib/server/lifeWorkshopRoute.test.ts src/adventure/v2/cooking.test.ts src/app/api/v2/cooking/route.test.ts
```

Expected: every focused test passes with no unhandled rejection.

- [ ] **Step 2: Run static and asset checks**

Run:

```bash
npx tsc --noEmit
npm run lint
npm run check-images
npm run check-asset-rights
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run the full test suite and production build**

Run:

```bash
npm test
npm run build
```

Expected: full Vitest suite and Next.js production build pass. The prebuild image optimizer has no PNG work remaining and image checks pass.

- [ ] **Step 4: Audit scope and commits**

Run:

```bash
git status --short
git log --oneline -8
git diff e39d6b74c..HEAD --check
```

Confirm only the four pre-existing unrelated files remain dirty, every ranch file is committed, and no deployment or maintenance command was run.
