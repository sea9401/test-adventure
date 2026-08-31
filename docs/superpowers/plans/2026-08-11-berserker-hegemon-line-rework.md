# Berserker–Hegemon Line Rework Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the 광전사→패왕 lineage play as a deliberate HP-risk combat loop, while preventing passive stacking and preserving custom combat patterns.

**Architecture:** Store each lineage active's default combat condition and priority alongside the skill definition, then have the smart-pattern builder consume that metadata without touching saved custom patterns. Model the four lineage passives as a ranked exclusive group; validation rejects conflicts, sanitization keeps the highest rank, and passive aggregation applies the same rule defensively.

**Tech Stack:** TypeScript, Next.js App Router, React, Vitest, Testing Library

**Constraints:** Do not deploy. Do not create subagents. Preserve unrelated worktree changes. Use regression tests before behavior changes and commit each coherent task.

---

### Task 1: Encode the lineage skill contract

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`
- Test: `src/adventure/data/v2/v2SkillsByJob.test.ts`

**Step 1: Write failing catalog tests**

Add assertions for the approved contract:

```ts
expect(V2_SKILLS.v2c_warlord_bloodbath.effects).toContainEqual({
  kind: "selfBuffPct",
  target: "crit",
  pct: 12,
  turns: 3,
});
expect(V2_SKILLS.v2c_hegemon_annihilation.effects.some((effect) => effect.kind === "executeDamage")).toBe(false);
expect(V2_SKILLS.v2c_hegemon_dominion.passiveEffects).not.toContainEqual(
  expect.objectContaining({ kind: "maxHpPct" }),
);
expect(V2_SKILLS.v2c_warlord_bloodbath.spCost).toBe(7);
expect(V2_SKILLS.v2c_hegemon_annihilation.spCost).toBe(13);
expect(V2_SKILLS.v2c_hegemon_dominion.spCost).toBe(15);
```

Also assert the four default priorities/conditions and the ranked `berserker_madness` exclusive metadata.

**Step 2: Run the focused tests and confirm RED**

Run:

```bash
npx vitest run src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts
```

Expected: failures for missing crit buff/default metadata/exclusive metadata and the old execute/max-HP effects or SP costs.

**Step 3: Add metadata types and update the catalog**

Extend `V2SkillDefinition`:

```ts
defaultPattern?: {
  priority: number;
  condition: V2CombatCondition;
};
exclusiveGroup?: string;
exclusiveRank?: number;
```

Apply the approved active flow:

- 파멸난무: enemy HP ≤ 35%, priority 400
- 패왕섬멸: self HP ≤ 50% and enemy vulnerability inactive, priority 300
- 피의 향연: self HP ≤ 85% and crit-percent buff inactive, priority 200
- 혈참: self HP ≥ 85%, priority 100

Apply passive group `berserker_madness` with ranks 1–4. Add the crit buff to 피의 향연, remove execute from 패왕섬멸, and remove max-HP from 패왕의 지배. Update descriptions to match the actual effects.

**Step 4: Run the focused tests and confirm GREEN**

Run the same Vitest command. Expected: pass.

**Step 5: Commit**

```bash
git add src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts
git commit -m "feat: rebalance berserker hegemon skills"
```

### Task 2: Drive smart defaults from skill metadata

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Test: `src/adventure/v2/combat/combatPatternCast.test.ts`

**Step 1: Write failing smart-pattern tests**

Equip the four actives in deliberately scrambled order and assert the generated blocks are:

```ts
[
  "v2c_overlord_ruin",
  "v2c_hegemon_annihilation",
  "v2c_warlord_bloodbath",
  "v2c_berserker_bloodslash",
]
```

Assert the exact approved conditions. Add selection cases for high HP, mid HP, low HP, and enemy execute range. Include the 85% boundary: both HP predicates match, so 피의 향연 wins by priority. Retain a regression assertion that a non-empty saved custom pattern is returned unchanged.

**Step 2: Run the focused test and confirm RED**

Run:

```bash
npx vitest run src/adventure/v2/combat/combatPatternCast.test.ts
```

Expected: current equipped-order smart pattern does not produce the new priority flow.

**Step 3: Implement stable priority ordering**

Keep once-per-battle evade openers first. For remaining active skills:

- sort skills with `defaultPattern` by descending priority;
- keep equal priorities stable;
- keep skills without metadata in their original relative order after metadata-driven skills;
- use `defaultPattern.condition` when present and fall back to `smartDefaultConditionForSkill` otherwise.

Do not alter `effectiveCombatPatternFromEquipped` handling of non-empty saved patterns.

**Step 4: Run the focused test and confirm GREEN**

Run the same Vitest command. Expected: pass.

**Step 5: Commit**

```bash
git add src/adventure/data/v2/v2Skills.ts src/adventure/v2/combat/combatPatternCast.test.ts
git commit -m "feat: prioritize berserker smart combat flow"
```

### Task 3: Enforce ranked passive exclusivity

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2Loadout.ts`
- Test: `src/adventure/data/v2/v2Loadout.test.ts`
- Test: `src/adventure/data/v2/v2SkillsByJob.test.ts`

**Step 1: Write failing exclusivity tests**

Cover all three layers:

