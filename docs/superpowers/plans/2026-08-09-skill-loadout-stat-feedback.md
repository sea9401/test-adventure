# Skill Loadout Stat Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show server-derived current combat stats and the most recent loadout delta directly on the skill equip screen without obscuring mobile content.

**Architecture:** Add a pure stat snapshot/diff module with a responsive summary component, then let `V2SkillLearnView` retain the previous `/me/state` snapshot around a successful loadout refresh. Keep `V2LoadoutPanel` busy until its asynchronous parent refresh finishes so sequential changes cannot compare against stale data.

**Tech Stack:** Next.js App Router client components, React, TypeScript, Tailwind CSS, Vitest, `react-dom/server`.

## Global Constraints

- Use the existing `/api/v2/me/state` response; do not duplicate combat derivation in the browser or add a preview endpoint.
- Desktop uses an opaque sticky side card; mobile uses an in-flow collapsible card and no overlay.
- Use `SURFACE_CARD` and `SURFACE_INSET`; do not introduce translucent content surfaces.
- Preserve all existing uncommitted workspace changes and do not deploy.
- Use server-confirmed post-save values and show `주요 능력치 변동 없음` for loadout changes that do not alter displayed stats.

---

### Task 1: Stat snapshot, diff, and responsive summary

**Files:**
- Create: `src/adventure/v2/LoadoutStatSummary.tsx`
- Create: `src/adventure/v2/LoadoutStatSummary.test.tsx`

**Interfaces:**
- Consumes: `{ combat?: LoadoutCombatSource | null; character?: LoadoutCharacterSource | null }` from `/me/state`.
- Produces: `loadoutStatSnapshot(source): LoadoutStatSnapshot | null`, `diffLoadoutStats(previous, current): LoadoutStatDelta`, `LoadoutStatSummary`, and `LoadoutStatResponsiveLayout`.

- [ ] **Step 1: Write failing pure-function tests**

Add literal fixtures asserting that `loadoutStatSnapshot` maps `atk`, `magicAtk`, `def`, `magicDef`, `spd`, `accRating`, `evaRating`, `critChancePct`, `power`, `maxHp`, and `maxMp`, rejects non-finite values, and that `diffLoadoutStats` returns `{ atk: 15, def: -8 }` for hand-derived snapshots.

- [ ] **Step 2: Run the pure-function tests and verify RED**

Run: `npx vitest run src/adventure/v2/LoadoutStatSummary.test.tsx --reporter=verbose`

Expected: FAIL because `LoadoutStatSummary` does not exist.

- [ ] **Step 3: Implement the snapshot and diff functions**

Use these exact public shapes:

```ts
export type LoadoutStatKey =
  | "power" | "maxHp" | "maxMp" | "atk" | "magicAtk"
  | "def" | "magicDef" | "spd" | "accuracy" | "evasion" | "crit";
export type LoadoutStatSnapshot = Partial<Record<LoadoutStatKey, number>>;
export type LoadoutStatDelta = Partial<Record<LoadoutStatKey, number>>;
```

Only copy finite numbers. Prefer `accRating`/`evaRating`, falling back to percentage fields. Return `null` when no combat object exists. Diff only keys present as finite numbers in both snapshots and omit zero differences.

- [ ] **Step 4: Run the pure-function tests and verify GREEN**

Run: `npx vitest run src/adventure/v2/LoadoutStatSummary.test.tsx --reporter=verbose`

Expected: pure-function tests PASS.

- [ ] **Step 5: Write failing rendering tests**

Render `LoadoutStatSummary` with `current={{ def: 1250, crit: 23.5 }}` and `delta={{ def: 125 }}`. Assert visible Korean labels, `1,125 → 1,250`, `+125`, and `23.5%`. Render `LoadoutStatResponsiveLayout` and assert both the mobile `<details>` summary and desktop `<aside>` exist. Render with `delta={{}}` and assert `주요 능력치 변동 없음`.

- [ ] **Step 6: Run the rendering tests and verify RED**

Run: `npx vitest run src/adventure/v2/LoadoutStatSummary.test.tsx --reporter=verbose`

Expected: FAIL because the components are not implemented.

- [ ] **Step 7: Implement the responsive components**

Use `SURFACE_CARD` for the outer cards and `SURFACE_INSET` for the recent-change notice. `LoadoutStatResponsiveLayout` must render this structure:

```tsx
<div className="grid items-start gap-3 lg:grid-cols-[minmax(0,720px)_minmax(240px,280px)]">
  <div className="min-w-0 space-y-3">
    <div className="lg:hidden"><LoadoutStatSummary collapsible /></div>
    {children}
  </div>
  <aside className="sticky top-3 hidden lg:block"><LoadoutStatSummary /></aside>
</div>
```

Give the recent-change content `aria-live="polite"`. Use native `<details>/<summary>` for mobile, and display previous/current/delta text for changed rows.

- [ ] **Step 8: Run the complete component test and verify GREEN**

Run: `npx vitest run src/adventure/v2/LoadoutStatSummary.test.tsx --reporter=verbose`

