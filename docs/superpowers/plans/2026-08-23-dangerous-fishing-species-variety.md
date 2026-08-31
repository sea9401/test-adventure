# Dangerous Fishing Species Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand dangerous fishing to six fish per zone and make depth and bait visibly affect the shared legacy/realtime encounter selection.

**Architecture:** Keep `DangerousFish.depthId` as the preferred habitat instead of a hard filter. A single weighted selector in `dangerousFishingService.ts` combines spawn weight, depth affinity, behavior attraction, and bait rarity targets; legacy and realtime starts both call it. UI copy helpers expose the same bait catalog values without duplicating percentages.

**Tech Stack:** TypeScript, React 19 client components, Next.js `Image`, Vitest, Sharp image optimization, built-in image generation.

## Global Constraints

- Provide exactly 18 dangerous fish: six per zone and two per preferred depth.
- Depth affinity multipliers are exactly 1, 0.22, and 0.05 for zero, one, and two depth steps.
- Bait rarity weight bonuses are exactly 25%, 40%, 65%, and 100% for reef, blood, luminous, and abyss bait.
- Preserve every existing realtime bait combat effect and all existing fish/save/material IDs.
- New fish images use ID-matching filenames under `public/images/fish/` and end as optimized WebP files.
- Do not deploy or change maintenance mode.

---

### Task 1: Expand the fish and bait catalogs

**Files:**
- Modify: `src/adventure/data/v2/dangerousFishing.ts`
- Modify: `src/adventure/data/v2/dangerousFishing.test.ts`

**Interfaces:**
- Produces: nine new `DangerousFishId` values and `DangerousBait.targetRarities: readonly DangerousFishRarity[]`.
- Preserves: `DangerousFish.depthId` as the preferred habitat and `rarityBonus` as a decimal weight bonus.

- [ ] **Step 1: Write the failing catalog tests**

Assert 18 total fish, six per zone, two per preferred depth, ID-matching image paths, unique material IDs, and literal bait target rarity/bonus pairs.

- [ ] **Step 2: Run the catalog test and verify RED**

Run: `npm test -- --run src/adventure/data/v2/dangerousFishing.test.ts`

Expected: FAIL because only nine fish exist and baits have no `targetRarities`.

- [ ] **Step 3: Add the new types and catalog entries**

Add `targetRarities` to `DangerousBait`, the nine IDs from the design, and balanced stats that continue the existing zone progression. Set bait rarity bonuses to `0.25`, `0.4`, `0.65`, and `1` with target rarities `[common, rare]`, `[rare, epic]`, `[epic, legendary]`, and `[legendary]` respectively.

- [ ] **Step 4: Run the catalog test and verify GREEN**

Run: `npm test -- --run src/adventure/data/v2/dangerousFishing.test.ts`

Expected: PASS.

### Task 2: Share depth-and-bait weighted fish selection

**Files:**
- Modify: `src/lib/server/dangerousFishingService.ts`
- Modify: `src/lib/server/dangerousFishingRealtimeService.ts`
- Modify: `src/lib/server/dangerousFishingRoute.test.ts`

**Interfaces:**
- Produces: `pickFish(zoneId, depthId, baitId, random): DangerousFish` as the only weighted selector.
- Removes: `pickRealtimeFish`; realtime start calls `pickFish` with `args.baitId`.

- [ ] **Step 1: Write failing selector tests**

Use literal fixed-roll cases that prove same-depth candidates are considered first, off-depth candidates remain reachable, abyss bait doubles only legendary candidate rarity weight, and a nonmatching bait does not receive the rarity multiplier.

- [ ] **Step 2: Run the selector tests and verify RED**

Run: `npm test -- --run src/lib/server/dangerousFishingRoute.test.ts`

Expected: FAIL because realtime selection ignores bait and filters candidates to an exact depth.

- [ ] **Step 3: Implement the shared selector**

Map depth IDs to indexes `surface=0`, `midwater=1`, `deep=2`; multiply each zone candidate by affinity `[1, 0.22, 0.05]`, `1.5` for any matching target behavior, and `1 + rarityBonus` only when `targetRarities` includes the fish rarity. Sort by depth distance before the stable weighted roll so existing `random=0` fixtures retain the preferred-depth first candidate.

