# Dangerous Fishing Background Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three dangerous-fishing sea backgrounds with a cohesive pencil-and-watercolor set that matches the game's existing region artwork while preserving each sea's composition and identity.

**Architecture:** Use the built-in image generation tool in edit mode once per background. Each call uses the current sea background as the edit target and `star_grave.webp`, `reef_isle.webp`, and `fishing.webp` as style references; selected PNG outputs are copied into `public/images/ui/` and converted in place by the existing image optimizer.

**Tech Stack:** Built-in image generation, local image inspection, Sharp through `scripts/optimize-images.mjs`, repository image and asset-rights checks

## Global Constraints

- Modify only the three dangerous-fishing background assets, the asset-rights ledger hashes, this plan, and the already committed design document.
- Preserve the current subject layout and sea identity: shattered rocks, stormy trench, and glowing abyssal rift.
- Match the fine pencil lines, pale watercolor wash, warm paper texture, soft contrast, and low-to-medium saturation of the existing region art.
- Do not modify fish, boss, gear, bait, UI code, game rules, values, text, image paths, or catalog data.
- Do not add text, logos, watermarks, photorealism, glossy 3D rendering, anime background rendering, or intense neon glow.
- Keep the existing `.webp` filenames; Git is the rollback mechanism, so do not create backup assets.
- Do not modify or stage the user-owned untracked paths `NUL` and `_workspace/`.
- Do not deploy, push, or change maintenance mode.
- Raster-only replacement has no useful red/green unit-test seam, so TDD is intentionally omitted; use visual invariant checks and repository asset validation instead.

---

### Task 1: Create and approve three restyled background candidates

**Files:**
- Edit target: `public/images/ui/dangerous-fishing-shattered-reef.webp`
- Edit target: `public/images/ui/dangerous-fishing-storm-trench.webp`
- Edit target: `public/images/ui/dangerous-fishing-abyssal-rift.webp`
- Style reference: `public/images/ui/star_grave.webp`
- Style reference: `public/images/ui/reef_isle.webp`
- Style reference: `public/images/ui/fishing.webp`

**Interfaces:**
- Consumes: the three current full-frame sea compositions and the game's established hand-drawn region-art language.
- Produces: one selected image-generation result per sea, with the returned result path recorded for Task 2.

- [ ] **Step 1: Load every edit target and style reference for inspection**

Use the local image viewer at original detail for all six files. Treat each dangerous-fishing image as an edit target, `star_grave.webp` as the primary style reference, and `reef_isle.webp` plus `fishing.webp` as supporting references.

- [ ] **Step 2: Edit the shattered-reef background**

Run one built-in image edit call with the shattered-reef target and the three style references using this prompt:

```text
Use case: style-transfer
Asset type: wide fantasy RPG sea-region background used in a selectable card and encounter scene
Primary request: Restyle the current shattered-reef scene so it belongs to the same game art set as the reference region images.
Input images: Image 1 is the edit target; Image 2 is the primary style reference; Images 3 and 4 are supporting style references.
Scene/backdrop: A clear dangerous sea filled with many sharp broken reefs, viewed from a nearby wooden dock or boat.
Style/medium: Fine hand-drawn pencil and colored-pencil outlines, pale watercolor washes bleeding softly into warm ivory paper, delicate storybook fantasy environment illustration.
Composition/framing: Preserve the target's wide composition, horizon, central rock formation, scattered reefs, and near wooden foreground; keep the central and middle areas readable under wide UI crops.
Lighting/mood: Bright but hazardous coastal daylight, gentle value transitions, restrained highlights.
Color palette: Muted turquoise, weathered beige stone, soft green, warm brown, cream paper; low-to-medium saturation.
Constraints: Change the rendering style only; preserve the scene identity and major object placement; no characters; no text, logo, or watermark.
Avoid: glossy digital concept art, anime background, 3D render, photorealism, hard airbrushed gradients, oversaturated cyan, razor-sharp digital highlights, black border.
```

- [ ] **Step 3: Inspect and, if needed, make one targeted shattered-reef correction**

Reject the result if the sharp reef silhouette, nearby wooden foreground, warm paper texture, or wide crop readability is lost. If exactly one invariant fails, issue one follow-up edit naming only that failure and repeat all preservation constraints.

- [ ] **Step 4: Edit the storm-trench background**

Run one built-in image edit call with the storm-trench target and the three style references using this prompt:

```text
Use case: style-transfer
Asset type: wide fantasy RPG sea-region background used in a selectable card and encounter scene
Primary request: Restyle the current storm-trench scene so it belongs to the same game art set as the reference region images.
Input images: Image 1 is the edit target; Image 2 is the primary style reference; Images 3 and 4 are supporting style references.
Scene/backdrop: A perilous open sea with tall rough waves, a deep trough, heavy storm clouds, distant lightning, jagged rocks, and a fishing rod or boat edge in the foreground.
Style/medium: Fine hand-drawn pencil and colored-pencil outlines, pale layered watercolor, visible warm ivory paper grain, delicate storybook fantasy environment illustration.
Composition/framing: Preserve the target's wide horizon, central wave trough, storm mass, lightning rhythm, rocks, and left-side fishing foreground; keep the wave shape readable in wide UI crops.
Lighting/mood: Threatening storm with soft watercolor contrast rather than cinematic darkness; lightning is visible but not neon.
Color palette: Muted slate blue, desaturated teal, soft gray-violet, weathered brown, cream paper; low-to-medium saturation.
Constraints: Change the rendering style only; preserve the scene identity and major object placement; no people; no text, logo, or watermark.
Avoid: photorealistic ocean, glossy digital concept art, anime background, 3D render, near-black shadows, electric neon blue, hard airbrushed gradients, black border.
```

