# Unexplored Specialty Set Balance Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic ATB simulator that compares the four unexplored specialty sets against storm 6T and pioneer 6.5T loadouts, enforces PvE progression targets and PvP safety caps, and minimally calibrates only failing specialty values.

**Architecture:** Extend the existing level-design snapshot adapter with an optional explicit equipment override, then build a standalone simulator/CLI around the real PvE and PvP ATB engines. The simulator owns fixed loadouts, fixtures, seeded trials, summaries and violations; a focused Vitest suite locks its deterministic contract and final balance gates.

**Tech Stack:** TypeScript, Vitest 4, existing `derivePlayerCombatV2Pure` adapter, PvE/PvP ATB engines, `tsx` CLI, npm scripts.

## Global Constraints

- PvE is the primary tuning target; PvP is a non-buff safety check.
- Use level 100 DEX, LUK, VIT and INT sixth-job snapshots with catalog equipment, no enhancement, reforge, liberation or variance.
- Storm 6T transition performance remains an informational report only.
- Pioneer 6.5T role performance target: specialty transition ratio `0.97..1.08`, plus each set's niche gate from the design spec.
- PvP specialty win rate target: `45..60%`; warn above `60%`, fail above `62%`.
- Do not add combat mechanics, APIs, save fields, UI, images or production feature-flag changes.
- Only the twelve specialty item values or four specialty tag-set values may be calibrated.
- Do not access production data, push, deploy or alter maintenance mode.
- Preserve unrelated work and implement in `balance/unexplored-specialty-validation`.

---

### Task 1: Explicit equipment snapshot adapter

**Files:**
- Modify: `scripts/sim-v2-level-design.ts:1110-1145`
- Test: `src/adventure/data/v2/levelDesignSim.test.ts`

**Interfaces:**
- Consumes: existing `buildLevelDesignProgressionSnapshot()` and `snapshotFor(..., overrides)`.
- Produces: `buildLevelDesignProgressionSnapshot({ ..., equipment?: Partial<Record<V2EquipSlot, V2EquipmentId>> })`.

- [x] **Step 1: Write the failing adapter test**

The production mutation this catches is ignoring an explicit simulator loadout and silently measuring auto-selected progression gear.

```ts
it("고정 장비 오버라이드는 실제 전투 스냅샷과 시그니처를 바꾼다", () => {
  const snapshot = buildLevelDesignProgressionSnapshot({
    arch: "INT",
    depth: 84,
    careerWins: 500_000,
    cultivate: true,
    equipment: {
      weapon: "v2_unexplored_deep_alchemy_staff",
      armor: "v2_unexplored_mana_cycle_robe",
      gloves: "v2_pioneer_iron_guard_gloves",
      boots: "v2_pioneer_tracefree_boots",
      ring: "v2_unexplored_abyss_catalyst_ring",
      necklace: "v2_pioneer_refraction_core",
    },
  });

  expect(snapshot.player.magicAtk).toBeGreaterThan(0);
  expect(snapshot.player.equipSignatures?.map((entry) => entry.label)).toEqual(
    expect.arrayContaining(["마력 재순환", "심층 방전"]),
  );
});
```

- [x] **Step 2: Run the test and confirm RED**

Run: `npm test -- src/adventure/data/v2/levelDesignSim.test.ts`

Expected: FAIL because `equipment` is ignored and the derived player does not contain both deep-arcane signatures.

- [x] **Step 3: Add the adapter option**

Import `V2EquipSlot` and add the optional field. Pass it to `snapshotFor` only through its existing override object; the balance simulator always supplies `careerWins`, so `minimumProgressionFor` remains unchanged.

```ts
equipment?: Partial<Record<V2EquipSlot, V2EquipmentId>>;
// ...
snapshotFor(
  options.arch,
  depth,
  Math.max(0, Math.floor(options.careerWins)),
  seed,
  enhanceLevel,
  options.cultivate ?? true,
  { equipment: options.equipment },
);
```

- [x] **Step 4: Run the narrow level-design regression**

Run: `npm test -- src/adventure/data/v2/levelDesignSim.test.ts src/adventure/data/v2/coopBossBalance.test.ts`

Expected: PASS with existing callers unchanged.

- [x] **Step 5: Commit the adapter**

