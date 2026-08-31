# Skill Ritual Reset Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an explicit confirmation before resetting a skill enhancement ritual.

**Architecture:** Add a focused `SkillRitualResetAction` component that owns confirmation visibility and delegates the destructive action only from `SkillRitualResetConfirmDialog`. Keep the existing reset request, refund calculation, and success/error state in `V2SkillLearnView` unchanged.

**Tech Stack:** TypeScript, React 19, Next.js 16 Client Components, Tailwind CSS 4, Vitest, Testing Library, jsdom

## Global Constraints

- Do not change skill ritual costs, refunds, API payloads, or server behavior.
- Use `SURFACE_CARD`, `SURFACE_INSET`, and `SURFACE_ACCENT` for the new opaque dialog surfaces.
- Support cancel, backdrop, Escape, focus trapping, scroll locking, and the mobile bottom safe area.
- Do not deploy.

---

### Task 1: Guard Skill Ritual Reset With Confirmation

**Files:**
- Modify: `src/adventure/v2/V2SkillLearnView.tsx`
- Create: `src/adventure/v2/SkillRitualResetAction.test.tsx`

**Interfaces:**
- Consumes: skill name, ritual mode, ritual level, refund values, busy state, and the existing `resetRitual(skillId)` callback
- Produces: `SkillRitualResetAction` and `SkillRitualResetConfirmDialog`

- [ ] **Step 1: Write the failing interaction test**

Render `SkillRitualResetAction` with a spy callback. Click `초기화` and assert that the confirmation dialog opens without invoking the callback. Cancel, reopen, click `강화 초기화 확정`, and assert that the callback is invoked exactly once. Also assert that the dialog shows the skill name, current ritual stage, both refund values, the 50% refund warning, and the irreversible warning.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/v2/SkillRitualResetAction.test.tsx`

Expected: FAIL because `SkillRitualResetAction` does not exist.

- [ ] **Step 3: Implement the action and confirmation dialog**

Export `SkillRitualResetAction` and `SkillRitualResetConfirmDialog` from `V2SkillLearnView.tsx`. The action opens the dialog on the first click. The dialog uses `useModalA11y`, `useEscapeKey`, opaque surface tokens, and only calls `onConfirm` from `강화 초기화 확정`.

- [ ] **Step 4: Wire the action into the ritual detail footer**

Replace the direct `onClick={() => resetRitual(ritualTarget.skillId)}` button with `SkillRitualResetAction`, passing `ritualTarget.name`, `currentRitualMode`, `ritualLevel`, `currentRefund`, the matching busy flag, and a callback that invokes the existing `resetRitual` function.

- [ ] **Step 5: Verify focused behavior and nearby regressions**

Run: `npm test -- src/adventure/v2/SkillRitualResetAction.test.tsx src/adventure/v2/V2SkillLearnView.test.tsx src/adventure/data/v2/skillRitual.test.ts src/lib/server/skillRitualRoute.test.ts`

Expected: all selected test files pass with no unhandled errors.

- [ ] **Step 6: Verify static checks and production build**

Run: `npx eslint src/adventure/v2/V2SkillLearnView.tsx src/adventure/v2/SkillRitualResetAction.test.tsx`

Run: `npx tsc --noEmit`

Run: `npm run build`

Expected: every command exits 0.

- [ ] **Step 7: Commit the completed change**

```bash
git add docs/superpowers/specs/2026-08-20-skill-ritual-reset-confirmation-design.md docs/superpowers/plans/2026-08-20-skill-ritual-reset-confirmation.md src/adventure/v2/V2SkillLearnView.tsx src/adventure/v2/SkillRitualResetAction.test.tsx
git commit -m "fix: confirm skill ritual reset"
```
