# Healing Stat Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the player's authoritative final healing multiplier as a percentage in the character detail stats.

**Architecture:** Pass the already-derived `combat.player.healMult` through the pure `/api/v2/me/state` combat section without changing combat calculations. Extend the existing `StatsPanel` combat item builder to render that optional field as a one-decimal percentage and document the response field in `V2CharacterScreen`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, React server rendering tests, Tailwind CSS

## Global Constraints

- Display `healMult: 1.2744` as `127.4%` under the label `회복량`.
- Display `100.0%` when the authoritative field is present with value `1`.
- Omit the row when `healMult` is absent so legacy callers remain unchanged.
- Reuse the existing opaque `SURFACE_INSET` combat stat cells in light and dark modes.
- Do not alter healing formulas, combat behavior, equipment/skill balance, potion/healing-center/stamina UI, APIs other than the added response field, deployment, or maintenance state.
- Preserve unrelated working-tree changes and do not create subagents.

---

### Task 1: Expose Final Healing Multiplier in Character State

**Files:**
- Modify: `src/app/api/v2/me/state/stateSections.test.ts`
- Modify: `src/app/api/v2/me/state/stateSections.ts`

**Interfaces:**
- Consumes: `DerivedPlayerCombatV2.player.healMult: number`.
- Produces: `combatStatsSection(...).healMult: number` when combat data exists.

- [x] **Step 1: Write the failing API boundary test**

Import `combatStatsSection` and add a test using a literal derived-combat fixture:

```ts
it("최종 회복량 배율을 캐릭터 전투 스탯에 전달한다", () => {
  const combat = {
    player: {
      atk: 10,
      def: 8,
      spd: 7,
      healMult: 1.2744,
    },
  } as unknown as NonNullable<Parameters<typeof combatStatsSection>[0]>;

  expect(combatStatsSection(combat, 100, 50)).toMatchObject({
    healMult: 1.2744,
  });
});
```

This catches the response mapper dropping the authoritative derived value.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/app/api/v2/me/state/stateSections.test.ts`

Expected: FAIL because the returned combat section has no `healMult` field.

- [x] **Step 3: Add the minimal response mapping**

Add the following property to `combatStatsSection` beside the other derived support stats:

```ts
healMult: combat.player.healMult ?? 1,
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/app/api/v2/me/state/stateSections.test.ts`

Expected: all state section tests PASS.

---

### Task 2: Render Healing Percentage in Detailed Stats

**Files:**
- Modify: `src/adventure/character/StatsPanel.test.ts`
- Modify: `src/adventure/character/StatsPanel.tsx`
- Modify: `src/adventure/v2/V2CharacterScreen.tsx`

**Interfaces:**
- Consumes: optional `combat.healMult?: number` from the character-state response.
- Produces: a `회복량` combat item whose value is `(healMult * 100).toFixed(1) + "%"`.

- [x] **Step 1: Write the failing render test**

Render the real `StatsPanel` with a complete literal combat fixture that includes `healMult: 1.2744`, then assert the consumer-visible label and value:

```ts
const html = renderToStaticMarkup(
  createElement(StatsPanel, {
    stats: { str: 1 },
    statKeys: ["str"],
    statLabels: { str: "힘" },
    combat: {
      atk: 10,
      def: 5,
      healMult: 1.2744,
    },
  }),
);

expect(html).toContain("회복량");
expect(html).toContain("127.4%");
```

This catches a missing row, using the internal multiplier directly, or incorrect percentage rounding.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/character/StatsPanel.test.ts`

Expected: FAIL because `StatsPanel` does not accept or render `healMult`.

- [x] **Step 3: Add the minimal display mapping and response type**

Add `healMult?: number` to `CombatStats` and `StateResponse.combat`. Add this tooltip description:

```ts
회복량:
  "회복 스킬·흡혈·일부 자가 회복에 적용되는 최종 배율입니다. 정신과 활력이 높을수록 커지며 장비의 회복 옵션과 장착 패시브도 반영됩니다.",
```

Append the combat item only when the field exists:

```ts
if (combat.healMult !== undefined) {
  items.push({
    label: "회복량",
    value: `${(combat.healMult * 100).toFixed(1)}%`,
    accent: "text-emerald-600 dark:text-emerald-400",
  });
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/adventure/character/StatsPanel.test.ts`

Expected: all StatsPanel tests PASS.

- [x] **Step 5: Run related and full verification**

Run: `npm test -- src/app/api/v2/me/state/stateSections.test.ts src/adventure/character/StatsPanel.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

Run: `npx tsc --noEmit`

Run: `npm test`

Expected: related tests, TypeScript, and the full suite all exit with status 0.

- [x] **Step 6: Review and commit**

Inspect `git diff --check`, the scoped diff, staged file names, and `git status --short`. Confirm unrelated files remain untouched, then commit only this plan and the five production/test files:

```bash
git add docs/superpowers/plans/2026-08-09-healing-stat-display.md src/app/api/v2/me/state/stateSections.test.ts src/app/api/v2/me/state/stateSections.ts src/adventure/character/StatsPanel.test.ts src/adventure/character/StatsPanel.tsx src/adventure/v2/V2CharacterScreen.tsx
git commit -m "feat: show healing multiplier in character stats"
```