- [ ] **Step 5: Inspect and, if needed, make one targeted storm-trench correction**

Reject the result if the central wave trough, lightning, foreground fishing cue, watercolor paper texture, or wide crop readability is lost. If exactly one invariant fails, issue one follow-up edit naming only that failure and repeat all preservation constraints.

- [ ] **Step 6: Edit the abyssal-rift background**

Run one built-in image edit call with the abyssal-rift target and the three style references using this prompt:

```text
Use case: style-transfer
Asset type: wide fantasy RPG sea-region background used in a selectable card and encounter scene
Primary request: Restyle the current abyssal-rift scene so it belongs to the same game art set as the reference region images.
Input images: Image 1 is the edit target; Image 2 is the primary style reference; Images 3 and 4 are supporting style references.
Scene/backdrop: A dark sea split by a vast circular abyssal rift, viewed from a wooden dock with lanterns and a fishing rod; distant crags frame the horizon.
Style/medium: Fine hand-drawn pencil and colored-pencil outlines, pale watercolor washes on warm ivory paper, granulating pigments and delicate storybook fantasy environment rendering.
Composition/framing: Preserve the target's wide composition, centered circular rift, dock foreground, lanterns, fishing rod, and distant crags; keep the rift unmistakable in wide UI crops.
Lighting/mood: Quiet supernatural danger; the abyss has a restrained cool-blue glow balanced by warm lantern light, with soft contrast.
Color palette: Muted indigo, blue-gray, dusty violet, weathered brown, warm amber, cream paper; low-to-medium saturation.
Constraints: Change the rendering style only; preserve the scene identity and major object placement; no characters or creatures; no text, logo, or watermark.
Avoid: neon cyan, glossy digital concept art, anime background, 3D render, photorealism, near-black crushed shadows, hard airbrushed gradients, black border.
```

- [ ] **Step 7: Inspect and, if needed, make one targeted abyssal-rift correction**

Reject the result if the centered rift, dock, lanterns, fishing cue, restrained glow, paper texture, or wide crop readability is lost. If exactly one invariant fails, issue one follow-up edit naming only that failure and repeat all preservation constraints.

- [ ] **Step 8: Compare the three selected results as a set**

View all three at original detail and at an approximately 360-pixel-wide thumbnail scale. Confirm that they look like one artist's watercolor series while remaining immediately distinguishable as reef, storm, and abyss.

### Task 2: Replace and optimize the project assets

**Files:**
- Modify: `public/images/ui/dangerous-fishing-shattered-reef.webp`
- Modify: `public/images/ui/dangerous-fishing-storm-trench.webp`
- Modify: `public/images/ui/dangerous-fishing-abyssal-rift.webp`

**Interfaces:**
- Consumes: the three exact selected result paths from Task 1.
- Produces: optimized WebP files at the unchanged catalog paths.

- [ ] **Step 1: Copy each selected result into the matching workspace PNG path**

Use the exact source path returned by each built-in image-generation result. Copy it to the corresponding `.png` sibling under `public/images/ui/`: `dangerous-fishing-shattered-reef.png`, `dangerous-fishing-storm-trench.png`, and `dangerous-fishing-abyssal-rift.png`. Do not touch any other image.

- [ ] **Step 2: Convert the three PNG files through the repository optimizer**

Run:

```bash
npm run optimize-images
```

Expected: exactly three UI images are converted to WebP with maximum width 1920 and quality 80, and the temporary PNG files are removed.

- [ ] **Step 3: Inspect the final optimized WebP files**

View all three final paths at original detail. Confirm no crop shift, compression artifact, unwanted text, watermark, broken fishing equipment, or unintentional object appeared during conversion.

### Task 3: Validate scope and commit the replacement set

**Files:**
- Modify: `public/images/ui/dangerous-fishing-shattered-reef.webp`
- Modify: `public/images/ui/dangerous-fishing-storm-trench.webp`
- Modify: `public/images/ui/dangerous-fishing-abyssal-rift.webp`
- Modify: `docs/asset-rights.json`

**Interfaces:**
- Consumes: optimized final assets from Task 2.
- Produces: a committed, reference-valid three-background replacement with no deployment.

- [ ] **Step 1: Run image-reference validation and reproduce the stale rights-ledger check**

Run:

```bash
npm run check-images
npm run check-asset-rights
```

Expected: referenced missing image count is zero; the rights check reports exactly the three replaced paths as changed because their stored SHA-256 values are stale.

- [ ] **Step 2: Refresh only the asset hashes through the repository ledger tool**

Run:

```bash
npm run update-asset-rights
npm run check-asset-rights
```

Expected: the three replaced WebP hashes are updated while their `operator-cleared-game-art` source remains unchanged, and the validation exits zero.

- [ ] **Step 3: Verify the exact diff scope**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: the only uncommitted project changes are this plan, the three dangerous-fishing WebP files, and the three corresponding hash entries in `docs/asset-rights.json`; `NUL` and `_workspace/` remain untracked and unstaged.

- [ ] **Step 4: Commit only the plan, three backgrounds, and rights hashes**

Run:

```bash
git add docs/superpowers/plans/2026-08-15-dangerous-fishing-background-style.md docs/asset-rights.json public/images/ui/dangerous-fishing-shattered-reef.webp public/images/ui/dangerous-fishing-storm-trench.webp public/images/ui/dangerous-fishing-abyssal-rift.webp
git commit -m "fix: match dangerous fishing backgrounds to game art"
```

- [ ] **Step 5: Confirm the repository state after commit**

Run:

```bash
git status --short
git show --stat --oneline HEAD
```

Expected: the replacement commit contains exactly the plan, rights ledger, and three WebP files; only the pre-existing untracked `NUL` and `_workspace/` remain.
