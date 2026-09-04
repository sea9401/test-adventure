# Skyward Crystal Eye Boss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `천공의 수정안` unexplored personal boss whose fixed 900-tick artillery is weakened by every landed multi-hit and critical hit, with persistent state, rewards, UI, assets, and deterministic balance coverage.

**Architecture:** Put stack/tier/timer rules in a pure `skywardCrystalEyeMechanic.ts` module and expose the mechanic to the ATB engine through the existing discriminated `bossMechanic` context. Persist one normalized `crystalEye` object inside the shared cooperative boss `mechanic_state`, reuse the existing session transaction and stale-state rejection pattern, and map the same display contract into list/detail/attack responses and one opaque status component.

**Tech Stack:** TypeScript, React 19, Next.js 16.2 App Router route handlers, Vitest, Testing Library, PostgreSQL/Drizzle session persistence, local balance simulation, WebP assets.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` before changing route handlers or route tests.
- Keep `900` aim ticks, `24` stack cap, per-hit `1`/critical-hit `2` stacks, `250` exposure ticks, and `25%` exposure damage bonus literal and unchanged during calibration.
- Artillery weakening is exactly `0~3=100%`, `4~7=90%`, `8~11=80%`, `12~15=70%`, `16~19=60%`, `20~23=50%`, `24=25%`.
- Artillery base coefficients are exactly `>75%=180%`, `>50%=210%`, `>25%=240%`, `<=25%=270%` of the normal attack before the stack multiplier.
- Artillery always fires, is non-critical magic damage, pierces 20% magic defense, and can miss through the normal accuracy/evasion calculation with a boss-specific accuracy bonus.
- Core exposure never stops boss actions or the next aim timer; hits during exposure count toward the next artillery.
- Direct skill hits and their extra attacks count without a per-action cap. Misses, DoT, reflection, and automatic counters do not count.
- Persist timer, stacks, exposure, artillery count, and last result across attack attempts; rejected or stale requests change none of them.
- Use `SURFACE_CARD`, `SURFACE_INSET`, or `SURFACE_ACCENT` for new content surfaces; no translucent content card and no container-wide disabled opacity.
- Preserve all existing boss, PvE, and PvP behavior when the new mechanic context is absent.
- Do not change feature flags and do not deploy to staging or production.

---

## File Map

- Create `src/adventure/v2/combat/skywardCrystalEyeMechanic.ts`: pure state normalization, stack, timer, artillery tier, phase coefficient, exposure, and replay resource helpers.
- Create `src/adventure/v2/combat/skywardCrystalEyeMechanic.test.ts`: exact pure boundaries and corrupted-state coverage.
- Create `src/adventure/v2/combat/skywardCrystalEyeAtb.test.ts`: individual hit accounting, fixed events, tie ordering, exposure and isolation coverage.
- Modify `src/adventure/v2/combat/engineState.ts` and `src/adventure/v2/combat/engine.atb.ts`: add the mechanic context and integrate typed events without parsing logs.
- Modify `src/adventure/data/v2/unexploredBosses.ts`, `v2EquipmentCatalog.ts`, `unexploredState.ts`, `unexploredProgression.ts`, `titles.ts`, and their tests: add boss, summon stone, equipment, title, achievement and five-boss conquest.
- Modify `src/adventure/data/v2/coopBosses.ts` and tests: normalize, merge and display persisted `crystalEye` state.
- Modify `src/app/api/v2/coop/attack/route.ts` and tests: inject/extract state, reject stale same-HP state, persist atomically, and return artillery events.
- Modify list/detail/claim routes and tests: expose display fields and grant the new rewards/achievement.
- Create `src/adventure/v2/coop/SkywardCrystalEyeStatus.tsx` and test; modify list/detail views and `useCoopBossState.ts` to render and refresh it.
- Modify `scripts/sim-v2-coop-boss.ts` and `unexploredBossBalanceSim.test.ts`: deterministic multi-hit/crit/single-hit calibration.
- Create four image assets and update `docs/asset-rights.json`.

### Task 1: Pure mechanic state and boundaries

**Files:**
- Create: `src/adventure/v2/combat/skywardCrystalEyeMechanic.ts`
- Create: `src/adventure/v2/combat/skywardCrystalEyeMechanic.test.ts`

**Interfaces:**
- Produces `SkywardCrystalEyeBattleState`, `SkywardCrystalEyeArtilleryResult`, `initialSkywardCrystalEyeState()`, `normalizeSkywardCrystalEyeState(value)`, `addSkywardCrystalEyeHit(state, critical)`, `advanceSkywardCrystalEyeTimers(state, ticks)`, `skywardCrystalEyeArtilleryPowerPct(stacks)`, `skywardCrystalEyeBasePowerPct(currentHp, maxHp)`, `fireSkywardCrystalEyeArtillery(state)`, and `skywardCrystalEyeResourceSnapshot(state)`.

- [ ] **Step 1: Write failing pure tests** for initial state, all stack and HP boundaries, uncapped multi-hit accumulation to a stored cap of 24, critical hits adding two, timer/exposure advancement, artillery reset/exposure, and invalid-value normalization. Representative assertions:

```ts
expect(skywardCrystalEyeArtilleryPowerPct(3)).toBe(100);
expect(skywardCrystalEyeArtilleryPowerPct(4)).toBe(90);
expect(skywardCrystalEyeArtilleryPowerPct(23)).toBe(50);
expect(skywardCrystalEyeArtilleryPowerPct(24)).toBe(25);
expect(skywardCrystalEyeBasePowerPct(7_500_001, 10_000_000)).toBe(180);
expect(skywardCrystalEyeBasePowerPct(7_500_000, 10_000_000)).toBe(210);
expect(fireSkywardCrystalEyeArtillery({ ...initialSkywardCrystalEyeState(), disruptionStacks: 24 }).state).toMatchObject({
  aimTicksRemaining: 900,
  disruptionStacks: 0,
  coreExposureTicksRemaining: 250,
  artilleryCount: 1,
  lastArtilleryPowerPct: 25,
});
```

- [ ] **Step 2: Run the focused test and confirm RED.**

Run: `npx vitest run src/adventure/v2/combat/skywardCrystalEyeMechanic.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure module** with finite-integer clamps and no database, catalog, UI or log dependency.