```bash
git add scripts/sim-v2-level-design.ts src/adventure/data/v2/levelDesignSim.test.ts
git commit -m "test: accept fixed equipment in balance snapshots"
```

### Task 2: Deterministic loadouts and PvE report

**Files:**
- Create: `scripts/sim-v2-unexplored-specialty-sets.ts`
- Modify: `src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`

**Interfaces:**
- Produces: `SPECIALTY_LOADOUTS`, `buildUnexploredSpecialtyBalanceReport(options)`, report types and seeded PvE trials.
- Consumes: the adapter from Task 1, `resolveBattle`, `pickAutoAction`, and the approved exact item IDs.

- [x] **Step 1: Write failing loadout and report tests**

The production mutations these catch are a wrong baseline tag, a wrong replacement slot, missing comparison group, nondeterministic RNG and non-finite summaries.

```ts
it("네 세트의 storm·pioneer·transition 장비가 정확한 여섯 슬롯을 채운다", () => {
  expect(Object.keys(SPECIALTY_LOADOUTS)).toEqual([
    "tracking", "toxic_blood", "glacial_guard", "deep_arcane",
  ]);
  for (const loadouts of Object.values(SPECIALTY_LOADOUTS)) {
    expect(Object.keys(loadouts.storm)).toHaveLength(6);
    expect(Object.keys(loadouts.stormTransition)).toHaveLength(6);
    expect(Object.keys(loadouts.pioneer)).toHaveLength(6);
    expect(Object.keys(loadouts.pioneerTransition)).toHaveLength(6);
  }
});

it("같은 seed의 PvE 보고서는 실행 순서와 무관하게 동일하다", () => {
  const options = { pveTrials: 4, pvpPairs: 0, seed: 20260831 };
  const first = buildUnexploredSpecialtyBalanceReport(options);
  const second = buildUnexploredSpecialtyBalanceReport(options);
  expect(second.pve).toEqual(first.pve);
  expect(JSON.stringify(first.pve)).not.toMatch(/NaN|Infinity/);
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npm test -- src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`

Expected: FAIL because the simulator exports do not exist.

- [x] **Step 3: Implement exact loadout catalog**

Use explicit six-slot objects from the approved spec. Build transition objects by replacing only these slots:

```ts
const SPECIALTY_REPLACEMENTS = {
  tracking: ["gloves", "boots", "ring"],
  toxic_blood: ["armor", "gloves", "ring"],
  glacial_guard: ["armor", "boots", "necklace"],
  deep_arcane: ["weapon", "armor", "ring"],
} as const;
```

Validate at module load that every loadout has one real item per slot, weapon type matches the archetype, and each transition activates both specialty thresholds.

- [x] **Step 4: Implement seeded PvE fixtures and aggregation**

Create fixed short dummy, long dummy, evasive, armored, physical flurry, magic burst and status-pressure monsters. Run real `resolveBattle` with `pickAutoAction`, no potions, fixed skill state and bounded ATB ticks. Aggregate literal metrics without parsing damage values from localized text:

```ts
type SpecialtyPveSummary = {
  trials: number;
  winRatePct: number;
  medianDamagePer1000Ticks: number;
  medianSurvivalTicks: number;
  medianEndingHpRatio: number;
  medianEndingMpRatio: number;
  medianPlayerActions: number;
  medianDirectHits: number;
  signatureTriggers: Record<string, number>;
};
```

Damage is `fixture.hp - finalState.enemyHp`; ticks come from structured `log[].t`; direct hits come from structured `directHits`. Signature trigger counts may match the exact catalog label prefix in info logs, but no numeric damage is parsed from text.

- [x] **Step 5: Run the focused test and refactor only after GREEN**

Run: `npm test -- src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`

Expected: PASS for loadouts, determinism, finiteness and observed specialty labels.

- [x] **Step 6: Commit PvE simulation**

```bash
git add scripts/sim-v2-unexplored-specialty-sets.ts src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts
git commit -m "test: simulate unexplored specialty PvE balance"
```

### Task 3: PvP pairs, gates and CLI

