# UI Interaction Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed click-time jumps, blocked desktop chat toggle, unstable async button widths, and abrupt tab/route swaps without changing game rules.

**Architecture:** Keep existing component ownership and data flow. Enforce stable behavior at shared boundaries (`Button`, global motion CSS, `GameContentTransition`, route `loading.tsx`) and make only the two measured tab hotspots opt into stable content frames.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest, Playwright Chromium

## Global Constraints

- Read the local Next.js 16 navigation and `loading.tsx` guides before modifying App Router files.
- Preserve opaque surface tokens from `src/components/ui/surfaces.ts`; no translucent content cards.
- Do not modify or stage concurrent mobile UX files or `src/adventure/v2/combat/engine.pvpPhase.ts`.
- Do not deploy.

---

### Task 1: Desktop Chat Toggle Layer

**Files:**
- Modify: `src/components/ChatButton.layout.test.ts`
- Modify: `src/components/ChatButton.tsx`

**Interfaces:**
- Consumes: `CHAT_OVERLAY_CLASS` desktop layer `sm:z-[45]`.
- Produces: opened floating toggle layer `sm:z-[46]`, remaining above the docked panel while closed buttons stay at `z-[44]`.

- [ ] Add a failing assertion that the opened desktop toggle uses `sm:z-[46]`.
- [ ] Run `npm test -- --run src/components/ChatButton.layout.test.ts src/components/ChatPanel.layout.test.ts` and verify the assertion fails on `sm:z-[44]`.
- [ ] Change only `CHAT_FLOATING_OPEN_LAYER_CLASS` to `"z-[75] sm:z-[46]"`.
- [ ] Re-run the focused tests and verify they pass.
- [ ] Commit only the two chat files.

### Task 2: Position-Invariant Shared Motion

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `.ui-game-button` and `.ui-lift-card` hover/active states with unchanged geometry; `.ui-dropdown-reveal` with opacity-only entrance and no child stagger.

- [ ] Remove `transform` from the shared button transition and hover/active states while retaining color, border, and shadow feedback.
- [ ] Remove hover/active transforms from `.ui-lift-card` while retaining border/background/shadow feedback.
- [ ] Change `ui-dropdown-reveal` keyframes to opacity-only 120ms and delete `ui-dropdown-item-reveal` plus nth-child delays.
- [ ] Use a production build and Playwright to compare representative button/card bounding boxes before hover, after hover, and during pointer down; x/y must remain equal within 0.1px.
- [ ] Verify reduced-motion behavior still disables the remaining common animations.
- [ ] Commit only `globals.css`.

### Task 3: Stable Shared Button Loading State

**Files:**
- Create: `src/components/ui/Button.test.tsx`
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/adventure/v2/V2SkillLearnView.tsx`
- Modify: `src/adventure/v2/V2QuestView.tsx`
- Modify: `src/adventure/v2/V2QuestView.test.tsx`

**Interfaces:**
- Adds to `ButtonProps`: `loading?: boolean`, `loadingLabel?: string`.
- Loading keeps normal children in an invisible layout slot, overlays one fixed spinner, sets `aria-busy`, substitutes the accessible label, and disables activation.

- [ ] Add failing static-render tests for the new props: normal child text remains in markup, the content slot is invisible, spinner is present, `disabled`, `aria-busy="true"`, and loading accessible label are present.
- [ ] Run `npm test -- --run src/components/ui/Button.test.tsx` and verify TypeScript/runtime failure because the props do not exist.
- [ ] Implement the minimal loading slot in `Button`; preserve caller-provided `disabled`, `aria-label`, size, and variant behavior when not loading.
- [ ] Replace the confirmed skill learning, bundle claim, individual quest claim/tracking, and claim-all conditional busy labels with normal labels plus `loading`/`loadingLabel`.
- [ ] Extend `V2QuestView.test.tsx` to render a busy claim row and assert the normal visible-width label remains with loading semantics.
- [ ] Run focused Button, skill, and quest tests and verify green.
- [ ] Commit only the listed files.

### Task 4: Stable Skill and Quest Tab Frames

**Files:**
- Create: `src/app/(game)/character/skills/page.test.tsx`
- Modify: `src/app/(game)/character/skills/page.tsx`
- Modify: `src/adventure/v2/V2QuestView.tsx`
- Modify: `src/adventure/v2/V2QuestView.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: a constant 1080px skills content frame with an inner 720px readable frame for learn/enhance/pattern and a keyed `ui-tab-content-reveal` boundary for quest tab content.

- [ ] Add failing static-render tests for the fixed skills outer frame and a reusable exported `QuestTabContent` boundary with `data-tab` and `ui-tab-content-reveal`.
- [ ] Run both focused tests and confirm missing frame/boundary failures.
- [ ] Keep the skills content outer wrapper constant and move the conditional max-width to a nested readable wrapper; add `ui-tab-content-reveal` without translate/scale.
- [ ] Wrap the selected quest content in `QuestTabContent key={topTab}` so daily/weekly DOM is replaced instead of mutating reused rows in place.
- [ ] Add opacity-only `ui-tab-content-reveal` keyframes and reduced-motion override.
- [ ] Run focused tests, then browser-check skills and quest tabs at 390×844 and 1280×900 for a stable header/tab position.
- [ ] Commit only the listed files.

### Task 5: Common Game Route Feedback

**Files:**
- Modify: `src/adventure/v2/GameContentTransition.test.tsx`
- Modify: `src/adventure/v2/GameContentTransition.tsx`
- Create: `src/app/(game)/loading.test.tsx`
- Create: `src/app/(game)/loading.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Adds `gameContentTransitionClass(previousPathname, pathname): string`.
- Produces `ui-route-content-enter` for ordinary path changes, preserves `ui-hunt-floor-enter` for dungeon-list-to-floor, and produces no animation on first render or same-path updates.

- [ ] Add failing policy tests for first render, same path, ordinary route change, and dungeon list-to-floor change.
- [ ] Run the transition test and verify the missing policy fails.
- [ ] Implement the policy and apply its class from the existing layout effect.
- [ ] Add a failing static-render test requiring the common loading surface to use opaque `SURFACE_CARD`, a status label, and fixed skeleton geometry.
- [ ] Implement `(game)/loading.tsx` using `PageShell`, `SURFACE_CARD`, and `Skeleton`, with no client APIs.
- [ ] Add opacity-only `ui-route-content-enter` CSS and a reduced-motion override.
- [ ] Run focused tests and verify green.
- [ ] Commit only the listed files.

### Task 6: Full Verification and Handoff

**Files:** No new production files.

- [ ] Re-check `git status` and verify concurrent dirty files remain unstaged and unchanged by this plan.
- [ ] Run all changed-file Vitest tests.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run ESLint on every changed TS/TSX file.
- [ ] Run `npm run build`.
- [ ] Run a Playwright smoke covering desktop chat open/close, button/card geometry, dropdown, skill tabs, quest tabs, and two route navigations.
- [ ] Review `git diff --check`, the final staged diff, and commit any verification-only test adjustments.
- [ ] Report commits, exact verification evidence, remaining concurrent worktree changes, and confirm no deployment occurred.