- [ ] **Step 4: Run the focused test GREEN** and run `git diff --check`.

- [ ] **Step 5: Commit.**

```bash
git add src/adventure/v2/combat/skywardCrystalEyeMechanic.ts src/adventure/v2/combat/skywardCrystalEyeMechanic.test.ts
git commit -m "feat: add skyward crystal eye mechanic"
```

### Task 2: Boss, summon, equipment, title and achievement catalogs

**Files:**
- Modify: `src/adventure/data/v2/unexploredBosses.ts`
- Modify: `src/adventure/data/v2/unexploredBosses.test.ts`
- Modify: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/data/v2/unexploredState.ts`
- Modify: `src/adventure/data/v2/unexploredProgression.ts`
- Modify: `src/adventure/data/v2/unexploredProgression.test.ts`
- Modify: `src/adventure/data/titles.ts`
- Modify expected-count tests in `codex.test.ts`, `dungeonDrops.test.ts`, `dungeonUniqueDrops.test.ts`, `unexploredRewards.test.ts`, `V2UnexploredTreeView.test.tsx`, `marketplaceV2.test.ts`, and `v2Coop.test.ts` only where the fifth boss changes a literal contract.

**Interfaces:**
- Produces boss ID `skyward_crystal_eye`, summon material `v2_unexplored_skyward_crystal_eye_summon_stone`, equipment IDs from the design, title `v2_unexplored_skyward_crystal_eye`, and achievement `defeat_skyward_crystal_eye`.

- [ ] **Step 1: Add failing catalog tests** asserting the two pools, summon costs, `10_800_000` HP, depth `120`, monster image/stats/traits, three exact independent drop rates, equipment options, `every_n_hits: 5`, no self-recursive signature behavior, title and five-boss conquest compatibility.

- [ ] **Step 2: Run catalog tests RED.**

Run: `npx vitest run src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/data/v2/unexploredProgression.test.ts`

- [ ] **Step 3: Add the catalog entries** using the exact IDs, names, costs and starting options in the spec. Keep the 30%/10% drops in the derived core recipe list and exclude the 0.5% necklace.

- [ ] **Step 4: Update only genuinely changed count/snapshot assertions**, then run all listed catalog regression tests GREEN.

- [ ] **Step 5: Commit.**

```bash
git add src/adventure/data src/adventure/v2/V2UnexploredTreeView.test.tsx src/lib/server/marketplaceV2.test.ts src/lib/server/v2Coop.test.ts
git commit -m "feat: catalog skyward crystal eye rewards"
```

### Task 3: ATB engine integration

**Files:**
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Create: `src/adventure/v2/combat/skywardCrystalEyeAtb.test.ts`
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Modify: `src/adventure/battle/BattleLogList.test.tsx`

**Interfaces:**
- Consumes the Task 1 pure helpers.
- Extends `bossMechanic` with `{ kind: "skyward_crystal_eye"; sharedMaxHp: number; initialState: SkywardCrystalEyeBattleState }` and returns the final mechanic state plus typed artillery results.

- [ ] **Step 1: Read the required Next.js route/testing guides** before later route work and record no code changes from this reading.

- [ ] **Step 2: Write failing ATB tests** covering every hit of a multi-hit skill, critical hits as two stacks, misses/DoT/reflection/counter exclusions, 900/1,800/2,700 events, player-first exact-tick ordering, inherited partial timers, non-stopping exposure, 25% incoming damage amplification, mandatory artillery, non-critical magic damage with 20% MDEF penetration, and no-context parity.

- [ ] **Step 3: Run the new ATB suite RED.**

Run: `npx vitest run src/adventure/v2/combat/skywardCrystalEyeAtb.test.ts`

- [ ] **Step 4: Add the discriminated state and typed event integration.** Count structured per-hit outcomes at their source; do not infer criticals or hit counts from Korean log strings. Schedule artillery independently of normal enemy actions and decrement exposure over the same elapsed timeline.

- [ ] **Step 5: Add Korean battle-log labels** for aim disruption, artillery tier/damage, and exposure start/end, then run the new suite plus existing fortress and ATB regression tests GREEN.

Run: `npx vitest run src/adventure/v2/combat/skywardCrystalEyeAtb.test.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/battle/BattleLogList.test.tsx`

- [ ] **Step 6: Commit.**

```bash
git add src/adventure/v2/combat src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx
git commit -m "feat: integrate crystal eye artillery combat"
```

### Task 4: Persistent mechanic state and atomic attack API

**Files:**
- Modify: `src/adventure/data/v2/coopBosses.ts`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`
- Modify: `src/app/api/v2/coop/attack/route.ts`
- Modify: `src/app/api/v2/coop/attack/route.test.ts`

