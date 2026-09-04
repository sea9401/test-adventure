# Game Info Return Multitab Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a game-opened rating-information helper tab instead of navigating it into a duplicate game session.

**Architecture:** Game links identify auxiliary navigation with `?from=game`. The server page reads the Promise-based Next.js 16 `searchParams` contract and selects either a focused client close control or the existing direct-visit home link.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library

## Global Constraints

- Preserve `target="_blank"` and `rel="noreferrer"` on game-origin links.
- Do not weaken or modify `MultiTabGuard`.
- Do not deploy, push, merge, or update feedback #574 externally.
- Use opaque surfaces from the existing UI surface constants for any new visible notice.

---

### Task 1: Reproduce and fix auxiliary rating-tab return

**Files:**
- Create: `src/components/GameInfoReturnControl.tsx`
- Create: `src/components/GameInfoReturnControl.test.tsx`
- Modify: `src/app/game-info/page.tsx`
- Modify: `src/components/GameRatingInformation.test.tsx`
- Modify: `src/adventure/v2/V2SettingsMenu.tsx`
- Modify: `src/adventure/v2/V2SettingsMenu.rating.test.tsx`
- Modify: `src/adventure/v2/V2PreferencesView.tsx`
- Modify: `src/adventure/v2/V2PreferencesView.test.tsx`

**Interfaces:**
- Consumes: `searchParams: Promise<{ from?: string | string[] }>` and the `from=game` marker.
- Produces: `GameInfoReturnControl`, which calls `window.close()` and shows a non-navigation fallback message when the tab remains open.

- [x] **Step 1: Write failing regression tests**

Assert that both game links use `/game-info?from=game`, that an auxiliary page renders a close
button rather than an `/` link, that clicking invokes `window.close()`, and that a direct page keeps
the `/` link.

- [x] **Step 2: Verify RED**

Run:

```bash
npx vitest run src/components/GameInfoReturnControl.test.tsx src/components/GameRatingInformation.test.tsx src/adventure/v2/V2SettingsMenu.rating.test.tsx src/adventure/v2/V2PreferencesView.test.tsx
```

Expected: FAIL because the auxiliary marker and close control do not exist.

- [x] **Step 3: Implement the minimal fix**

Add `GameInfoReturnControl`, update both game links, and make `GameInfoPage` await its optional
search parameters. Do not change the broadcast-channel guard.

- [x] **Step 4: Verify GREEN and repository health**

Run the focused tests, TypeScript, lint on changed source files, image checks, and the full Vitest
suite. Every command must exit zero.

- [x] **Step 5: Commit the scoped fix**

Stage only the spec, plan, component, page, two callers, and their tests. Commit without pushing or
deploying.