- `validateLoadout` reports a `berserker_madness` conflict and `ok: false` when two ranks are equipped;
- `sanitizeLoadout` retains the highest rank, with original order breaking equal-rank ties;
- a lower rank equipped alone remains valid;
- `aggregateEquippedPassives` applies only 패왕의 지배 when all four ranks are passed directly, proving the defensive path does not stack lower tiers.

**Step 2: Run the focused tests and confirm RED**

Run:

```bash
npx vitest run src/adventure/data/v2/v2Loadout.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts
```

Expected: conflicts are accepted and passive effects stack.

**Step 3: Implement shared exclusive resolution**

In `v2Skills.ts`, export:

```ts
export type V2ExclusiveSkillConflict = {
  group: string;
  skillIds: V2SkillId[];
};

export function exclusiveSkillConflicts(ids: readonly V2SkillId[]): V2ExclusiveSkillConflict[];
export function resolveExclusiveSkills(ids: readonly V2SkillId[]): V2SkillId[];
```

Resolution chooses the greatest `exclusiveRank`; equal ranks keep the first occurrence. Make passive aggregation iterate the resolved list.

In `v2Loadout.ts`, add `exclusiveConflicts` to `LoadoutCheck`, include conflicts in `ok`, and resolve valid known/learned IDs before budget clamping during sanitization. Continue calculating requested SP normally during validation so the report remains truthful.

**Step 4: Run the focused tests and confirm GREEN**

Run the same Vitest command. Expected: pass.

**Step 5: Commit**

```bash
git add src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Loadout.ts src/adventure/data/v2/v2Loadout.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts
git commit -m "feat: enforce exclusive berserker passives"
```

### Task 4: Surface exclusive conflicts in the API and UI

**Files:**
- Modify: `src/app/api/v2/me/loadout/route.ts`
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`
- Test: `src/adventure/v2/V2LoadoutPanel.test.tsx`

**Step 1: Write failing panel tests**

Export a small pure helper that returns the conflict message for a candidate loadout. Assert:

```ts
expect(loadoutExclusiveConflictMessage([
  "v2c_berserker_madness3",
  "v2c_hegemon_dominion",
])).toBe("광기 계열은 하나만 장착할 수 있습니다.");
```

Also render a lineage passive card and assert it exposes the label `같은 계열 1개만 장착`.

**Step 2: Run the panel test and confirm RED**

Run:

```bash
npx vitest run src/adventure/v2/V2LoadoutPanel.test.tsx
```

Expected: helper/label do not exist.

**Step 3: Implement API and panel feedback**

- Include `exclusiveConflicts` in the route's 400 response.
- Before saving an added skill, detect an exclusive conflict, show the Korean message, and leave the current loadout untouched.
- If the server still returns conflicts, show the same message as a defensive fallback.
- Mark exclusive passive cards with the one-per-group label.

Use existing opaque surface classes; do not introduce new translucent containers.

**Step 4: Run the panel test and confirm GREEN**

Run the same Vitest command. Expected: pass.

**Step 5: Commit**

```bash
git add src/app/api/v2/me/loadout/route.ts src/adventure/v2/V2LoadoutPanel.tsx src/adventure/v2/V2LoadoutPanel.test.tsx
git commit -m "feat: explain exclusive passive loadouts"
```

### Task 5: Verify combat integration and balance invariants

**Files:**
- Test: `src/adventure/v2/combat/combatPatternCast.test.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`

**Step 1: Add integration regressions where coverage is missing**

Verify actual cast resolution, not only catalog objects:

- 피의 향연 costs current HP using the existing nonlethal rule and applies crit +12% for 3 turns on hit;
- 패왕섬멸 still applies vulnerability 12%/3 turns and healing reduction 50%/2 turns, without execute damage;
- miss behavior still cancels hit-gated effects;
- the four active SP costs sum to 36, the selected 패왕 passive costs 15, and the complete final loadout totals exactly 51 SP;
- the same default pattern selection contract is valid for PvE and PvP inputs.

**Step 2: Run integration and full verification**

Run:

```bash
npx vitest run src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/data/v2/v2Skills.test.ts
npx tsc --noEmit
npx eslint src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2Loadout.ts src/app/api/v2/me/loadout/route.ts src/adventure/v2/V2LoadoutPanel.tsx
npm test
npm run check-images
```

Expected: all commands pass. If a command fails, fix only failures caused by this change and rerun the affected command plus the full suite.

**Step 3: Run fixed-seed balance simulations**

Inspect the project simulation CLI options, then run the existing fixed-seed level-design simulation for representative early, mid, and final progression depths. Record clear rate, turn count, HP risk/death signals, and whether the four actives are exercised in the targeted combat regressions. Do not alter global proc, MP, or rebalance constants in response to noise from a single run.

**Step 4: Review the diff and commit remaining integration tests**

```bash
git diff --check
git status --short
git diff -- src/adventure src/app/api/v2/me/loadout/route.ts
git add src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/data/v2/v2Skills.test.ts
git commit -m "test: cover berserker hegemon combat flow"
```

If Task 5 required no new file changes, skip the empty commit.

**Step 5: Final handoff**

Report the implemented flow, exclusivity behavior, exact SP total, focused/full verification results, and simulation observations. Explicitly state that no deployment was performed.