**Interfaces:**
- Produces `coopSkywardCrystalEyeState`, `withCoopSkywardCrystalEyeState`, `coopSkywardCrystalEyeDisplay`, and response fields prefixed `crystalEye`.

- [ ] **Step 1: Write failing persistence/display tests** for normalization, merging beside `bossMp`/`tracking`/`fortress`, legacy initialization at 900/0, display tier projection, terminal removal, and stale same-HP mechanic conflict.

- [ ] **Step 2: Run the focused suites RED.**

Run: `npx vitest run src/adventure/data/v2/coopBosses.test.ts src/app/api/v2/coop/attack/route.test.ts`

- [ ] **Step 3: Implement shared state helpers and display mapping.** Display fields are `crystalEyeAimTicksRemaining`, `crystalEyeDisruptionStacks`, `crystalEyeProjectedPowerPct`, `crystalEyeBasePowerPct`, `crystalEyeCoreExposed`, `crystalEyeCoreExposureTicksRemaining`, `crystalEyeArtilleryCount`, and nullable last-result fields.

- [ ] **Step 4: Inject the initial state into battle resolution**, extract the final state, compare the locked current mechanic against the simulation basis even when HP is unchanged, persist HP and mechanic state in one transaction, and remove `crystalEye` on defeat.

- [ ] **Step 5: Run persistence/API suites GREEN** and confirm existing fortress stale-write coverage remains green.

