# Unexplored Entry Resource-Growth Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebalance unexplored difficulties 95–105 against the deployed life HP/MP growth formula while preserving the existing 110–120 long-term wall.

**Architecture:** Add a pure, interpolated resource-growth compensation curve beside the existing high-difficulty overlay. Apply it once at the unexplored monster generator boundary to HP, ATK, DEF, and MDEF; do not change speed, mechanics, combat, rewards, or the shared hunt scaler. Calibrate the anchors with the existing anonymous SELECT-only live top-30 simulator.

**Tech Stack:** TypeScript, Vitest, existing unexplored simulation generator, existing production-revision simulation runner.

## Global Constraints

- Keep the displayed and simulated difficulty range at 95–120; difficulty 90 remains a diagnostic anchor.
- Target mechanics win rates: 95 at 30–40%, 100 at 20–30%, 105 at 10–20%, and 110 at 0–10%.
- The extra compensation must be exactly neutral at 110 and above.
- Do not change monster speed bands, abilities, pool identities, drops, rewards, the combat engine, or `monsterScale`.
- Production access remains one connection and SELECT-only. Do not deploy.

---

### Task 1: Add and apply the entry compensation curve

**Files:**
- Modify: `src/adventure/data/v2/unexploredSimulationBalance.test.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationBalance.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.test.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.ts`
- Update after calibration: `docs/superpowers/specs/2026-08-28-unexplored-difficulty-reward-nodes-design.md`

**Interfaces:**
- Produces: `unexploredResourceGrowthCompensation(difficulty)` returning `{ hp, atk, def }` for every integer difficulty from 90 through 120.
- Consumes: the compensation once in `unexploredBaseProxyMonsters` and `unexploredSpecialMonsters`, after the shared hunt baseline and alongside the existing high-difficulty multiplier.

- [x] **Step 1: Write failing pure-curve tests**

Assert literal compensation anchors, integer interpolation, neutrality outside the entry band, and unchanged validation errors. The initial live pass may replace the first candidate with calibrated anchors; the accepted anchors are recorded in the tests and design result.

- [x] **Step 2: Verify RED**

Run: `npx vitest run src/adventure/data/v2/unexploredSimulationBalance.test.ts`

Expected: FAIL because `unexploredResourceGrowthCompensation` is not exported.

- [x] **Step 3: Implement the pure interpolated curve**

Reuse the existing difficulty validation and interpolation boundary. Stabilize floating-point results to eight decimal places, as the high-difficulty overlay already does.

- [x] **Step 4: Verify the pure curve GREEN**

Run: `npx vitest run src/adventure/data/v2/unexploredSimulationBalance.test.ts`

Expected: PASS.

- [x] **Step 5: Write failing generator tests**

Update exact representative monster expectations at 95, 100, 105, and 110. Assert 110 representatives remain byte-for-byte equal to the accepted candidate and all anchor difficulties remain strictly monotonic in HP, ATK, DEF, and MDEF.

- [x] **Step 6: Verify generator RED**

Run: `npx vitest run src/adventure/data/v2/unexploredSimulationMonsters.test.ts`

Expected: FAIL because the generator has not applied the new compensation.

- [x] **Step 7: Apply the compensation once at the generator boundary**

Multiply HP by `compensation.hp`, compensated ATK by `compensation.atk`, and both defenses by `compensation.def`. Round only final monster stats. Do not alter speed, accuracy, evasion, skills, EXP, or drops.

- [x] **Step 8: Verify generator GREEN and static checks**

Run:

```bash
npx vitest run src/adventure/data/v2/unexploredSimulationBalance.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredSimulationAnalysis.test.ts
npx eslint src/adventure/data/v2/unexploredSimulationBalance.ts src/adventure/data/v2/unexploredSimulationBalance.test.ts src/adventure/data/v2/unexploredSimulationMonsters.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 9: Calibrate on the deployed HP/MP formula**

Run the anonymous top-30 simulation against production revision `571b5667` with 30 trials per monster and the fixed seed. If a target band fails, change only the compensation anchors, update the literal tests first, and rerun. Keep the 110+ compensation at exactly 1.

- [x] **Step 10: Record the accepted result and commit**

Append the final mechanics rates and compensation anchors to the existing unexplored difficulty design. Run focused tests and static checks again, then commit only the plan, balance, generator, tests, and design files.
