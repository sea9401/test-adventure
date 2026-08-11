# Multi-Hit Battle Log Action Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every multi-hit skill cast as one action card with an immediately visible hit count, total damage, and per-hit damage breakdown.

**Architecture:** Keep combat engines and serialized `BattleLogEntry[]` unchanged. Extend the pure display grouping in `BattleLogList.tsx` so contiguous same-side, same-title damage entries from one action tick share an action item, then derive aggregate and per-hit labels in `ActionCard`.

**Tech Stack:** TypeScript, React Client Components, Vitest, React server static rendering, Tailwind surface tokens.

## Global Constraints

- Preserve current single-hit, effect, calculation-detail, lane, and legacy replay behavior.
- Use `SURFACE_CARD` and `SURFACE_INSET`; do not introduce translucent content surfaces.
- Do not modify combat damage calculations or the `BattleLogEntry` serialization shape.
- Do not deploy.

---

### Task 1: Group and render multi-hit skill casts

**Files:**
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Test: `src/adventure/battle/BattleLogList.test.tsx`

**Interfaces:**
- Consumes: `groupBattleLogActions(entries: BattleLogEntry[]): BattleLogDisplayItem[]`, `actionHeadline(text: string)` and existing `BattleLogEntry.turn`/`t` metadata.
- Produces: action display items with `hits: BattleLogEntry[]`; one rendered action card containing `N타 · 총 X 피해` and the literal per-hit values.

- [ ] **Step 1: Write failing grouping and rendering tests**

Add literal fixtures for three contiguous `천궁궤적!` damage entries at the same tick and assert that `groupBattleLogActions` returns one action with three hits. Render the same fixture and assert `3타`, `총 600 피해`, `1타 100`, `2타 200`, and `3타 300` are present. Add a fixture with the same title at different ticks and assert two actions remain.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/adventure/battle/BattleLogList.test.tsx`

Expected: FAIL because every direct damage entry currently flushes the preceding action and renders a separate card.

- [ ] **Step 3: Implement minimal display grouping**

Extend the action variant with:

```ts
hits: BattleLogEntry[];
```

Initialize it as `[entry]`. Before flushing on the next direct action, merge only when both entries have numeric damage results, their non-basic action titles and sides match, their defined `t` values match, and no effect has already closed the hit sequence.

- [ ] **Step 4: Render aggregate and immediate per-hit values**

For `hits.length > 1`, sum parsed damage values and render `N타 · 총 X 피해` in the existing result column. In the existing opaque inset area, render a wrapping list with literal `1타 X`, `2타 Y`, and subsequent hit labels before the existing effects.

- [ ] **Step 5: Run focused and neighboring tests**

Run: `npm test -- --run src/adventure/battle/BattleLogList.test.tsx src/adventure/battle/battleLogGrouping.test.ts`

Expected: both files pass with zero failures.

- [ ] **Step 6: Run static verification and commit**

Run: `npx eslint src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx`

Run: `npx tsc --noEmit`

Run: `git diff --check`

Stage only the two battle-log source/test files and these design/plan documents, then commit with `feat: group multi-hit battle log cards`.
