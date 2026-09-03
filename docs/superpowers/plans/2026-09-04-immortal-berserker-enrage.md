# Immortal Berserker Enrage Boost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase the Immortal Berserker's second- and third-life attack and speed multipliers to the approved hardline values while preserving every other boss mechanic.

**Architecture:** Keep `immortalBerserkerMultipliers()` as the single source of truth for combat stats, revival logs, and replay resource labels. Update its constant table only after the unit and ATB expectations prove the old values no longer satisfy the approved contract.

**Tech Stack:** TypeScript, Vitest, Next.js project tooling, ESLint

## Global Constraints

- Life one remains attack `100%` and speed `100%`.
- Life two becomes attack `120%` and speed `110%`.
- Life three becomes attack `160%` and speed `125%`.
- Shared HP, `33% · 33% · 34%` life split, regeneration, skill selection, and boundary damage blocking do not change.
- Deployment is out of scope until the user explicitly requests it.

---

### Task 1: Strengthen revival enrage multipliers

**Files:**
- Modify: `src/adventure/v2/combat/immortalBerserkerMechanic.test.ts`
- Modify: `src/adventure/v2/combat/immortalBerserkerAtb.test.ts`
- Modify: `src/adventure/v2/combat/immortalBerserkerMechanic.ts`

**Interfaces:**
- Consumes: `immortalBerserkerMultipliers(lifeIndex: 0 | 1 | 2): { atkMult: number; spdMult: number }`
- Produces: life multiplier values consumed by ATB enemy stat scaling, revival logs, and replay snapshots without changing the public function signature.

- [ ] **Step 1: Write failing multiplier and integration expectations**

In `immortalBerserkerMechanic.test.ts`, change the multiplier contract and second-life display expectation to:

```ts
expect([0, 1, 2].map((life) => immortalBerserkerMultipliers(life as 0 | 1 | 2))).toEqual([
  { atkMult: 1, spdMult: 1 },
  { atkMult: 1.2, spdMult: 1.1 },
  { atkMult: 1.6, spdMult: 1.25 },
]);
```

```ts
atkMult: 1.2,
spdMult: 1.1,
```

In `immortalBerserkerAtb.test.ts`, change the second- and third-life expected effective stats to:

```ts
atk: 120,
spd: 110,
```

```ts
atk: 160,
spd: 125,
```

Change the first-revival log assertion to `공격력 +20%` and the replay resource expectation to:

```ts
immortalEnrage: "공격 +20% · 속도 +10%",
```

- [ ] **Step 2: Run the focused tests and verify the new expectations fail**

Run:

```bash
npx vitest run src/adventure/v2/combat/immortalBerserkerMechanic.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts --maxWorkers=1
```

Expected: FAIL because the implementation still returns `1.12/1.06` and `1.25/1.12`, and derived logs and ATB stats still reflect those values.

- [ ] **Step 3: Apply the approved multiplier table**

In `immortalBerserkerMechanic.ts`, replace only `MULTIPLIERS` with:

```ts
const MULTIPLIERS = [
  { atkMult: 1, spdMult: 1 },
  { atkMult: 1.2, spdMult: 1.1 },
  { atkMult: 1.6, spdMult: 1.25 },
] as const;
```

- [ ] **Step 4: Run focused and neighboring regressions**

Run:

```bash
npx vitest run src/adventure/v2/combat/immortalBerserkerMechanic.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts src/adventure/data/v2/unexploredBosses.test.ts --maxWorkers=1
```

Expected: PASS, including the unchanged catalog base-speed contract.

- [ ] **Step 5: Run static verification**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npx eslint src/adventure/v2/combat/immortalBerserkerMechanic.ts src/adventure/v2/combat/immortalBerserkerMechanic.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts
git diff --check
```

Expected: all commands exit successfully with no diagnostics.

- [ ] **Step 6: Review scope and commit**

Run:

```bash
git diff -- src/adventure/v2/combat/immortalBerserkerMechanic.ts src/adventure/v2/combat/immortalBerserkerMechanic.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts
git status --short
```

Confirm that only multiplier values and their direct expectations changed, then commit:

```bash
git add src/adventure/v2/combat/immortalBerserkerMechanic.ts src/adventure/v2/combat/immortalBerserkerMechanic.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts
git commit -m "balance: strengthen immortal berserker revivals"
```
