# Ranch Recipe Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six balanced cooking recipes that consume pork, eggs, and milk, each with an identifier-matched game icon in the existing visual style.

**Architecture:** Extend the static `COOKING_RECIPES` catalog; no save schema or API changes are needed. The existing recipe helper derives image paths, ingredient search reads `FARM_ITEMS`, and cooking/codex/order systems consume the catalog automatically. Generate one bitmap per recipe, remove its chroma-key background, and store the optimized WebP in the existing cooking item folder.

**Tech Stack:** TypeScript, Vitest, built-in image generation, Sharp, existing image reference checker.

## Global Constraints

- Do not deploy to any environment.
- Preserve unrelated dirty-worktree files and stage only this feature.
- Use exact recipe IDs and values from `docs/superpowers/specs/2026-08-15-ranch-recipe-expansion-design.md`.
- Every generated asset must be 256×256 WebP at quality 85 with an alpha channel and no text or watermark.
- Image filenames must exactly match recipe IDs.
- Write and observe a failing behavioral test before editing `COOKING_RECIPES`.

---

### Task 1: Recipe catalog behavior

**Files:**
- Modify: `src/adventure/v2/cooking.test.ts`
- Modify: `src/adventure/v2/cooking.ts`

**Interfaces:**
- Consumes: `COOKING_RECIPE_BY_ID`, `COOKING_RECIPES`, and `cookingRecipeMatchesQuery()`.
- Produces: recipe IDs `egg_fried_rice`, `milk_rice_porridge`, `soy_braised_eggs`, `milk_custard_pudding`, `crispy_pork_cutlet`, and `soy_pork_rice_bowl`.

- [ ] **Step 1: Write failing catalog tests**

Change the literal tier counts to `[[1, 7], [10, 6], [20, 7], [35, 7], [50, 12]]`. Add a literal table of all six IDs with the exact level, ingredients, XP, base stats, optional rare item, and special stats from the design spec; assert each `COOKING_RECIPE_BY_ID` entry matches its row. Assert `돼지고기` finds both new pork recipes, `달걀` finds the new egg recipes and mixed recipes, and `우유` finds both new milk recipes.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/adventure/v2/cooking.test.ts --maxWorkers=1`

Expected: FAIL because tier counts remain 5/5/10 and the six IDs are absent.

- [ ] **Step 3: Add the six exact recipe definitions**

Insert the two Lv.20 definitions after `milk_potato_soup`, the two Lv.35 definitions after `ranch_cream_gratin`, and the two Lv.50 definitions after `herb_roasted_pork`. Use these icons and descriptions:

- `egg_fried_rice`: `🍳`, “고슬고슬한 쌀과 달걀을 볶아 몸놀림과 행운을 북돋웁니다.”
- `milk_rice_porridge`: `🥣`, “우유와 쌀을 부드럽게 끓여 정신과 활력을 차분히 채웁니다.”
- `soy_braised_eggs`: `🥚`, “달걀을 콩 장에 졸여 끈기와 행운을 더하는 든든한 반찬입니다.”
- `milk_custard_pudding`: `🍮`, “우유와 달걀로 만든 부드러운 푸딩이 집중력과 정신을 가다듬습니다.”
- `crispy_pork_cutlet`: `🍖`, “돼지고기에 고운 빵옷을 입혀 바삭하게 튀긴 힘과 민첩의 요리입니다.”
- `soy_pork_rice_bowl`: `🍱`, “간장 양념 돼지고기를 쌀밥에 얹어 활력과 힘을 든든히 채웁니다.”

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking.test.ts --maxWorkers=1`

Expected: all cooking tests pass.

### Task 2: Recipe bitmap assets

**Files:**
- Create: `public/images/items/cooking/egg_fried_rice.webp`
- Create: `public/images/items/cooking/milk_rice_porridge.webp`
- Create: `public/images/items/cooking/soy_braised_eggs.webp`
- Create: `public/images/items/cooking/milk_custard_pudding.webp`
- Create: `public/images/items/cooking/crispy_pork_cutlet.webp`
- Create: `public/images/items/cooking/soy_pork_rice_bowl.webp`

**Interfaces:**
- Consumes: the automatic `/images/items/cooking/${recipeId}.webp` path from `recipe()`.
- Produces: six alpha-enabled 256×256 WebP assets.

- [ ] **Step 1: Inspect representative existing assets**

View `herb_roasted_pork.webp`, `soy_glazed_fish_bowl.webp`, and `ranch_cream_gratin.webp` to lock the painterly fantasy-game icon style, three-quarter food view, centered silhouette, and transparent background.

- [ ] **Step 2: Generate one source image per recipe**

Make six separate built-in image-generation calls. Each prompt must name the exact dish composition from the design, use one inspected asset as a style reference, require a perfectly flat `#00FF00` background, prohibit text/borders/people/utensils/logos/watermarks, and keep the food free of the key color.

- [ ] **Step 3: Remove chroma key and optimize only these assets**

Use the installed chroma-key helper when Pillow is available. Otherwise use the project-pinned Sharp package to calculate a soft alpha matte with transparent distance 12, opaque distance 220, green despill, then resize to 256×256 and encode WebP at quality 85. Do not run the global PNG optimizer while unrelated PNG work is present.

- [ ] **Step 4: Visually inspect all six final assets**

Confirm each dish is recognizable at 256×256, has clean transparent edges, no green halo, no text, and a visual weight consistent with existing cooking icons.

### Task 3: Verification and commit

**Files:**
- Modify only if a verification failure is caused by this feature.

**Interfaces:**
- Consumes: all Task 1 and Task 2 outputs.

- [ ] **Step 1: Run focused verification**

Run: `npm test -- src/adventure/v2/cooking.test.ts src/app/api/v2/cooking/route.test.ts --maxWorkers=1`

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/cooking.ts src/adventure/v2/cooking.test.ts`

Expected: all commands exit 0.

- [ ] **Step 2: Run image verification**

Run: `npm run check-images`. Confirm none of the six new paths appears under missing or orphan output. Also inspect each file with Sharp metadata and require width 256, height 256, format WebP, and alpha enabled.

- [ ] **Step 3: Run the complete suite**

Run: `npm test -- --maxWorkers=4`

Expected: every non-skipped suite passes.

- [ ] **Step 4: Review and commit only this feature**

Run: `git diff --check` on the two cooking source files and both new docs. Run `git status --short`, exclude unrelated fishing-shop and workspace files, then stage the cooking files, six WebP assets, and two docs.

```bash
git commit -m "feat: expand ranch ingredient recipes"
```