**Files:**
- Modify: `scripts/sim-v2-unexplored-specialty-sets.ts`
- Modify: `src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: paired PvP summaries, `unexploredSpecialtyBalanceViolations(report)`, `main(args)` and npm command `sim:v2:unexplored-specialty`.

- [x] **Step 1: Write failing PvP and violation tests**

The production mutations these catch are first-player bias, wrong draw scoring, a missing 62% hard cap and a strict CLI that exits successfully on failure.

```ts
it("PvP는 양쪽 선공을 한 쌍으로 집계하고 무승부를 반 승으로 계산한다", () => {
  const report = buildUnexploredSpecialtyBalanceReport({
    pveTrials: 0, pvpPairs: 4, seed: 20260831,
  });
  for (const entry of report.pvp) {
    expect(entry.battles).toBe(8);
    expect(entry.specialtyWinRatePct).toBeGreaterThanOrEqual(0);
    expect(entry.specialtyWinRatePct).toBeLessThanOrEqual(100);
  }
});

it("62%를 넘는 PvP 승률은 실패다", () => {
  const violations = unexploredSpecialtyBalanceViolations(fixtureReport({
    specialtyWinRatePct: 62.01,
  }));
  expect(violations.failures).toContainEqual(expect.objectContaining({
    code: "PVP_HARD_CAP",
  }));
});
```

- [x] **Step 2: Run and confirm RED**

Run: `npm test -- src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`

Expected: FAIL because PvP and violation outputs are absent.

- [x] **Step 3: Implement paired PvP and exact gates**

Use `resolveBattlePvPAtb` twice per seed, swapping sides and names. Normalize the result to specialty win/draw/loss before aggregation. Implement the approved gates: pioneer ratio `0.97..1.08`, four niche checks, PvP warning above `60%`, and failure above `62%`. Storm ratios remain in the report without failing strict mode.

- [x] **Step 4: Add CLI and npm script**

```json
"sim:v2:unexplored-specialty": "NODE_PATH=./scripts/server-only-stub NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_ATB_SKILLS=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true node --import tsx scripts/sim-v2-unexplored-specialty-sets.ts"
```

Support `--pve-trials=N`, `--pvp-pairs=N`, `--seed=N`, `--json` and `--strict`. Reject values outside `0..1000`; reject both trial counts being zero in direct CLI execution.

- [x] **Step 5: Run focused tests**

Run: `npm test -- src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`

Expected: PASS.

- [x] **Step 6: Commit PvP and CLI**

```bash
git add scripts/sim-v2-unexplored-specialty-sets.ts src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts package.json
git commit -m "test: audit unexplored specialty PvP balance"
```

### Task 4: Current-value audit and minimal calibration

**Files:**
- Modify only when a measured failure requires it:
  - `src/adventure/data/v2/v2Equipment.ts`
  - `src/adventure/data/v2/v2EquipmentCatalog.ts`
  - `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `docs/superpowers/specs/2026-08-31-unexplored-specialty-balance-validation-design.md`

**Interfaces:**
- Consumes: strict simulator report and violation codes.
- Produces: a zero-failure 200 PvE / 400-pair PvP calibration and recorded final measurements.

- [x] **Step 1: Run the current catalog audit**

Run: `npm run sim:v2:unexplored-specialty -- --pve-trials=200 --pvp-pairs=400 --seed=20260831 --json`

Expected: a deterministic JSON report. Save no generated artifact; record the final compact table in the design document.

- [x] **Step 2: Convert each measured failure into a failing literal range test**

For every violation, add or tighten a focused expectation in `unexploredSpecialtyBalanceSim.test.ts`. Do not change production values until that test fails for the same violation code.

Run: `npm test -- src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`

Expected: FAIL with the measured set and gate.

- [x] **Step 3: Apply the smallest bounded adjustment**

Adjust one set at a time, in this order:

1. Flat threshold bonus in steps of at most `5` for crit/evasion/speed/accuracy/crit resistance, `25` for def/magicDef, or `100` for HP/MP.
2. Signature chance or coefficient in steps of at most `5` percentage points; `everyNHits` may move only between 4 and 5.
3. Individual item option with the same step limits.
4. Item `power` by at most `5%` per iteration.

Do not change trigger type, slot, tag, recipe or item identity. Run the focused test after every set adjustment and revert any change that fixes one gate by breaking another.

- [x] **Step 4: Verify the full strict report**

