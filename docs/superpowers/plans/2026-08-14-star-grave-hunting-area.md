# Star Grave Hunting Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 79–84 `별의 무덤` hunting area as a difficult 6T endgame chase zone for the existing twelve Sky Rift signature uniques.

**Architecture:** Extend the existing six-depth dungeon theme catalog so the frontier cap derives as 84. Keep recommended power, actual monster scaling, reward caps, and drop pools independent: the ladder exposes the fixed 8,000–10,000 display curve, authored monsters plus depth multipliers set combat difficulty, EXP is capped at depth 78, and the existing 6T armor/signature ID lists are reused with Star Grave-specific rates. Use existing combat skills only and add no element metadata or combat engine behavior.

**Tech Stack:** TypeScript, Next.js 16.2 project conventions, Vitest, Sharp/WebP image pipeline, built-in image generation.

## Global Constraints

- Do not add 7T equipment, new equipment, new uniques, or a new progression/refinement system.
- Do not change Sky Rift or earlier monster stats.
- Recommended power must be exactly `8,000 / 8,400 / 8,800 / 9,200 / 9,600 / 10,000` for depths 79–84.
- Reuse the Sky Rift 21-item 6T armor pool at the same paired rates: `0.0005 / 0.00075 / 0.001`.
- Reuse the twelve `SKY_RIFT_SIGNATURE_UNIQUE_IDS` at a flat `0.000035` total rate for depths 79–84.
- Cap EXP and derived gold at the Sky Rift depth-78 distribution.
- Add no `element` field to Star Grave enemies and no element-based behavior.
- Add one new background and five new monster images, optimized to WebP using existing image profiles.
- Do not deploy.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Frontier structure and fixed display curve

**Files:**
- Modify: `src/adventure/data/v2/dungeon.test.ts`
- Modify: `src/adventure/data/v2/dungeonLadder.test.ts`
- Modify: `src/adventure/data/v2/dungeon.ts`
- Modify: `src/adventure/data/v2/dungeonLadder.ts`

**Interfaces:**
- Consumes: existing `DUNGEON_THEMES`, `MAX_FRONTIER_DEPTH`, `floorPowerGate(depth)`.
- Produces: depths 79–84 named `별의 무덤`, five-enemy theme membership, and the fixed power gates.

- [ ] Add failing tests that assert `MAX_FRONTIER_DEPTH === 84`, stage progression continues `78 → 80 → 82 → 84 → null`, names map to `별의 무덤 1..6`, and power gates equal the six approved literals.
- [ ] Run `npm test -- src/adventure/data/v2/dungeon.test.ts src/adventure/data/v2/dungeonLadder.test.ts` and confirm failures are caused by the missing theme/curve.
- [ ] Add `BAND_M_STAR_GRAVE_ENEMIES` with five display definitions and append it to `DUNGEON_THEMES`; do not set `element`.
- [ ] Add a `STAR_GRAVE_POWER_GATES` six-value constant and return it for depths 79–84 without modifying prior depths.
- [ ] Re-run the focused tests and confirm the new structural assertions pass.

### Task 2: Monster roles and endgame combat scaling

**Files:**
- Modify: `src/adventure/data/v2/dungeon.test.ts`
- Modify: `src/adventure/data/v2/dungeonLadder.test.ts`
- Modify: `src/adventure/data/v2/v2Monsters.ts`
- Modify: `src/adventure/data/v2/dungeonLadder.ts`
- Modify: `scripts/sim-v2-level-design.ts` only if the existing max-depth derivation needs no other changes.

**Interfaces:**
- Consumes: existing `Monster` fields and `heavy_blow`, `pierce`, `enrage`, `mob_rending_claw`, `mob_venom_bite`, `mob_chilling_touch`, and `mob_arcane_burst` behavior.
- Produces: five authored monsters with opposite physical/magic defense profiles and fixed 79–84 depth multipliers.

- [ ] Add failing tests for the five catalog entries, absence of `element` on their dungeon entries, opposite defense profiles, expected attack types, and monotonic post-78 combat multipliers.
- [ ] Run the two focused data tests and confirm the new assertions fail for missing monsters/scaling.
- [ ] Implement the five monsters: high-DEF warden, evasive bleed/pierce tracker, fragile magic-burst priest, durable poison/enrage beast, and high-MDEF slowing magic observer.
- [ ] Extend fixed frontier durability/attack/defense/accuracy/evasion ramps through depth 84 with new Star Grave endpoints, leaving values through 78 byte-for-byte unchanged.
- [ ] Run representative audits at depths 79, 82, and 84 and adjust only Star Grave endpoints/authored stats until the area is materially harder than depth 78 and role differences remain visible.
- [ ] Re-run focused data and level-design tests.

### Task 3: Reused 6T drops and capped economy

