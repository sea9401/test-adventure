# PvP Reflect Mitigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the better of defense mitigation and PvP evasion mitigation to every reflected-damage path in PvP, remove the two job-specific reflect-reduction passives, and reduce their SP costs by one.

**Architecture:** Add one shared PvP reflect-mitigation helper in `engine-pvp.ts` and route both on-hit and dodge reflection through it before the existing arena multiplier and shield stages. Keep counters and the PvE engine unchanged. Remove the obsolete reflect-only passive field across catalog, aggregation, derivation, and combat state, while adding a narrow post-rubric `spCostDiscount` field for the one skill whose recalculated cost does not naturally fall after the effect removal.

**Tech Stack:** TypeScript, Vitest, React server rendering tests, Next.js 16

## Global Constraints

- Apply the new rule to every combat surface that uses `engine-pvp`, including arena, tournament, sparring, and outpost combat.
- Apply it only to reflected damage: 반사 갑주, 가시 갑옷, 수호 반사, 무한 가시, and 반사 회피.
- Do not change normal counters, rune counters, reflect coefficients, trigger conditions, or any PvE reflection behavior.
- Defense and evasion are alternative candidates; choose the lower damage and never apply them sequentially.
- Preserve the existing order after mitigation: combat-surface damage multiplier, normal shield, then HP.
- Remove `받는 반사 피해 -20%` from 패황의 지배 and 대마도 이론.
- Set 패황의 지배 to 14 SP and 대마도 이론 to 15 SP without changing their remaining effects.
- Preserve existing learned skills and saved loadouts; no save migration is required.
- Do not deploy.

---

### Task 1: Shared PvP reflection mitigation

**Files:**
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Test: `src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts`
- Test: `src/adventure/battle/engine-pvp.test.ts`

**Interfaces:**
- Consumes: `playerPvpEvasionReductionPct(state, who)`, `applyEvasionDamageReduction(damage, reductionPct)`, `attackerFacingDef(attacker, defender)`, `damageBetween(atk, def)`, and `v2DefBuffMult(...)`.
- Produces: `mitigatePvPReflectDamage(state, recipientKey, reflectorKey, rawDamage): number`, used by both `applyOnHitReflect` and `applyDodgeEffects`.

- [ ] **Step 1: Add failing on-hit reflection tests**

In `engine.pvpDamageMultiplier.test.ts`, add a test where the reflection recipient has `def: 20`, `evaRating: 300`, and the reflector has `accRating: 50`. With a 100-point reflected raw amount, defense produces 80 while PvP evasion produces 43, so the result must be 43 rather than the sequentially stacked result of 34.

```ts
it("반사는 방어 감산과 PvP 회피 경감 중 낮은 피해만 적용한다", () => {
  const receiver = { ...BASE, def: 20, evaRating: 300 };
  const reflector = { ...BASE, accRating: 50, thornsPct: 100 };
  const result = applyOnHitReflect(
    stateWith(undefined, receiver, reflector),
    "p1",
    "p2",
    100,
  ).state;

  expect(BASE.hp - result.p1.hp).toBe(43);
});
```

- [ ] **Step 2: Run the on-hit tests and verify RED**

Run:

```bash
npm test -- --run src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts -t "반사는 방어 감산과 PvP 회피 경감 중 낮은 피해만 적용한다"
```

Expected: the new test fails because current reflection uses only `damageBetween` and returns the 80-point defense candidate.

- [ ] **Step 3: Implement the shared mitigation helper and use it for on-hit reflection**

Import `applyEvasionDamageReduction` into `engine-pvp.ts`. Add the helper next to `playerPvpEvasionReductionPct`:

```ts
export function mitigatePvPReflectDamage(
  state: PvPBattleState,
  recipientKey: "p1" | "p2",
  reflectorKey: "p1" | "p2",
  rawDamage: number,
): number {
  if (rawDamage <= 0) return 0;
  const recipient = state[recipientKey];
  const reflector = state[reflectorKey];
  const defMult = v2DefBuffMult(
    recipient.v2SelfBuffs,
    recipient.v2SelfDebuffs,
  );
  const effectiveDef = attackerFacingDef(reflector, recipient);
  const defenseDamage = damageBetween(
    rawDamage,
    defMult !== 1 ? Math.floor(effectiveDef * defMult) : effectiveDef,
  );
  const evasionDamage = applyEvasionDamageReduction(
    rawDamage,
    playerPvpEvasionReductionPct(state, recipientKey),
  );
  return Math.min(defenseDamage, evasionDamage);
}
```