Run: `npm run sim:v2:unexplored-specialty -- --pve-trials=200 --pvp-pairs=400 --seed=20260831 --strict`

Expected: exit 0 and zero failures. Warnings are printed but do not fail unless they violate a hard bound.

- [x] **Step 5: Record measurements and commit calibration**

Append the final seed, sample counts, four storm/pioneer ratios, four PvP win rates, warnings and zero-failure result to the design document. If no catalog values changed, commit only tests/script/docs; otherwise include the three equipment files.

```bash
git add scripts/sim-v2-unexplored-specialty-sets.ts src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/v2Equipment.test.ts docs/superpowers/specs/2026-08-31-unexplored-specialty-balance-validation-design.md package.json
git commit -m "balance: calibrate unexplored specialty sets"
```

### Task 5: Verification and integration readiness

**Files:**
- Modify only if a verification failure identifies an in-scope defect.

**Interfaces:**
- Produces: verified branch ready for local integration without deployment.

- [x] **Step 1: Run focused regressions**

Run:

```bash
npm test -- \
  src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts \
  src/adventure/data/v2/v2Equipment.test.ts \
  src/adventure/data/v2/guildWorkshop.test.ts \
  src/adventure/v2/guild/WorkshopCraftPanel.test.tsx \
  src/adventure/v2/combat/signatureEffects.test.ts
```

Expected: PASS.

- [x] **Step 2: Run static checks**

Run: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`

Run: `npx eslint scripts/sim-v2-level-design.ts scripts/sim-v2-unexplored-specialty-sets.ts src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/v2Equipment.test.ts`

Run: `npm run check-images`

Run: `git diff --check`

Expected: all exit 0.

- [x] **Step 3: Run full regression and production build**

Run: `npm test`

Run: `npm run build`

Expected: all tests pass and Next.js production build completes.

- [x] **Step 4: Audit scope and commits**

Confirm that the branch changes only the design/plan, simulator, test, package script, adapter, and any measured specialty calibration. Confirm no API, save, UI, image, feature flag, deployment or maintenance file changed.

Run: `git status --short && git log --oneline --decorate -8`

Expected: clean worktree and reviewable commits.

### Task 6: Boss-unique reference cap

**Files:**
- Modify: `scripts/sim-v2-unexplored-specialty-sets.ts`
- Modify: `src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`
- Modify: `docs/superpowers/specs/2026-08-31-unexplored-specialty-balance-validation-design.md`

**Interfaces:**
- Extends: `SpecialtyLoadoutKey` with `bossReference` and each applicable `SpecialtyLoadoutDefinition` with an optional six-slot reference loadout.
- Produces: toxic-blood LUK and glacial-guard VIT boss-reference PvE rows plus `PVE_BOSS_UNIQUE_CAP` failures.
- Preserves: tracking and deep-arcane at four comparison rows because neither has a legal matching three-piece boss lineage.

- [x] **Step 1: Write failing loadout, report and cap tests**

Assert that toxic blood replaces pioneer weapon, armor and ring with `v2_unexplored_toxic_blood_claw`, `v2_unexplored_uncorrupted_heart` and `v2_unexplored_coagulated_venom_ring`. Assert that glacial guard replaces pioneer weapon, armor and necklace with `v2_unexplored_glacial_crushing_hammer`, `v2_unexplored_frozen_great_armor` and `v2_unexplored_absolute_zero_core`. The other three slots must remain byte-for-byte equal to their pioneer baseline.

Build a one-trial PvE report and assert toxic blood and glacial guard have a fifth `bossReference` comparison while tracking and deep arcane remain at four. Clone that report, raise both pioneer-transition role and survival scores above the corresponding boss reference by more than 5%, and expect a `PVE_BOSS_UNIQUE_CAP` failure. In a second clone, raise only one axis and assert the failure is absent.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`

Expected: FAIL because `bossReference` and `PVE_BOSS_UNIQUE_CAP` do not exist.

- [x] **Step 3: Add the two legal reference loadouts and dynamic PvE rows**