- [ ] **Step 4: Connect realtime start and verify GREEN**

Pass `args.baitId` from `startRealtimeEncounterInTx`, update route expectations, and run the route test until it passes.

### Task 3: Explain attraction and combat effects in UI and manual

**Files:**
- Create: `src/adventure/v2/dangerousFishingBaitCopy.ts`
- Modify: `src/adventure/v2/DangerousFishingPreparationPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingShopSection.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingShopSection.test.tsx`
- Modify: `src/app/manual/content/pastimes.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Produces: `dangerousBaitAttractionCopy(bait)` and `dangerousBaitRealtimeEffectCopy(bait)`.
- Consumes: `DangerousBait.targetRarities`, `rarityBonus`, and `realtimeEffect`.

- [ ] **Step 1: Write failing render tests**

Assert preparation and shop markup includes `전설 어종 출현 가중치 +100%`, the abyss bait combat effect, and a note that other preferred depths can still appear.

- [ ] **Step 2: Run UI/manual tests and verify RED**

Run: `npm test -- --run src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx src/app/manual/current-content.test.tsx`

Expected: FAIL because preparation cards show no bait effects and the old text claims only a generic rarity bonus.

- [ ] **Step 3: Implement focused copy helpers and render them**

Move the existing realtime effect formatter into the new file, add Korean rarity labels, display attraction plus encounter effects on preparation and shop cards, and update the manual with the 100/22/5 depth affinity and bait table.

- [ ] **Step 4: Run UI/manual tests and verify GREEN**

Run the command from Step 2 and expect all selected files to pass.

### Task 4: Generate and integrate nine fish assets

**Files:**
- Create: `public/images/fish/glassscale_herring.webp`
- Create: `public/images/fish/coralhorn_snapper.webp`
- Create: `public/images/fish/trenchshell_sturgeon.webp`
- Create: `public/images/fish/gale_needlefish.webp`
- Create: `public/images/fish/stormbell_sunfish.webp`
- Create: `public/images/fish/cyclone_marlin.webp`
- Create: `public/images/fish/ghostlight_jellyfish.webp`
- Create: `public/images/fish/nightglass_shark.webp`
- Create: `public/images/fish/starless_leviathan.webp`

**Interfaces:**
- Consumes: the exact `imageSrc` paths added in Task 1.
- Produces: transparent, ID-matching WebP assets accepted by `check-images`.

- [ ] **Step 1: Inspect representative existing fish assets**

View one existing fish from each zone and record the shared full-body side-view, transparent-background, high-contrast rendering constraints.

- [ ] **Step 2: Generate each distinct fish asset**

Use one built-in image generation call per fish with a distinct species prompt, no text, no border, no watermark, transparent background, and consistent fantasy game illustration treatment.

- [ ] **Step 3: Move PNG outputs into the fish folder and optimize**

Run: `npm run optimize-images`

Expected: nine PNG inputs become nine WebP assets and the PNG files are removed.

- [ ] **Step 4: Inspect the final WebP files and validate references**

Run: `npm run check-images -- --strict`

Expected: exit 0 with no missing or orphaned images.

### Task 5: Regression verification and commit

**Files:**
- Modify only files listed in Tasks 1-4 plus the spec and this plan.
- Preserve unrelated `src/adventure/v2/cooking/CookingCodexPanel*` worktree changes.

**Interfaces:**
- Produces: a committed, locally verified feature with no deployment.

- [ ] **Step 1: Run focused dangerous fishing tests**

Run: `npm test -- --run src/adventure/data/v2/dangerousFishing.test.ts src/lib/server/dangerousFishingRoute.test.ts src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx src/app/manual/current-content.test.tsx`

- [ ] **Step 2: Run static and image verification**

Run: `npx tsc --noEmit`

Run: `npm run check-images -- --strict`

- [ ] **Step 3: Review the scoped diff**

Run: `git diff --check` and inspect `git status --short`; confirm the cooking files remain unstaged.

- [ ] **Step 4: Commit the requested feature**

Stage only the spec, plan, dangerous fishing source/tests/manual files, and nine fish images. Commit with `feat: diversify dangerous fishing catches`.