- [ ] **Step 6: Commit.**

```bash
git add src/adventure/data/v2/coopBosses.ts src/adventure/data/v2/coopBosses.test.ts src/app/api/v2/coop/attack/route.ts src/app/api/v2/coop/attack/route.test.ts
git commit -m "feat: persist crystal eye artillery state"
```

### Task 5: List/detail responses and status UI

**Files:**
- Modify: `src/app/api/v2/coop/route.ts` and test
- Modify: `src/app/api/v2/coop/[sessionId]/route.ts` and test
- Create: `src/adventure/v2/coop/SkywardCrystalEyeStatus.tsx`
- Create: `src/adventure/v2/coop/SkywardCrystalEyeStatus.test.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossListView.tsx` and test
- Modify: `src/adventure/v2/coop/V2CoopBossDetailView.tsx` and test
- Modify: `src/adventure/v2/coop/useCoopBossState.ts`

**Interfaces:**
- Consumes Task 4 display fields and renders one status component in list, detail and refreshed attack state.

- [ ] **Step 1: Write failing route/component tests** for `포격까지 640틱`, `조준 붕괴 17 / 24`, projected `60%`, exposed `180틱`, and last artillery result.

- [ ] **Step 2: Run UI/route tests RED.**

Run: `npx vitest run src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.test.ts src/adventure/v2/coop/SkywardCrystalEyeStatus.test.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/v2/coop/V2CoopBossDetailView.test.tsx`

- [ ] **Step 3: Add display mapping to list/detail APIs** and client response types/state refresh.

- [ ] **Step 4: Implement `SkywardCrystalEyeStatus`** with `SURFACE_INSET`, semantic text colors, no translucent card, and no container opacity; render only for the new boss.

- [ ] **Step 5: Run route/UI suites GREEN** and commit.

```bash
git add src/app/api/v2/coop/route.ts src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.ts src/app/api/v2/coop/[sessionId]/route.test.ts src/adventure/v2/coop
git commit -m "feat: show crystal eye aiming status"
```

### Task 6: Reward claim and achievement regressions

**Files:**
- Modify: `src/app/api/v2/coop/claim/route.test.ts`
- Modify claim implementation only if generic catalog behavior does not already cover the new boss.

**Interfaces:**
- Confirms guaranteed core, independent 30%/10%/0.5% rolls, title grant, achievement grant and no 0.5% recipe.

- [ ] **Step 1: Add a failing new-boss claim test** with deterministic rolls that asserts the exact three equipment IDs, title, achievement, and core.

- [ ] **Step 2: Run RED, make the smallest generic/catalog correction if needed, then run GREEN.**

Run: `npx vitest run src/app/api/v2/coop/claim/route.test.ts src/adventure/data/v2/unexploredBosses.test.ts`

- [ ] **Step 3: Commit.**

```bash
git add src/app/api/v2/coop/claim src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/unexploredBosses.test.ts
git commit -m "test: cover crystal eye boss rewards"
```

### Task 7: Deterministic balance simulation

**Files:**
- Modify: `scripts/sim-v2-coop-boss.ts`
- Modify: `src/adventure/v2/combat/unexploredBossBalanceSim.test.ts`