In `applyOnHitReflect`, replace its local defense calculation with `mitigatePvPReflectDamage(state, atkKey, defKey, reducedRawTotal)`, then pass that result to the existing `scalePvPDamage`. Keep the reflect-only reduction stage temporarily; Task 2 removes it after its catalog tests are red.

- [ ] **Step 4: Run the on-hit tests and verify GREEN**

Run the Step 2 command again.

Expected: the test passes with 43 damage.

- [ ] **Step 5: Add a failing dodge-reflection test**

Add a test using `applyPerAttackDodge` with `p1` as a high-evasion recipient and `p2.infiniteThornsAtkPct = 100`. Assert that the returned reflection uses the same evasion candidate rather than only subtracting `p1.def`.

```ts
it("회피 시 발생하는 무한 가시 반사도 같은 경감 공식을 사용한다", () => {
  const result = applyPerAttackDodge(
    stateWith(
      undefined,
      { ...BASE, def: 20, evaRating: 300 },
      { ...BASE, accRating: 50, infiniteThornsAtkPct: 100 },
    ),
    "p1",
    "p2",
    "회피",
    false,
  );

  expect(result.p1.hp).toBeGreaterThan(900);
});
```

Use the exact expected integer produced by `applyEvasionDamageReduction(120, pvpEvasionDamageReductionPct(300, 50))` in the final assertion.

- [ ] **Step 6: Run the dodge-reflection test and verify RED**

Run:

```bash
npm test -- --run src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts -t "회피 시 발생하는 무한 가시 반사도 같은 경감 공식을 사용한다"
```

Expected: FAIL because the dodge branch still uses only `damageBetween`.

- [ ] **Step 7: Route dodge reflection through the helper**

In `applyDodgeEffects`, replace the duplicated reflected-damage defense calculation with:

```ts
const totalReflect = scalePvPDamage(
  st,
  mitigatePvPReflectDamage(st, atkKey, defKey, rawReflect),
);
```

Remove only the local variables made redundant by this replacement.

- [ ] **Step 8: Verify candidate selection, every PvP reflection source, and counter isolation**

Add a test using the same receiver and `accRating: 500` on the reflector. The evasion candidate is then worse than the 80-point defense candidate, so assert 80. Add table-driven assertions covering `thornsPct`, `bramblePct`, `thornsFlatFromDef`, `infiniteThornsAtkPct`, and `reflexEvadeMult`. Add a separate regression assertion that changing the recipient's `evaRating` does not change `maybeApplyMartialCounter` or `maybeApplyRuneCounter` damage.

Run:

```bash
npm test -- --run src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts src/adventure/battle/engine-pvp.test.ts
```

Expected: all tests in both files pass.

- [ ] **Step 9: Commit the PvP engine change**

```bash
git add src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts src/adventure/battle/engine-pvp.test.ts
git commit -m "feat: mitigate pvp reflection with evasion"
```

---

