# Selective Game Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a loaded-image background crossfade and a dungeon-list-to-floor content entrance without animating the persistent game chrome.

**Architecture:** Extract the scene background into a focused client component that owns a displayed and incoming image layer. Add a second focused client wrapper that compares consecutive pathnames and assigns the hunt-entry animation only for the approved route edge. `GameChrome` composes both while keeping navigation and global controls outside the animated content.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, CSS keyframes, Vitest, Testing Library.

## Global Constraints

- Animate only background source changes and `/battle/dungeon` → `/battle/dungeon/<numeric floor>` navigation.
- Background duration is exactly 180ms; hunt-entry duration is exactly 160ms with an 8px horizontal offset.
- Do not enable `experimental.viewTransition` or add an animation dependency.
- Keep top bar, main navigation, ticker, stamina bar, chat, modal, and internal-tab behavior unchanged.
- Disable the new motion under `prefers-reduced-motion: reduce`.
- Preserve opaque game content surfaces and the existing background dim overlay.

---

### Task 1: Loaded scene background crossfade

**Files:**
- Create: `src/adventure/v2/GameSceneBackground.tsx`
- Create: `src/adventure/v2/GameSceneBackground.test.tsx`
- Modify: `src/adventure/v2/GameChrome.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `GameSceneBackground({ src, fallbackSrc? })` and `GAME_BACKGROUND_CROSSFADE_MS`.
- Consumes: the background selection already computed by `GameChrome`.

- [ ] **Step 1: Write the failing component test**

Render `/images/ui/village.webp`, rerender with `/images/ui/hunt.webp`, and assert the old image remains until the incoming image fires `load`. Assert both layers enter their active state after `load`, advance fake timers by 180ms, and assert only the hunt image remains.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/v2/GameSceneBackground.test.tsx`

Expected: FAIL because `GameSceneBackground` does not exist.

- [ ] **Step 3: Implement the minimal layered background**

Create a client component with a displayed layer, optional incoming layer, image-load activation, fallback handling, and a cleanup timer. Each layer contains the image plus the existing opaque dim overlay. Replace the private `TabBackground` in `GameChrome` with this component and remove the route-key remount.

- [ ] **Step 4: Add the crossfade CSS**

Add `ui-game-background-current` and `ui-game-background-incoming` state selectors using 180ms opacity keyframes. Add a reduced-motion rule that immediately exposes the incoming layer and hides the outgoing layer.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- src/adventure/v2/GameSceneBackground.test.tsx`

Expected: PASS with no warnings.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/adventure/v2/GameSceneBackground.tsx src/adventure/v2/GameSceneBackground.test.tsx src/adventure/v2/GameChrome.tsx src/app/globals.css
git commit -m "feat: crossfade game scene backgrounds"
```

### Task 2: Hunt list-to-floor content entrance

**Files:**
- Create: `src/adventure/v2/GameContentTransition.tsx`
- Create: `src/adventure/v2/GameContentTransition.test.tsx`
- Modify: `src/adventure/v2/GameChrome.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `GameContentTransition({ children })` and `isHuntListToFloorNavigation(previousPathname, pathname)`.
- Consumes: `usePathname()` from the persistent `GameChrome` subtree.

- [ ] **Step 1: Write the failing navigation tests**

Assert the pure route predicate accepts `/battle/dungeon` → `/battle/dungeon/73` and rejects direct entry, nonnumeric floor paths, floor-to-floor navigation, and unrelated routes. Render the wrapper with a mutable pathname mock and assert the class appears only after the approved route change.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/v2/GameContentTransition.test.tsx`

Expected: FAIL because the wrapper and predicate do not exist.

- [ ] **Step 3: Implement the persistent pathname wrapper**

Track the committed previous pathname in a ref updated by `useEffect`. Apply `ui-hunt-floor-enter` only when the current render represents the approved list-to-floor route edge. Wrap only the `children` region in `GameChrome` so persistent chrome elements remain stationary.

- [ ] **Step 4: Add the hunt-entry CSS**

Add a 160ms ease-out animation from `opacity: 0; transform: translate3d(8px, 0, 0)` to the resting state. Disable it under reduced motion.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- src/adventure/v2/GameContentTransition.test.tsx`

Expected: PASS with no warnings.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/adventure/v2/GameContentTransition.tsx src/adventure/v2/GameContentTransition.test.tsx src/adventure/v2/GameChrome.tsx src/app/globals.css
git commit -m "feat: animate hunt floor entry"
```

### Task 3: Regression and production verification

**Files:**
- Modify only if verification exposes a scoped defect.

**Interfaces:**
- Consumes both transition components through `GameChrome`.
- Produces a clean, buildable feature branch.

- [ ] **Step 1: Run focused and chrome-adjacent tests**

Run: `npm test -- src/adventure/v2/GameSceneBackground.test.tsx src/adventure/v2/GameContentTransition.test.tsx src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/GameChrome.test.tsx`

If an existing test file in the command is absent, use `rg --files src/adventure/v2 | rg '(GameChrome|MainTabNav).*test'` and run all existing matches plus the two new tests.

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/GameSceneBackground.tsx src/adventure/v2/GameSceneBackground.test.tsx src/adventure/v2/GameContentTransition.tsx src/adventure/v2/GameContentTransition.test.tsx src/adventure/v2/GameChrome.tsx`

Run: `npm run check-images`

- [ ] **Step 3: Run full regression tests**

Run: `npm test`

Expected: all non-skipped tests pass.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: Next.js compiles and generates all routes successfully.

- [ ] **Step 5: Review and commit any verification-only fixes**

Run `git diff --check`, `git status --short`, and `git diff --stat HEAD~2..HEAD`. Confirm no deployment or unrelated files are included. If verification required a fix, commit it with a narrow `fix:` message.
