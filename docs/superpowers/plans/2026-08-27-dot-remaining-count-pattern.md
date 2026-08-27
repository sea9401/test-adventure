# DoT Remaining Count Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this repository.

**Goal:** Let combat patterns compare poison and bleed by future damage-trigger count while preserving every existing stack condition.

**Architecture:** Add an optional metric discriminator to `enemy_status`; omission continues to mean stacks. Extend the shared pattern context with poison and bleed remaining turns, expose the choices in the editor, and populate them from authoritative DoT records in both PvE and PvP.

**Tech Stack:** TypeScript discriminated unions, React 19, v2 shared combat engine, PvE/PvP adapters, Vitest.

## Global Constraints

- Before editing, inspect `git diff` for every listed combat-pattern file and preserve the existing bloodline-burst work already present in the worktree.
- Existing conditions without `metric` must keep exact stack semantics.
- Only poison and bleed offer remaining-count comparisons; magic vulnerability and frost chill remain stack-only.
- Remaining count is the number of future DoT damage triggers and is zero when no active DoT exists.
- Do not change DoT damage, duration, tick timing, or balance.
- Do not deploy.

---

### Task 1: Pattern schema, normalization, and evaluation

**Files:**
- Modify: `src/adventure/v2/combat/combatPattern.ts`
- Modify: `src/adventure/v2/combat/combatPattern.test.ts`

**Interfaces:**
- Extends: `enemy_status` with `metric?: "stacks" | "remainingTurns"`; omitted means `"stacks"`.
- Extends: `V2PatternCtx` with `enemyBleedTurns: number` and `enemyPoisonTurns: number`.
- Preserves: numeric threshold property `stacks` for saved-data compatibility.

- [ ] **Step 1: Snapshot overlapping user changes**

Run: `git diff -- src/adventure/v2/combat/combatPattern.ts src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/V2CombatPatternView.tsx src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts`

Expected: existing bloodline-burst changes are visible and remain in place throughout this plan.

- [ ] **Step 2: Write failing evaluator and normalization tests**

Add contexts with `enemyPoison: 6`, `enemyPoisonTurns: 2`, `enemyBleed: 4`, and `enemyBleedTurns: 3`. Assert:

```ts
expect(conditionPasses({
  kind: "enemy_status", tag: "poison", metric: "remainingTurns",
  op: "atMost", stacks: 2,
}, ctx)).toBe(true);
expect(conditionPasses({
  kind: "enemy_status", tag: "poison", op: "atMost", stacks: 2,
}, ctx)).toBe(false); // omitted metric still checks six stacks
```

Normalization must preserve omitted/`stacks` as the legacy shape, allow `remainingTurns` only for poison/bleed, floor positive values, and reject/normalize `remainingTurns` for `vuln` and `frostChill` back to stacks.

- [ ] **Step 3: Run the pattern test and confirm failure**

Run: `npm test -- src/adventure/v2/combat/combatPattern.test.ts`

Expected: FAIL because the metric and context fields are missing.

- [ ] **Step 4: Implement metric-aware evaluation**

Add helpers equivalent to:

```ts
function enemyStatusValue(ctx: V2PatternCtx, cond: EnemyStatusCondition) {
  if (cond.metric === "remainingTurns") {
    return cond.tag === "poison" ? ctx.enemyPoisonTurns
      : cond.tag === "bleed" ? ctx.enemyBleedTurns
      : enemyStatusStacks(ctx, cond.tag);
  }
  return enemyStatusStacks(ctx, cond.tag);
}
```

Use the selected value for `none`, `atMost`, and `atLeast`. In normalization, emit `metric: "remainingTurns"` only for poison/bleed; omit it for stack conditions so existing serialized shapes remain stable.

- [ ] **Step 5: Run the pattern tests**

Run: `npm test -- src/adventure/v2/combat/combatPattern.test.ts`

Expected: PASS, including the pre-existing bloodline-burst assertions.

- [ ] **Step 6: Commit the schema unit without staging unrelated combat edits**

```bash
git add src/adventure/v2/combat/combatPattern.ts src/adventure/v2/combat/combatPattern.test.ts
git commit -m "feat: add remaining DoT pattern conditions"
```

### Task 2: Combat-pattern editor choices

