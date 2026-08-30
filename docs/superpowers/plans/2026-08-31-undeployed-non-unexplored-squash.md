# August 31 Undeployed Non-Unexplored Work Squash Plan

**Goal:** Consolidate every completed, undeployed, non-unexplored change after production commit `b56e35685b2577384a9d8301c9bc9ee8de859dc6` into one local release commit.

**Release branch:** `release/aug31-all-pending-excluding-unexplored`

## Constraints

- Keep the branch based directly on the latest successful production SHA.
- Do not deploy, push, merge into `main`, or change maintenance mode.
- Preserve all source branches and source commits.
- Exclude unexplored-region content, bosses, monster pools, simulations, equipment loops, specialty sets, artwork, routes, and UI.
- Where a general feature also has an unexplored integration seam, include the general feature and omit only the unexplored-specific paths and hunks.
- Produce exactly one commit beyond the production base.

## Included source commits

### General fixes and equipment liberation

```text
a46a27765
70e86c165 47897c71d d771296f2 b737f7a1c c72829954
f50fd00ba 09f6a2007 1ab697a36 6a10c39ce 8df41e23a
8f4989343 82d95202d 2800e5b16 d5206e4d5 cc4f9fa09
7880b49ab 913951892 931316945
```

### Combat balance and clarity

```text
8e0dfca1b ba6baa098 cf002c08c f23f7396f 96278c4e9
0fe54b217 3c71d89ce
```

### Home, fishing, coin shop, and premium support

```text
704f156d7 e44e619b3 f1c1343f6
ee9b8db2b efd7aa3c4 ada212052 a4ce2e41c 4bfb5ad94
842e2b51a f3569341b a13d8c35f c87896b9f 58c88b1ed
965d3b337 8f3746249
```

### Catch-up packages

```text
9b6c16aa1 4171f6f1b cd9d813b3 59794bb27 56cbab514
1fe9a46b2 433497beb a9a7379e9 edc9a3be6
```

### Cooking, quality-of-life, cleanup, and optimization

```text
af9b44933 0f580c8c3
9c4ffb505 30cc20f63 514d2b324 4011a3286 215b653ec
f635b135b 05402e546
d28188f6a b3c654f56 4d713ceb1
cbcd50ee4 e702f3513 b19073a9b 3ec9d9ad1 f916650f7
```

## Explicitly excluded work families

- All commits and paths for unexplored exploration, progression, hunting, rewards, crafting, bosses, achievements, simulations, monster pools, and variant artwork.
- Tracking Weapon, Toxic Blood Lord, and Glacial Colossus boss work.
- Unexplored pioneer equipment and unexplored specialty sets.
- Unexplored summon-cost and entry-difficulty balancing.
- Already deployed manual and mastery-tower commits represented by production commit `b56e35685`.

## Verification

- Confirm every included source commit has a represented patch or an explicit supersession note.
- Search the aggregate changed-path list and diff for unexplored-only paths and identifiers.
- Review every changed path shared with excluded commits.
- Run `git diff --check`, module budgets, ESLint, TypeScript, and the full Vitest suite.
- Commit once and confirm `origin/main..HEAD` contains exactly one commit.

## Inclusion audit notes

- `liberationHuntDropCategories.ts` and its test were added during equipment-liberation work, then intentionally removed by the selected retired-data cleanup; the final tree therefore matches production for those superseded paths.
- `dungeonUniqueDrops.test.ts` from the module-quality commit contained only an unexplored pioneer-pool adjustment, so that hunk is intentionally absent.
- `HonorShopPanel.test.tsx` and `coop/attack/route.test.ts` originated on unexplored pioneer/boss work. Their unrelated context and growth-leap production changes are represented elsewhere, while those two source test files remain excluded.
- All other paths touched by every included source commit differ from the production base in the aggregate tree.
- The only aggregate paths or added lines containing `unexplored`/`미개척` are this audit file and the general equipment-liberation/quality-of-life design documents; no unexplored runtime, API, UI, test, simulation, or image path is included.
