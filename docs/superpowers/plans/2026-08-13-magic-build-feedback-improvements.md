# Magic Build Feedback Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct overheal-to-shield behavior, include omitted magic/support survivability in combat power, and warn players when their growth direction conflicts with their equipped attack axis.

**Architecture:** Keep combat calculations in existing pure helpers, centralize player-to-power input mapping to prevent route drift, and compute a serializable build advisory on the server for the self profile. UI changes remain inside the existing character basics card and reuse the shared opaque surface tokens.

**Tech Stack:** TypeScript, React, Next.js App Router, Vitest

## Global Constraints

- Do not change magic skill damage coefficients or evasion mitigation.
- Do not deploy.
- Use opaque shared surface tokens for the new warning panel.
- Preserve the current rule that `on_heal` requires at least one point of actual HP recovery.

---

### Task 1: Overheal shield calculation

**Files:**
- Modify: `src/adventure/v2/combat/signatureEffects.ts`
- Modify: `src/adventure/v2/combat/signatureEffects.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Test: existing combat signature and engine tests

**Interfaces:**
- Consumes: `SignatureEffect[]`, actual heal, calculated heal, maximum HP
- Produces: `healToShield(signatures, { actualHeal, calculatedHeal, maxHp })`

- [ ] **Step 1: Write failing helper and engine tests**

Add literal expectations for a 3,000 calculated / 1,000 actual heal producing a 1,050 shield at 4,000 HP, a 30% max-HP cap, and no trigger at zero actual healing. Add an engine assertion that an overflowing healing skill reports both values.

- [ ] **Step 2: Run tests and verify the expected failures**

Run: `npm test -- src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/engine.test.ts`

- [ ] **Step 3: Implement the helper contract and update all call sites**

Use calculated healing for the percentage, clamp the combined result to `Math.floor(maxHp * 0.3)`, retain the actual-heal gate, and pass each healing source's pre-HP-clamp amount.

- [ ] **Step 4: Run focused combat tests**

Run: `npm test -- src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/engine.test.ts src/adventure/v2/combat/combatPvpAtb.test.ts`

### Task 2: Combat power completeness

**Files:**
- Modify: `src/adventure/data/v2/power.ts`
- Modify: `src/adventure/data/v2/power.test.ts`
- Create: `src/lib/server/playerPowerInput.ts`
- Create: `src/lib/server/playerPowerInput.test.ts`
- Modify: all `derivePowerScore` callers under `src/app/api/`

**Interfaces:**
- Consumes: `PlayerCombat`, `maxHp`, optional `maxMp`
- Produces: `powerInputFromPlayer(player, maxHp, maxMp): V2PowerInput`

- [ ] **Step 1: Write failing formula and mapper tests**

Add hand-calculated literal expectations proving independent magic-defense, critical, damage-reduction, and healing contributions and complete field mapping.

- [ ] **Step 2: Run tests and verify the expected failures**

Run: `npm test -- src/adventure/data/v2/power.test.ts src/lib/server/playerPowerInput.test.ts`

- [ ] **Step 3: Implement formula helpers and the shared mapper**

Add effective defense, conservative critical expected value, effective-health damage-reduction contribution, and capped healing support. Replace duplicated route object literals with the mapper.

- [ ] **Step 4: Run power and route tests**

Run: `npm test -- src/adventure/data/v2/power.test.ts src/lib/server/playerPowerInput.test.ts src/app/api/rankings/route.test.ts`

### Task 3: Build alignment advisory

**Files:**
- Create: `src/adventure/data/v2/buildAlignment.ts`
- Create: `src/adventure/data/v2/buildAlignment.test.ts`
- Modify: `src/app/api/v2/me/state/route.ts`
- Modify: `src/adventure/v2/V2CharacterScreen.tsx`
- Modify: `src/adventure/v2/V2CharacterBasics.tsx`
- Create: `src/adventure/v2/V2CharacterBasics.test.tsx`
- Modify: `src/app/dev/character-basics/page.tsx`

**Interfaces:**
- Consumes: base/grown stats, current job bonus, physical and magic attack
- Produces: `deriveBuildAlignmentAdvisory(input): BuildAlignmentAdvisory | null`

- [ ] **Step 1: Write failing advisory and component tests**

Cover magic gear with physical growth/job bonus, aligned magic, aligned physical, neutral LUK/VIT, and self-only warning rendering.

- [ ] **Step 2: Run tests and verify the expected failures**

Run: `npm test -- src/adventure/data/v2/buildAlignment.test.ts src/adventure/v2/V2CharacterBasics.test.tsx`

- [ ] **Step 3: Implement advisory derivation and API/UI wiring**

Compute the advisory server-side from saved growth, current job bonus, and derived attacks; return it only from `/api/v2/me/state`; render it inside the basics card with `SURFACE_ACCENT`.

- [ ] **Step 4: Run focused UI and state tests**

Run: `npm test -- src/adventure/data/v2/buildAlignment.test.ts src/adventure/v2/V2CharacterBasics.test.tsx src/adventure/character/StatsPanel.test.ts`

### Task 4: Full verification and commit

**Files:**
- Verify all modified files

- [ ] **Step 1: Run the affected test suite**

Run: `npm test -- src/adventure/data/v2/power.test.ts src/lib/server/playerPowerInput.test.ts src/adventure/data/v2/buildAlignment.test.ts src/adventure/v2/V2CharacterBasics.test.tsx src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/engine.test.ts src/adventure/v2/combat/combatPvpAtb.test.ts src/app/api/rankings/route.test.ts`

- [ ] **Step 2: Run static validation**

Run: `npx tsc --noEmit`

Run: `npx eslint` against modified TypeScript files.

- [ ] **Step 3: Inspect the final diff and commit only scoped files**

Run: `git diff --check`, inspect `git diff`, stage only files from this plan, and commit with a scoped Korean message.
