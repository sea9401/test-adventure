# Game Rating Refresh Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the required first-entry game rating notice while preventing the same tab's page refreshes from replaying a blocking 3.5-second overlay.

**Architecture:** Store a versioned seen marker in `sessionStorage`, and use a pre-hydration root class to suppress repeat-render flashes. Replace the modal overlay with a nonblocking, opaque top-right status panel while retaining the existing public details page and permanent links.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Show the notice for 3.5 seconds on the first game entry in a new app or browser tab.
- Do not replay the notice after refresh or later game navigation in the same tab.
- Keep the panel opaque and at least 25% of the viewport height.
- Keep `/game-info` and its existing permanent navigation links unchanged.
- Do not deploy or change maintenance mode.

---

### Task 1: Persist first-entry state and present a nonblocking rating panel

**Files:**
- Modify: `src/lib/gameRating.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/GameRatingLaunchNotice.tsx`
- Test: `src/components/GameRatingLaunchNotice.test.tsx`
- Modify: `e2e/authenticated-accessibility.spec.ts`

**Interfaces:**
- Produces: `GAME_RATING_NOTICE_SESSION_KEY: string` and `GAME_RATING_NOTICE_SEEN_CLASS: string`
- Consumes: `GAME_RATING`, `GAME_RATING_NOTICE_MS`, `isGameEntryPath(pathname: string): boolean`, and browser `sessionStorage`

- [ ] **Step 1: Write the failing repeat-mount and nonblocking-panel tests**

  Extend `GameRatingLaunchNotice.test.tsx` so the first mount writes the session marker, a second
  mount in the same jsdom session renders no notice, the visible notice uses a `status` role without
  modal focus capture, and the notice still appears when storage access throws.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `npm test -- src/components/GameRatingLaunchNotice.test.tsx`

  Expected: FAIL because the session constants and persistent repeat suppression do not exist and
  the current component still renders a modal dialog.

- [ ] **Step 3: Implement the minimal session gate and panel**

  Add versioned session key and root class constants to `gameRating.ts`. In the client component,
  check and record the marker with a failure-safe `try/catch`; render an upper-right `role="status"`
  panel containing the official age and violence icons and their required Korean labels. Remove the
  full-screen black background, focus transfer, and Tab-key trap.

- [ ] **Step 4: Prevent pre-hydration refresh flashes**

  Add a root-layout initialization script that reads the same session key and applies the root class.
  Add a global selector that hides only `.game-rating-launch-notice` when that class is present.

- [ ] **Step 5: Update the accessibility journey**

  Remove the wait for the obsolete modal dialog from `authenticated-accessibility.spec.ts`; the new
  nonblocking status does not capture focus, so the existing skip-link assertion can run immediately.

- [ ] **Step 6: Run focused and related tests and verify GREEN**

  Run: `npm test -- src/components/GameRatingLaunchNotice.test.tsx src/components/GameRatingInformation.test.tsx src/app/sign-in/LandingContent.test.tsx src/adventure/v2/V2SettingsMenu.rating.test.tsx`

  Expected: all tests PASS with no warnings.

- [ ] **Step 7: Run repository verification**

  Run: `npm run typecheck && npm run lint && npm run build`

  Expected: all commands exit 0.

- [ ] **Step 8: Commit the implementation**

  Stage only the files listed in this task and commit with `fix: avoid replaying rating notice on refresh`.