**Files:**
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`
- Modify: `src/adventure/v2/V2CombatPatternView.test.tsx`

**Interfaces:**
- Consumes: the optional `metric` from Task 1.
- Produces: poison/bleed choices labeled `스택 이상`, `스택 이하`, `스택 없을 때`, `횟수 이상`, `횟수 이하`, and `횟수 없을 때`.

- [ ] **Step 1: Write failing editor tests**

Assert the option model returns remaining-count choices for poison and bleed but not for magic vulnerability or frost chill. Render/change a condition and assert the callback receives:

```ts
{
  kind: "enemy_status",
  tag: "poison",
  metric: "remainingTurns",
  op: "atMost",
  stacks: 2,
}
```

- [ ] **Step 2: Run the editor tests and confirm failure**

Run: `npm test -- src/adventure/v2/V2CombatPatternView.test.tsx`

Expected: FAIL because count choices do not exist.

- [ ] **Step 3: Implement status-specific choices**

Replace the single static operation array with a pure exported helper:

```ts
export function enemyStatusConditionOptions(tag: V2PatternEnemyStatus) {
  const stack = [
    { metric: "stacks" as const, op: "atLeast" as const, label: "스택 이상" },
    { metric: "stacks" as const, op: "atMost" as const, label: "스택 이하" },
    { metric: "stacks" as const, op: "none" as const, label: "스택 없을 때" },
  ];
  return tag === "poison" || tag === "bleed"
    ? [...stack,
        { metric: "remainingTurns" as const, op: "atLeast" as const, label: "횟수 이상" },
        { metric: "remainingTurns" as const, op: "atMost" as const, label: "횟수 이하" },
        { metric: "remainingTurns" as const, op: "none" as const, label: "횟수 없을 때" }]
    : stack;
}
```

When switching status tags to `vuln` or `frostChill`, reset an unsupported remaining-turn metric to stack mode. Keep the numeric input label aligned with the selected metric.

- [ ] **Step 4: Run editor tests**

Run: `npm test -- src/adventure/v2/V2CombatPatternView.test.tsx`

Expected: PASS, including existing bloodline-burst resource options.

- [ ] **Step 5: Commit the editor unit**

```bash
git add src/adventure/v2/V2CombatPatternView.tsx src/adventure/v2/V2CombatPatternView.test.tsx
git commit -m "feat: expose DoT count pattern choices"
```

### Task 3: Authoritative PvE and PvP remaining-turn wiring

**Files:**
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/combatPatternCast.test.ts`
- Modify: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`

**Interfaces:**
- Extends: `V2SkillCastInput.target` with `poisonTurns?: number` while retaining `bleedTurns?: number`.
- Populates: `enemyBleedTurns` and `enemyPoisonTurns` in `buildV2PatternCtx`.

- [ ] **Step 1: Write failing shared/PvE/PvP integration tests**

Equip a refresh skill behind `{ tag: "poison", metric: "remainingTurns", op: "atMost", stacks: 2 }`. Provide six poison stacks with two turns and assert the skill is selected; repeat with three turns and assert the fallback is selected. Add the equivalent PvP assertion using the opponent's active poison DoT record.

- [ ] **Step 2: Run the integration tests and confirm failure**

Run: `npm test -- src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`

Expected: FAIL because engines do not pass poison/bleed turns into pattern context.

- [ ] **Step 3: Populate the shared context**

In `buildV2PatternCtx`, add:

```ts
enemyBleedTurns: Math.max(0, Math.floor(t.bleedTurns ?? 0)),
enemyPoisonTurns: Math.max(0, Math.floor(t.poisonTurns ?? 0)),
```

- [ ] **Step 4: Pass authoritative DoT turns from both engines**

In PvE, resolve active bleed and poison entries from `state.enemyV2Dots` and pass both `stacks` and `turns` to the shared cast input. In PvP, do the same from the opponent's DoT collection. Do not derive turns from skill definitions or logs.

- [ ] **Step 5: Run focused and neighboring combat tests**

Run: `npm test -- src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/v2/combat/dotUnify.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit only the remaining-turn wiring hunks**

```bash
git add src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts
git commit -m "feat: evaluate DoT turns in PvE and PvP patterns"
```

### Task 4: Cross-feature verification

**Files:**
- No new files.

**Interfaces:**
- Verifies all tasks without modifying balance data.

- [ ] **Step 1: Run all focused suites**

Run: `npm test -- src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`

Expected: PASS.

- [ ] **Step 2: Run type checking**

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Run lint on touched files**

Run: `npx eslint src/adventure/v2/combat/combatPattern.ts src/adventure/v2/V2CombatPatternView.tsx src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts`

Expected: exit 0.