### Task 2: Remove reflect-only passives and lower SP costs

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`
- Test: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Test: `src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts`
- Test: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Consumes: the current `rubricSpCost` and upward-only explicit `spCost` calculation.
- Produces: optional `V2SkillDefinition.spCostDiscount?: number`, applied after the existing calculated cost and clamped to a minimum of 1 SP.
- Removes: `V2PassiveSkillEffect.reflectDamageTakenReductionPct`, its aggregate/derive fields, and `PlayerCombat.reflectDamageTakenReductionPct`.

- [ ] **Step 1: Change catalog and SP assertions first**

Update tests to require:

```ts
expect(
  V2_SKILLS.v2c_hegemon_dominion.passive,
).not.toHaveProperty("reflectDamageTakenReductionPct");
expect(
  V2_SKILLS.v2c_archmage_theory.passive,
).not.toHaveProperty("reflectDamageTakenReductionPct");
expect(spCostOf(V2_SKILLS.v2c_hegemon_dominion)).toBe(14);
expect(spCostOf(V2_SKILLS.v2c_archmage_theory)).toBe(15);
expect(describeV2Skill(V2_SKILLS.v2c_hegemon_dominion).join(" ")).not.toContain(
  "받는 반사 피해",
);
expect(describeV2Skill(V2_SKILLS.v2c_archmage_theory).join(" ")).not.toContain(
  "받는 반사 피해",
);
```

Change aggregate tests to expect no reflect-only aggregate field. Replace the old engine test for a 50% reflect-only reduction and the derive test for its 80% cap with assertions for the new catalog/SP behavior; do not leave tests constructing a removed `PlayerCombat` field.

- [ ] **Step 2: Run the passive/SP tests and verify RED**

Run:

```bash
npm test -- --run src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts src/lib/server/derivePlayerCombatV2.test.ts
```

Expected: failures show both passives still expose 20% reflect reduction and costs are still 15/16.

- [ ] **Step 3: Add the narrow SP discount mechanism**

Add to `V2SkillDefinition`:

```ts
/** 성능 루브릭 산정 뒤 적용하는 소량의 명시 할인. 결과는 최소 1 SP. */
spCostDiscount?: number;
```

Refactor `spCostOf` so it first computes the same current base cost, then subtracts a non-negative integer discount:

```ts
const discount = Math.max(0, Math.floor(skill.spCostDiscount ?? 0));
return Math.max(1, baseCost - discount);
```

Add unit coverage proving no discount is byte-identical, fractional/negative discounts cannot undercut unexpectedly, and the result never falls below 1.

- [ ] **Step 4: Remove the two catalog effects and set the final costs**

Delete `reflectDamageTakenReductionPct: 20` from both passives. Set `spCostDiscount: 1` only on `v2c_archmage_theory`; the hegemon cost naturally falls to 14 after effect removal.

Do not change the passives' remaining stat, damage, HP, or general damage-reduction values.

- [ ] **Step 5: Remove the obsolete field through every layer**

Delete the reflect-only field and handling from:

- `V2PassiveSkillEffect`
- `skillPowerScore` and `describeV2Skill`
- `AggregatedV2Passives` and `aggregateEquippedPassives`
- derive input/result wiring in `derivePlayerCombatV2.ts`
- `PlayerCombat` in `engineState.ts`
- `applyOnHitReflect` in `engine-pvp.ts`

The reflected raw amount must now flow directly into `mitigatePvPReflectDamage` without a class-specific percentage reduction.

- [ ] **Step 6: Run passive, derive, engine, and type tests**

Run:

```bash
npm test -- --run src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts src/adventure/battle/engine-pvp.test.ts src/lib/server/derivePlayerCombatV2.test.ts
npx tsc --noEmit --pretty false
```

Expected: all selected tests and type checking pass, and `rg -n "reflectDamageTakenReductionPct" src` returns no matches.

- [ ] **Step 7: Commit the passive and SP cleanup**

```bash
git add src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts
git commit -m "feat: replace reflect-only passive mitigation"
```

---

### Task 3: Manual, final regression coverage, and verification

**Files:**
- Modify: `src/app/manual/content/combat.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: the finalized PvP reflection formula and exact 14/15 SP catalog results.
- Produces: player-facing explanation that PvP reflection uses the better of defense and evasion without stacking, while PvE remains unchanged.

- [ ] **Step 1: Add failing manual assertions**

Add a manual content test requiring the rendered combat guide to contain all of:

```ts
expect(html).toContain("방어 감산과 PvP 회피 경감 중");
expect(html).toContain("더 유리한 하나");
expect(html).toContain("중첩되지 않습니다");
expect(html).toContain("사냥 반사 피해에는 적용되지 않습니다");
```

- [ ] **Step 2: Run the manual test and verify RED**

Run:

```bash
npm test -- --run src/app/manual/current-content.test.tsx
```

Expected: the new PvP reflection wording assertions fail.

- [ ] **Step 3: Update the combat manual**

Replace the old statement that lists the removed reflect-only reduction with wording that states:

```text
PvP 반사 피해에는 방어 감산과 PvP 회피 경감 중 더 유리한 하나만 적용되며,
두 경감은 중첩되지 않습니다. 이 추가 회피 대응 규칙은 사냥 반사 피해에는
적용되지 않습니다.
```

Keep the existing explanation of reflect bases, trigger behavior, arena multiplier, and normal shield ordering.

- [ ] **Step 4: Run all focused regression tests**

Run:

```bash
npm test -- --run src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/battle/engine.feats.test.ts src/adventure/battle/engine.tier5.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/lib/server/derivePlayerCombatV2.test.ts src/app/manual/current-content.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 5: Run static verification**

Run:

```bash
npx eslint src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/combat/engineState.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts src/app/manual/content/combat.tsx src/app/manual/current-content.test.tsx
npx tsc --noEmit --pretty false
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 6: Run the full suite and production build**

Run:

```bash
npm test -- --reporter=dot
npm run build
```

If the isolated worktree uses an external `node_modules` symlink and Turbopack rejects it as outside the filesystem root, record that environment-only failure after the image checks pass and run `npx next build --webpack` as the supported isolated-worktree build verification.

- [ ] **Step 7: Review scope and commit documentation**

Confirm with `git diff` and `rg` that PvE reflection code, counter formulas, and unrelated files are unchanged. Then commit:

```bash
git add src/app/manual/content/combat.tsx src/app/manual/current-content.test.tsx
git commit -m "docs: explain pvp reflect mitigation"
```