Add `bossReference?: SpecialtyEquipmentLoadout` to the loadout definition. Construct each reference with `replaceLoadout(PIONEER_LUK, ...)` or `replaceLoadout(PIONEER_VIT, ...)`. Build the PvE comparison-key list per set so only definitions with a reference emit the fifth row. Reuse the existing deterministic seed path by passing `bossReference` as the loadout key.

- [x] **Step 4: Add the conjunctive 5% hard cap**

Add `PVE_BOSS_UNIQUE_CAP` to `SpecialtyBalanceViolation["code"]`. For reports containing a boss reference, compare `pioneerTransition` against `bossReference` using the existing primary-role score and the arithmetic mean of the three survival-scenario median survival ticks. Emit one failure only when both ratios are strictly greater than `1.05`; missing or non-finite denominators must not create a false failure.

- [x] **Step 5: Run focused GREEN and strict calibration**

Run: `npm test -- src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`

Run: `npm run sim:v2:unexplored-specialty -- --pve-trials=200 --pvp-pairs=400 --seed=20260831 --strict`

Expected: tests pass and the strict report exits 0 with no boss-cap failure. If the measured catalog violates the cap, add a failing literal regression for the measured set before applying the smallest in-scope specialty-value adjustment.

- [x] **Step 6: Record, verify and commit**

Record the toxic-blood and glacial-guard boss-reference role and survival ratios in the design document. Run the focused regression group, TypeScript, target ESLint, `git diff --check` and the production build. Commit only the simulator, its test, the design/plan documents, and any measured specialty catalog adjustment required by the new hard cap.

### Task 7: Static equipment and ratio report completion

**Files:**
- Modify: `scripts/sim-v2-unexplored-specialty-sets.ts`
- Modify: `src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`
- Modify: `docs/superpowers/specs/2026-08-31-unexplored-specialty-balance-validation-design.md`

**Interfaces:**
- Extends: `UnexploredSpecialtyBalanceReport` with `equipmentComparisons` and `ratios` arrays that remain JSON serializable.
- Produces: five same-lineage, same-slot specialty-versus-boss item rows and one PvE ratio row per specialty set.
- Preserves: existing combat gates, deterministic seed behavior and zero-trial CLI validation.

- [x] **Step 1: Write failing report-contract tests**

Build a one-trial PvE report and assert the static comparison keys are exactly `tracking:boots`, `toxic_blood:armor`, `toxic_blood:ring`, `glacial_guard:armor`, and `glacial_guard:necklace`. Assert each side exposes the literal catalog ID, effective scaled `power`, and raw structured `options`; no unrelated cross-lineage pair may appear.

Assert the report has four ratio rows. Each row must expose storm-transition role divided by storm role and pioneer-transition role divided by pioneer role. Toxic blood and glacial guard must also expose boss role and survival ratios; tracking and deep arcane must expose `null` for both boss ratios. All non-null ratios must be finite.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`

Expected: FAIL because the report has no `equipmentComparisons` or `ratios` fields.

- [x] **Step 3: Build static catalog comparison rows**

Import the effective exported `V2_EQUIPMENT` catalog. Define the five approved item-ID pairs as static input, validate that both items exist and share the declared slot, and project only `id`, `name`, `power`, and a copied `options` object into the report. Do not compare deep-arcane items against an unrelated boss lineage.

- [x] **Step 4: Build reusable ratio rows and print both tables**

Extract the current comparison lookup, scenario lookup, safe ratio, primary-role score and survival score into pure helpers shared by violation evaluation and report construction. Add `stormRoleRatio`, `pioneerRoleRatio`, `bossRoleRatio`, and `bossSurvivalRatio` per set. In compact CLI output, print a ratio table after the PvE raw rows and a static equipment table showing both effective powers and option summaries.

- [x] **Step 5: Run GREEN and strict validation**

Run: `npm test -- src/adventure/v2/combat/unexploredSpecialtyBalanceSim.test.ts`

Run: `npm run sim:v2:unexplored-specialty -- --pve-trials=200 --pvp-pairs=400 --seed=20260831 --strict`

Expected: both pass; compact output contains four ratio rows and five static equipment rows while warnings and failures remain zero.

- [x] **Step 6: Document, verify and commit**

Update the design document with the completed report contract. Run the full test suite, TypeScript, target ESLint, image validation, `git diff --check`, and production build. Commit only the simulator, its focused test and the design/plan documents.