**Interfaces:**
- Produces per-shot stacks, weakening percentage, actual artillery damage, exposure uptime, survival tick and contribution for representative and real multi-hit fixtures.

- [ ] **Step 1: Add a failing fixed-seed test** requiring multi-hit median at least two 24-stack shots in a fresh attempt, crit builds mainly 16~24, ordinary single-hit builds mainly 8~19, maximum final-phase artillery not one-shotting the defensive fixture, and absence of boss idle time during exposure.

- [ ] **Step 2: Run RED**, implement reporting and calibrate only in the global-constraint order.

Run: `npx vitest run src/adventure/v2/combat/unexploredBossBalanceSim.test.ts`

- [ ] **Step 3: Run the CLI simulation** with a fixed seed and retain the exact command/output summary in the commit message or implementation notes.

Run: `npx tsx scripts/sim-v2-coop-boss.ts --boss skyward_crystal_eye --seed 20260901 --trials 5`

- [ ] **Step 4: Commit.**

```bash
git add scripts/sim-v2-coop-boss.ts src/adventure/v2/combat/unexploredBossBalanceSim.test.ts src/adventure/data/v2/unexploredBosses.ts
git commit -m "test: calibrate crystal eye boss balance"
```

### Task 8: Image assets and rights ledger

**Files:**
- Create: `public/images/monster/v2/unexplored-boss-skyward-crystal-eye.webp`
- Create: `public/images/equipment/unexplored-prismatic-firing-gauntlets.webp`
- Create: `public/images/equipment/unexplored-starpath-aiming-ring.webp`
- Create: `public/images/equipment/unexplored-infinite-focus-crystal-eye.webp`
- Modify: `docs/asset-rights.json`

**Interfaces:**
- Produces the four exact paths already referenced by the catalogs.

- [ ] **Step 1: Use the built-in image generation workflow** for a square floating crystal-eye artillery construct with rotating lenses, then for three isolated transparent-background RPG equipment icons sharing blue-white crystal and metallic aiming motifs.

- [ ] **Step 2: Inspect generated images**, place PNG intermediates at the exact referenced paths, and run the repository optimizer to create WebP and remove PNG originals.

Run: `npm run optimize-images`

- [ ] **Step 3: Record generation prompts/tool/date in `docs/asset-rights.json`**, then run reference and rights checks.

Run: `npm run check-images && npm run check-asset-rights`

- [ ] **Step 4: Commit.**

```bash
git add public/images/monster/v2/unexplored-boss-skyward-crystal-eye.webp public/images/equipment/unexplored-prismatic-firing-gauntlets.webp public/images/equipment/unexplored-starpath-aiming-ring.webp public/images/equipment/unexplored-infinite-focus-crystal-eye.webp docs/asset-rights.json
git commit -m "assets: add skyward crystal eye artwork"
```

### Task 9: Full verification and local handoff

**Files:**
- Modify only files required by failures caused by this feature.

**Interfaces:**
- Produces a clean local feature branch with no deployment side effect.

- [ ] **Step 1: Run focused feature suites** for mechanic, ATB, catalogs, persistence, routes, claim, UI and balance.

- [ ] **Step 2: Run static and asset checks.**

Run: `npm run lint`

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

Run: `npm run check-images && npm run check-asset-rights`

- [ ] **Step 3: Run the full test suite and production build.**

Run: `npm test -- --run`

Run: `NODE_OPTIONS=--max-old-space-size=4096 npm run build`

- [ ] **Step 4: Inspect `git diff --check`, status, and commit history.** Fix only feature-caused failures and commit final corrections with a scoped message.

- [ ] **Step 5: Request code review using `superpowers:requesting-code-review`**, self-review inline because project instructions prohibit unrequested subagents, address confirmed findings with TDD, and rerun affected verification.

- [ ] **Step 6: Report the local branch, commits, test/build evidence, generated asset paths, and explicitly state that no environment was deployed.**