Expected: all tests PASS with no warnings.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/adventure/v2/LoadoutStatSummary.tsx src/adventure/v2/LoadoutStatSummary.test.tsx
git commit -m "feat: add loadout stat summary"
```

### Task 2: Compare server-confirmed stats after loadout changes

**Files:**
- Modify: `src/adventure/v2/V2SkillLearnView.tsx`
- Modify: `src/adventure/v2/V2SkillLearnView.test.tsx`

**Interfaces:**
- Consumes: Task 1 `loadoutStatSnapshot`, `diffLoadoutStats`, and `LoadoutStatResponsiveLayout`.
- Produces: `LoadoutRefreshTracker` behavior inside `V2SkillLearnView`: initial snapshot without delta, then one delta per confirmed loadout refresh.

- [ ] **Step 1: Write failing integration-helper tests**

Export a small pure helper `nextLoadoutStatFeedback(previous, source, compare)` returning `{ current, delta }`. Assert initial data returns `delta: null`, a confirmed refresh returns the literal delta, and missing combat preserves no fabricated values.

- [ ] **Step 2: Run the view tests and verify RED**

Run: `npx vitest run src/adventure/v2/V2SkillLearnView.test.tsx --reporter=verbose`

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Implement state response typing and feedback tracking**

Extend `StateShape` with the combat and character fields accepted by Task 1. Add refs for the last snapshot and whether the next refresh is a loadout comparison. Initial refresh seeds the snapshot with `delta=null`; `handleLoadoutChanged` marks the next refresh, awaits `refresh`, and only then exposes `diffLoadoutStats(previous, current)`.

- [ ] **Step 4: Wrap the loadout UI in the responsive layout**

For `section="loadout"`, place both `V2LoadoutPresetsPanel` and `V2LoadoutPanel` inside `LoadoutStatResponsiveLayout`. Pass the current snapshot and latest delta. Keep learn/enhance markup unchanged.

- [ ] **Step 5: Run the view tests and verify GREEN**

Run: `npx vitest run src/adventure/v2/V2SkillLearnView.test.tsx src/adventure/v2/LoadoutStatSummary.test.tsx --reporter=verbose`

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 2**

Stage only the new Task 2 hunks, preserving unrelated dirty changes, then commit:

```bash
git commit -m "feat: show loadout stat changes"
```

### Task 3: Serialize refreshes and open desktop layout width

**Files:**
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.test.tsx`
- Modify: `src/app/(game)/character/skills/page.tsx`

**Interfaces:**
- Changes `onChanged?: () => void` to `onChanged?: () => void | Promise<void>` and awaits it after successful loadout persistence.
- Provides up to `1080px` width for the loadout grid while constraining non-loadout tabs to `720px`.

- [ ] **Step 1: Write a failing asynchronous callback test**

Use React Testing Library with a successful `fetch` response and a controlled `onChanged` Promise. Click `해제`, assert the button remains disabled until the Promise resolves, then assert it becomes enabled. The production mutation caught is removing `await` from `onChanged`.

- [ ] **Step 2: Run the panel test and verify RED**

Run: `npx vitest run src/adventure/v2/V2LoadoutPanel.test.tsx --reporter=verbose`

Expected: FAIL because `commit` currently releases `busy` before asynchronous refresh completes.

- [ ] **Step 3: Await the parent refresh**

Change the callback type to `() => void | Promise<void>` and use `await onChanged?.()` in both preview and persisted commit paths where applicable. Keep rollback behavior unchanged.

- [ ] **Step 4: Run the panel test and verify GREEN**

Run: `npx vitest run src/adventure/v2/V2LoadoutPanel.test.tsx --reporter=verbose`

Expected: all panel tests PASS.

- [ ] **Step 5: Adjust the page container**

Set the skills page outer maximum width to `1080px`. Keep the header/tab bar in a centered `max-w-[720px]` wrapper and wrap learn/enhance/pattern content in the same width; render loadout content at full available width.

- [ ] **Step 6: Run focused and type verification**

Run:

```bash
npx vitest run src/adventure/v2/LoadoutStatSummary.test.tsx src/adventure/v2/V2SkillLearnView.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx --reporter=verbose
npx tsc --noEmit
npm run check-images
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit Task 3**

Stage only Task 3 hunks and commit:

```bash
git commit -m "feat: finish responsive loadout feedback"
```

### Task 4: Final regression verification

**Files:**
- Verify only; no expected production edits.

**Interfaces:**
- Confirms the three tasks compose without regressions.

- [ ] **Step 1: Run the complete relevant suite**

Run:

```bash
npx vitest run src/adventure/v2/LoadoutStatSummary.test.tsx src/adventure/v2/V2SkillLearnView.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx src/lib/server/derivePlayerCombatV2.test.ts --reporter=dot
```

Expected: all tests PASS.

- [ ] **Step 2: Run repository hygiene checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only pre-existing unrelated user changes remain unstaged.

- [ ] **Step 3: Review UI requirements manually from markup**

Confirm the desktop summary is in a `sticky` opaque surface, the mobile summary uses in-flow `<details>`, changed values include text signs and arrows, and no `opacity-*` is applied to a card container.