**Files:**
- Modify: `src/adventure/data/v2/dungeonUniqueDrops.test.ts`
- Modify: `src/adventure/data/v2/dungeonLadder.test.ts`
- Modify: `src/adventure/data/v2/levelDesignSim.test.ts`
- Modify: `src/adventure/data/v2/dungeonUniqueDrops.ts`
- Modify: `src/adventure/data/v2/dungeonLadder.ts`

**Interfaces:**
- Consumes: `SKY_RIFT_ARMOR_IDS`, `SKY_RIFT_SIGNATURE_UNIQUE_IDS`, `bandCommonChanceForDepth`, `floorExpMult`.
- Produces: Star Grave common pools for 79–84, `STAR_GRAVE_SIGNATURE_UNIQUE_CHANCE = 0.000035`, and depth-78 EXP cap behavior.

- [ ] Add failing tests asserting all depths 79–84 reuse the same 21 armor IDs, paired rates equal Sky Rift, all six share the twelve signature IDs at `0.000035`, and `floorExpMult(79..84) === floorExpMult(78)`.
- [ ] Run the focused drop/ladder tests and confirm failures are caused by missing pools and uncapped reward behavior.
- [ ] Export/reuse the armor ID list, add three Star Grave common-pool ranges, add one Star Grave unique range, and map common rates by local pair without duplicating IDs.
- [ ] Cap `floorExpMult` input at 78 for the endgame reward branch and give Star Grave monsters the same authored EXP multiset as Sky Rift.
- [ ] Re-run focused tests and confirm all drop/economy assertions pass.

### Task 4: New visual assets and scene background

**Files:**
- Create: `public/images/ui/star_grave.webp`
- Create: `public/images/monster/v2/star-sea-warden.webp`
- Create: `public/images/monster/v2/comet-tail-stalker.webp`
- Create: `public/images/monster/v2/red-giant-priest.webp`
- Create: `public/images/monster/v2/void-devouring-beast.webp`
- Create: `public/images/monster/v2/dead-star-observer.webp`
- Modify: `src/adventure/data/v2/dungeon.ts`
- Modify: `src/adventure/v2/GameChrome.tsx`
- Modify: `src/adventure/v2/GameSceneBackground.test.tsx`

**Interfaces:**
- Consumes: dungeon route pathname and existing `GameSceneBackground` fallback behavior.
- Produces: a Star Grave-specific scene for dungeon depths 79–84 and five exact monster image references.

- [ ] Add a failing pure route/background selection test for `/battle/dungeon/79` and `/battle/dungeon/84`, while depth 78 remains on `hunt.webp`.
- [ ] Generate one wide cosmic-ruin environment and five square isolated monster illustrations using the built-in image tool, with no text, logos, watermark, or element icons.
- [ ] Copy generated outputs into the exact project paths, optimize to WebP, and inspect each asset.
- [ ] Reference each monster image in `BAND_M_STAR_GRAVE_ENEMIES` and select `star_grave.webp` only for numeric dungeon depths 79–84.
- [ ] Run `npm run check-images` and the scene-background test.

### Task 5: Manual, codex, and integrated regressions

**Files:**
- Modify: `src/app/manual/content/hunting.tsx`
- Modify: `src/app/manual/current-content.test.tsx`
- Modify: `src/adventure/v2/V2CodexView.test.ts`
- Modify: `src/adventure/data/v2/levelDesignSim.test.ts`
- Modify: any existing exact-count/cap assertions discovered by the focused suite.

**Interfaces:**
- Consumes: `dungeonThemeCatalog(MAX_FRONTIER_DEPTH)`, common/unique pool readers, manual rendering.
- Produces: user-facing explanation of Star Grave's purpose and current-content consistency.

- [ ] Add failing rendered-content assertions for `별의 무덤`, the 6T chase purpose, and the `0.0035%` rate; update codex behavior tests to cover the 79–84 theme.
- [ ] Run the focused manual/codex/level-design tests and confirm expected failures.
- [ ] Update hunting guidance to state that Star Grave reuses the 21 armor and twelve signature uniques, has the same EXP/gold, and only improves signature rate.
- [ ] Update exact theme/species counts and max-depth expectations that legitimately changed from 78 to 84.
- [ ] Run all focused tests until green.

### Task 6: Verification and commit

**Files:**
- Verify all files changed by Tasks 1–5.

**Interfaces:**
- Consumes: completed feature.
- Produces: verified local commit with no deployment.

- [ ] Run `git diff --check` and inspect the complete scoped diff for accidental monster/equipment changes.
- [ ] Run focused Vitest files for dungeon, ladder, drops, level design, codex, scene background, and manual content.
- [ ] Run `npm run check-images`, `npx eslint` on changed source/test files, and `npx tsc --noEmit`.
- [ ] Run `npm run build` to exercise the Next.js 16.2 production build and image hooks.
- [ ] Stage only Star Grave files, leaving unrelated inventory changes and untracked workspace artifacts untouched.
- [ ] Commit with a scoped feature message and report that deployment was not performed.
