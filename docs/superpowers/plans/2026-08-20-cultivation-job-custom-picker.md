# Cultivation Job Custom Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native cultivation job select with an accessible in-game picker that displays every job's cultivation stat gains.

**Architecture:** Keep option derivation and parent state unchanged. `CultivationJobSelector` owns open/closed state, while a focused `CultivationJobPickerDialog` owns a temporary choice and commits it only when the user confirms.

**Tech Stack:** TypeScript, React 19, Next.js 16 Client Components, Tailwind CSS 4, Vitest

## Global Constraints

- Do not change cultivation calculations, API payloads, stored state, or balance data.
- Use `SURFACE_CARD`, `SURFACE_INSET`, and `SURFACE_ACCENT` for opaque panels and option cards.
- Preserve keyboard, focus, backdrop, and mobile safe-area behavior.
- Do not deploy.

---

### Task 1: Replace the Native Select With a Custom Picker

**Files:**
- Modify: `src/adventure/v2/CultivationActions.tsx`
- Test: `src/adventure/v2/CultivationActions.test.tsx`

**Interfaces:**
- Consumes: `CultivationJobOption[]`, selected job id, busy state, and `onChange(jobId)`
- Produces: `CultivationJobSelector` trigger and `CultivationJobPickerDialog`

- [ ] **Step 1: Write failing render-contract tests**

Change the selector test to require a dialog trigger containing the selected job name and `활력 +4 · 힘 +2`, and to reject a native `<select>`. Add a direct dialog render test requiring `role="dialog"`, `role="radiogroup"`, radio options with both job summaries, the selected `aria-checked="true"`, and `취소`/`선택 완료` controls.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/v2/CultivationActions.test.tsx`

Expected: FAIL because the selector is still native and the dialog export does not exist.

- [ ] **Step 3: Implement the custom selector and dialog**

In `CultivationActions.tsx`, import `CaretDown`, `Check`, and `X`; add `SURFACE_ACCENT`; replace `<select>` with a two-line button; and conditionally render `CultivationJobPickerDialog`. The dialog must maintain a temporary job id, render opaque radio cards, close without committing on cancel/backdrop/Escape, and call `onChange(pendingValue)` followed by `onClose()` on confirmation.

- [ ] **Step 4: Verify focused behavior**

Run: `npm test -- src/adventure/v2/CultivationActions.test.tsx src/adventure/v2/jobExplorer.test.ts`

Expected: both files pass with no warnings or unhandled errors.

- [ ] **Step 5: Verify lint and production build**

Run: `npx eslint src/adventure/v2/CultivationActions.tsx src/adventure/v2/CultivationActions.test.tsx`

Run: `npm run build`

Expected: both commands exit 0.

- [ ] **Step 6: Commit the completed change**

```bash
git add docs/superpowers/specs/2026-08-20-cultivation-job-custom-picker-design.md docs/superpowers/plans/2026-08-20-cultivation-job-custom-picker.md src/adventure/v2/CultivationActions.tsx src/adventure/v2/CultivationActions.test.tsx
git commit -m "feat: add cultivation job picker"
```
