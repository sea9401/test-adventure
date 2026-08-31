# Mana Shield Defense Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `v2c_caster_acumen` mana shield as a combat-start INT/max-MP barrier that partitions eligible pre-defense hostile damage, spends discounted durability, and is accurately explained in combat UI and manuals.

**Architecture:** Keep derivation and integer settlement math in `v2CombatConstants.ts`, carry snapshotted percentages through the optional `PlayerCombat` fields, and call the same pure partition helper from PvE and PvP damage sites. Direct damage partitions before defense/evasion and sends only HP-bound damage through ordinary shields; indirect eligible damage uses the same partition helper but preserves ordinary shields' current exclusions. Fixed, execution, explicit shield-bypass, self-damage, and HP-cost paths remain outside the helper.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Vitest.

## Global Constraints

- Only passive `v2c_caster_acumen` changes; ordinary shields keep their formulas and source coverage.
- `effectiveInt = max(0, floor(INT) - 15)`.
- `maxDurability = floor(maxMP * 0.60 + effectiveInt * 2)`; zero effective INT or zero max MP produces no barrier.
- PvE absorb is `45% * effectiveInt / (effectiveInt + 250)`; PvP absorb uses `30%`.
- PvE durability efficiency is `30% * maxDurability / (maxDurability + 1500)`; PvP uses `20%`.
- Current MP is never consumed; all barrier values are snapshotted at combat start and never regenerate or recalculate mid-combat.
- Eligible hostile sources are direct, DoT, reflection, counterattack, and ordinary hostile status damage.
- Fixed, execution, explicit shield-bypass, self-inflicted, and HP-cost damage bypass mana shield.
- Defense, magic defense, and evasion never reduce the mana channel or its durability cost.
- For eligible direct damage: partition raw damage, mitigate only body damage, add unmitigated mana spill, then apply ordinary shield and HP.
- New combat fields remain optional so old replays and fixtures still render and simulate safely.
- Do not deploy or change maintenance mode.

---

### Task 1: Pure Mana-Shield Math and Combat-Start Snapshot

**Files:**
- Modify: `src/adventure/data/v2/v2CombatConstants.ts`
- Modify: `src/adventure/data/v2/v2CombatConstants.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Test: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Produces `MagicBarrierStats` fields `maxDurability`, `pveAbsorbPct`, `pvpAbsorbPct`, `pveEfficiencyPct`, and `pvpEfficiencyPct`.
- Produces `partitionWithMagicBarrier(rawDamage, durability, absorbPct, efficiencyPct): MagicBarrierPartition`.
- Extends `PlayerCombat` with optional `magicBarrierEfficiencyPct` and `magicBarrierPvpEfficiencyPct` alongside the existing optional barrier fields.

- [ ] **Step 1: Write failing formula and settlement tests**

Add literal, hand-derived assertions that catch the old caps, sequential post-defense behavior, and one-point over-absorption:

```ts
expect(magicBarrierStats(15, 1_500)).toEqual({
  maxDurability: 0,
  pveAbsorbPct: 0,
  pvpAbsorbPct: 0,
  pveEfficiencyPct: 0,
  pvpEfficiencyPct: 0,
});

expect(magicBarrierStats(315, 1_500)).toMatchObject({
  maxDurability: 1_500,
  pveAbsorbPct: 45 * (300 / 550),
  pvpAbsorbPct: 30 * (300 / 550),
  pveEfficiencyPct: 15,
  pvpEfficiencyPct: 10,
});

expect(partitionWithMagicBarrier(1_000, 1_500, 25, 20)).toEqual({
  bodyRawDamage: 750,
  absorbedDamage: 250,
  spillDamage: 0,
  durabilitySpent: 200,
  durabilityLeft: 1_300,
  destroyed: false,
});

expect(partitionWithMagicBarrier(1_000, 1, 25, 20)).toEqual({
  bodyRawDamage: 750,
  absorbedDamage: 1,
  spillDamage: 249,
  durabilitySpent: 1,
  durabilityLeft: 0,
  destroyed: true,
});
```

Add zero/negative input, percentage clamp, exact-depletion, and `ceil` durability-cost cases. In `derivePlayerCombatV2.test.ts`, derive a caster with the passive and assert all five snapshotted values while also asserting current MP is unchanged.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
npm test -- src/adventure/data/v2/v2CombatConstants.test.ts src/lib/server/derivePlayerCombatV2.test.ts
```

Expected: FAIL because the efficiency fields and `partitionWithMagicBarrier` do not exist and old absorb caps are 35/25.

- [ ] **Step 3: Implement the pure formulas and optional combat fields**

Add the explicit partition contract while temporarily retaining
`absorbWithMagicBarrier` as a deprecated compatibility wrapper until all engine callers are
migrated in Task 5:

```ts
export type MagicBarrierPartition = {
  bodyRawDamage: number;
  absorbedDamage: number;
  spillDamage: number;
  durabilitySpent: number;
  durabilityLeft: number;
  destroyed: boolean;
};

export function partitionWithMagicBarrier(
  rawDamage: number,
  durability: number,
  absorbPct: number,
  efficiencyPct: number,
): MagicBarrierPartition;
```

Clamp integer damage/durability to zero, clamp percentages to `[0, 100]`, calculate `targetShielded = floor(raw * absorb / 100)`, and use `costRatio = 1 - efficiency / 100`. If durability is insufficient, compute the greatest whole blocked damage whose `ceil(blocked * costRatio)` does not exceed remaining durability, spend all remaining durability when the target cannot be fully funded, and report the remainder as spill. `destroyed` is true only on a positive-to-zero transition caused by this event.

The compatibility wrapper must preserve its old result shape and semantics so Task 1 remains
type-safe before callers move:

```ts
/** @deprecated Migrate engine callers to resolveMagicBarrierDamage. */
export function absorbWithMagicBarrier(
  damage: number,
  durability: number,
  absorbPct: number,
): { absorbed: number; damageToHp: number; durabilityLeft: number };
```

Update `magicBarrierStats`, `PlayerCombat`, and `derivePlayerCombatV2` so all percentages are derived once at combat start and stored only when the barrier exists.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run:

```bash
npm test -- src/adventure/data/v2/v2CombatConstants.test.ts src/lib/server/derivePlayerCombatV2.test.ts
npx tsc --noEmit
```

Expected: all focused tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/data/v2/v2CombatConstants.ts src/adventure/data/v2/v2CombatConstants.test.ts src/adventure/v2/combat/engineState.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts
git commit -m "feat: add mana shield partition math"
```

---

### Task 2: Shared Barrier Resolution and Logs

**Files:**
- Create: `src/adventure/v2/combat/magicBarrier.ts`
- Create: `src/adventure/v2/combat/magicBarrier.test.ts`

**Interfaces:**
- Consumes `partitionWithMagicBarrier` and `MagicBarrierPartition` from Task 1.
- Produces `resolveMagicBarrierDamage(params): MagicBarrierDamageResult`, where callers pass raw damage, durability, mode-specific percentages, eligibility, and a body mitigation callback.
- Produces `appendMagicBarrierCombatLogs(log, result, targetName?)` using the approved blocked-damage/durability-spent wording and one destruction transition entry.

- [ ] **Step 1: Write failing resolver tests**

Use a literal body mitigation callback to prove channel independence:

```ts
const result = resolveMagicBarrierDamage({
  rawDamage: 1_000,
  durability: 1_500,
  absorbPct: 25,
  efficiencyPct: 20,
  eligible: true,
  mitigateBody: (bodyRaw) => Math.floor(bodyRaw * 0.5),
});

expect(result).toMatchObject({
  bodyRawDamage: 750,
  mitigatedBodyDamage: 375,
  absorbedDamage: 250,
  spillDamage: 0,
  hpBoundDamage: 375,
  durabilitySpent: 200,
});
```

Add tests proving `eligible: false` returns the original raw damage through `mitigateBody` without spending durability, missing optional percentages are inert, spill is added after body mitigation, and log text is exactly:

```text
[마나 실드] 피해 250 차단 · 내구도 200 소모 (남은 1,300)
[마나 실드 파괴] 내구도가 모두 소진되었다.
```

- [ ] **Step 2: Run the new test and confirm RED**

Run:

```bash
npm test -- src/adventure/v2/combat/magicBarrier.test.ts
```

Expected: FAIL because `magicBarrier.ts` does not exist.

- [ ] **Step 3: Implement the focused resolver module**

Define:

```ts
export type MagicBarrierDamageParams = {
  rawDamage: number;
  durability: number;
  absorbPct?: number;
  efficiencyPct?: number;
  eligible: boolean;
  mitigateBody: (bodyRawDamage: number) => number;
};

export type MagicBarrierDamageResult = MagicBarrierPartition & {
  mitigatedBodyDamage: number;
  hpBoundDamage: number;
};
```

For ineligible or inactive barriers, call `mitigateBody(rawDamage)` once and return no barrier activity. For active eligible barriers, partition first, call `mitigateBody(bodyRawDamage)` only, and return `max(0, floor(mitigatedBodyDamage)) + spillDamage` as `hpBoundDamage`. Export a log formatter returning zero, one, or two `BattleLogEntry`-compatible payloads without importing the full engine module.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run:

```bash
npm test -- src/adventure/v2/combat/magicBarrier.test.ts
npx tsc --noEmit
```

Expected: all resolver tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/combat/magicBarrier.ts src/adventure/v2/combat/magicBarrier.test.ts
git commit -m "feat: centralize mana shield damage resolution"
```

---

### Task 3: PvE Direct Damage Ordering

**Files:**
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/shieldReactionGate.test.ts`
- Modify: `src/adventure/v2/combat/engine.magicAttack.test.ts`
- Modify: `src/adventure/v2/combat/engine.monsterSkillSkipsBasic.test.ts`

**Interfaces:**
- Consumes `resolveMagicBarrierDamage` and snapshotted PvE absorb/efficiency values.
- Preserves ordinary shield as the last layer before HP for direct damage.

- [ ] **Step 1: Add failing PvE direct-damage regression tests**

Create deterministic combatants with no random avoidance and assert these observable outcomes:

```ts
// 1,000 pre-defense physical damage, 25% barrier share, 50% body mitigation.
// Body: 750 -> 375. Mana: 250 blocked. Final HP-bound: 375.
expect(startHp - next.playerHp).toBe(375);
expect(next.playerMagicBarrier).toBe(1_300);
```

Add a second case with an ordinary shield of 100 and assert HP loss 275, ordinary shield 0, and mana durability still 1,300. Add a depleted-barrier case that proves spill bypasses defense but ordinary shield can absorb that spill. Cover physical basic attacks, magical basic attacks, and both monster-skill branches currently using the old helper.

- [ ] **Step 2: Run the PvE tests and confirm RED**

Run:

```bash
npm test -- src/adventure/v2/combat/shieldReactionGate.test.ts src/adventure/v2/combat/engine.magicAttack.test.ts src/adventure/v2/combat/engine.monsterSkillSkipsBasic.test.ts
```

Expected: FAIL because the current engine applies defense/evasion and ordinary shield before mana shield.

- [ ] **Step 3: Route PvE direct damage through pre-defense partitioning**

In every eligible monster direct-hit path:

```ts
const barrier = resolveMagicBarrierDamage({
  rawDamage: preDefenseDamage,
  durability: state.playerMagicBarrier ?? 0,
  absorbPct: player.magicBarrierAbsorbPct,
  efficiencyPct: player.magicBarrierEfficiencyPct,
  eligible: true,
  mitigateBody: (bodyRaw) => applyExistingPvEDefenseEvasionAndReductions(bodyRaw),
});
const shieldAbsorbed = Math.min(playerShield, barrier.hpBoundDamage);
const damageToHp = barrier.hpBoundDamage - shieldAbsorbed;
```

Keep critical/heavy/curse multipliers in the raw channel, but leave effects explicitly modeled as fixed/execution/bypass outside `rawDamage`. Preserve current reaction gates except that mana-shield prevention alone does not count as ordinary shield fully stopping the hit. Append shared mana-shield logs and update current durability once per hit.

- [ ] **Step 4: Run PvE direct tests and confirm GREEN**

Run:

```bash
npm test -- src/adventure/v2/combat/shieldReactionGate.test.ts src/adventure/v2/combat/engine.magicAttack.test.ts src/adventure/v2/combat/engine.monsterSkillSkipsBasic.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/shieldReactionGate.test.ts src/adventure/v2/combat/engine.magicAttack.test.ts src/adventure/v2/combat/engine.monsterSkillSkipsBasic.test.ts
git commit -m "feat: partition pve direct damage through mana shield"
```

---

### Task 4: PvE DoT, Reflection, Counterattack, and Status Damage

**Files:**
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.dotClock.test.ts`
- Modify: `src/adventure/v2/combat/dotUnify.test.ts`
- Modify: `src/adventure/v2/combat/shieldReactionGate.test.ts`
- Modify: `src/adventure/v2/combat/statusDamageReduction.test.ts`

**Interfaces:**
- Consumes the shared resolver with `mitigateBody` matching each source's existing non-defense reductions.
- Ordinary shield remains untouched for all indirect sources.

- [ ] **Step 1: Add failing indirect-source tests**

For DoT, chill/curse status ticks, reflected damage, and counterattack damage, set a 25% absorb/20% efficiency barrier and assert a 1,000-damage event blocks 250, spends 200 durability, and sends 750 to HP after any source-specific reduction. Assert the ordinary shield value is unchanged in each indirect case.

Add bypass tests for fixed damage, execution damage, explicit shield-bypass damage, self-damage, and HP-cost skills:

```ts
expect(after.playerMagicBarrier).toBe(before.playerMagicBarrier);
expect(before.playerHp - after.playerHp).toBe(expectedUnshieldedDamage);
```

- [ ] **Step 2: Run indirect-source tests and confirm RED**

Run:

```bash
npm test -- src/adventure/v2/combat/engine.dotClock.test.ts src/adventure/v2/combat/dotUnify.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts src/adventure/v2/combat/statusDamageReduction.test.ts
```

Expected: FAIL because current DoT/status/reflection/counter paths skip mana shield and exclusions are not explicit.

- [ ] **Step 3: Integrate eligible PvE indirect damage**

At each hostile indirect application, call the resolver before subtracting HP:

```ts
const barrier = resolveMagicBarrierDamage({
  rawDamage: hostileDamage,
  durability: currentBarrier,
  absorbPct: player.magicBarrierAbsorbPct,
  efficiencyPct: player.magicBarrierEfficiencyPct,
  eligible: sourceKind === "dot" || sourceKind === "reflect" || sourceKind === "counter" || sourceKind === "status",
  mitigateBody: applyExistingSourceReduction,
});
```

Write `barrier.hpBoundDamage` directly to HP for indirect sources, never consume `playerShield`, update the barrier durability, and append the shared logs. Leave fixed/execution/bypass/self/HP-cost calls outside the eligible resolver or pass `eligible: false` explicitly at a named classification boundary.

- [ ] **Step 4: Run indirect-source tests and confirm GREEN**

Run:

```bash
npm test -- src/adventure/v2/combat/engine.dotClock.test.ts src/adventure/v2/combat/dotUnify.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts src/adventure/v2/combat/statusDamageReduction.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.dotClock.test.ts src/adventure/v2/combat/dotUnify.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts src/adventure/v2/combat/statusDamageReduction.test.ts
git commit -m "feat: cover hostile pve damage with mana shield"
```

---

### Task 5: PvP Direct and Indirect Damage Parity

**Files:**
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`
- Modify: `src/adventure/battle/engine-pvp.test.ts`
- Modify: `src/adventure/v2/combat/pvpMartialCounter.test.ts`
- Modify: `src/adventure/v2/combat/shieldReactionGate.test.ts`

**Interfaces:**
- Consumes `resolveMagicBarrierDamage` with `magicBarrierPvpAbsorbPct` and `magicBarrierPvpEfficiencyPct`.
- Preserves the current PvP scaling and source-specific defense rules on the body channel only.

- [ ] **Step 1: Add failing PvP parity and exclusion tests**

Add deterministic PvP fixtures covering basic direct damage, active-skill direct damage, DoT, reflection, and martial/rune counterattack. For a shared raw fixture, assert PvP differs from PvE only by the configured absorb/efficiency percentages. Add an ordinary-shield ordering assertion for direct damage and unchanged ordinary-shield assertions for indirect damage.

Add fixed/execution/bypass/self/HP-cost cases and assert that no mana durability is spent.

- [ ] **Step 2: Run PvP tests and confirm RED**

Run:

```bash
npm test -- src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/pvpMartialCounter.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts
```

Expected: FAIL because PvP currently applies mana shield after ordinary shield and does not cover indirect hostile sources.

- [ ] **Step 3: Integrate the shared resolver across PvP paths**

Partition each eligible direct event before defender defense/evasion/received-damage reductions, then combine mitigated body and unmitigated spill before the ordinary shield. For DoT, reflection, and counterattack, preserve the existing source-specific reduction callback, skip ordinary shield, and update the defender's current `magicBarrier` exactly once. Keep fixed/execution/bypass/self/HP-cost components separately accounted so they never consume mana durability.

Replace every old `absorbWithMagicBarrier` call and use the shared log payloads. Preserve optional-field fallbacks for old PvP snapshots. After `rg -n "absorbWithMagicBarrier" src` shows no production callers, remove the deprecated wrapper and migrate or delete its old unit assertions so only the partition contract remains.

- [ ] **Step 4: Run PvP tests and confirm GREEN**

Run:

```bash
npm test -- src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/pvpMartialCounter.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/engine.pvp-atb.ts src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/pvpMartialCounter.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts
git commit -m "feat: apply mana shield consistently in pvp"
```

---

### Task 6: Player-Facing Stats, Matchup Summary, Logs, and Skill Text

**Files:**
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/components/adventure/StatsPanel.tsx`
- Modify: `src/components/adventure/StatsPanel.test.ts`
- Modify: `src/components/adventure/CombatMatchupSummary.tsx`
- Modify: `src/components/adventure/CombatMatchupSummary.test.tsx`
- Modify: `src/components/adventure/BattleScene.tsx`
- Modify: `src/components/adventure/BattleScene.test.tsx`
- Modify: `src/components/adventure/BattleLogList.test.tsx`

**Interfaces:**
- Consumes all five snapshotted barrier stats from `PlayerCombat`.
- Keeps the existing violet durability bar and opaque surface tokens.

- [ ] **Step 1: Add failing rendering tests**

Assert active mana shield renders:

```text
마나 실드 1,500
마나 실드 흡수율 24.5%
마나 실드 경감률 15.0%
```

Assert the matchup summary says the absorb share is divided from pre-defense damage and the remaining body share receives defense/evasion, rather than multiplying mana shield after those reductions. Render an old fixture with all new efficiency fields omitted and assert it does not throw or display `NaN`. Keep the violet durability bar and distinct `[마나 실드 파괴]` log styling.

- [ ] **Step 2: Run UI tests and confirm RED**

Run:

```bash
npm test -- src/components/adventure/StatsPanel.test.ts src/components/adventure/CombatMatchupSummary.test.tsx src/components/adventure/BattleScene.test.tsx src/components/adventure/BattleLogList.test.tsx
```

Expected: FAIL because efficiency is not shown and the matchup summary still models a sequential multiplier.

- [ ] **Step 3: Update UI and tooltip copy**

Add optional efficiency props through `BattleScene` to `CombatMatchupSummary`, format absent values as inactive, and replace the sequential multiplier row with a pre-defense partition explanation. Update `v2c_caster_acumen` to state combat-start durability, INT-driven absorb, max-MP-driven durability efficiency, current-MP independence, supported hostile sources, bypass categories, and ordinary-shield ordering in concise skill-detail prose.

Use existing opaque surface tokens from `src/components/ui/surfaces.ts`; do not introduce translucent body/card backgrounds.

- [ ] **Step 4: Run UI tests and confirm GREEN**

Run:

```bash
npm test -- src/components/adventure/StatsPanel.test.ts src/components/adventure/CombatMatchupSummary.test.tsx src/components/adventure/BattleScene.test.tsx src/components/adventure/BattleLogList.test.tsx
```

Expected: all listed tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/data/v2/v2SkillsCommonCatalog.ts src/components/adventure/StatsPanel.tsx src/components/adventure/StatsPanel.test.ts src/components/adventure/CombatMatchupSummary.tsx src/components/adventure/CombatMatchupSummary.test.tsx src/components/adventure/BattleScene.tsx src/components/adventure/BattleScene.test.tsx src/components/adventure/BattleLogList.test.tsx
git commit -m "docs: explain mana shield combat behavior in ui"
```

---

### Task 7: Manual Update and Existing Complex-Skill Audit

**Files:**
- Modify: `src/app/manual/content/combat.tsx`
- Modify: `src/app/manual/content/stats.tsx`
- Modify: `src/app/manual/content/skills.tsx`
- Modify: `src/app/manual/current-content.test.ts`
- Create: `docs/game-design/complex-skill-manual-audit.md`

**Interfaces:**
- Documents only behavior verified against catalog definitions and engine call sites.
- Produces a reusable audit checklist and a bounded inventory for future manual upkeep.

- [ ] **Step 1: Add failing manual-content tests for behavior, not source wording**

Render the manual sections and assert player-visible concepts are present: combat-start snapshot, no current-MP use, pre-defense partition, durability-cost efficiency, direct/DoT/reflect/counter/status coverage, fixed/execution/bypass/self/HP-cost exclusions, ordinary-shield separation, and PvE/PvP formulas.

For the skills page, assert headings or descriptions exist for these verified complex-mechanic families:

```text
중첩과 상한
반사와 반격
전투당 1회 생존
HP 비용과 보호막 우회
PvE·PvP 차이
```

- [ ] **Step 2: Run the manual test and confirm RED**

Run:

```bash
npm test -- src/app/manual/current-content.test.ts
```

Expected: FAIL because the current manual describes the old direct-only, post-shield mana behavior and lacks the complex-mechanic guide.

- [ ] **Step 3: Audit authoritative data and engine paths**

Record each candidate in `docs/game-design/complex-skill-manual-audit.md` with columns `기믹`, `대표 스킬`, `판단에 중요한 규칙`, `근거 파일`, and `매뉴얼 반영 위치`. Audit these bounded families:

- magic-vulnerability/spell/poison/bleed stacks and their hard caps;
- reflection and counterattack trigger/order rules;
- once-per-combat survival effects;
- HP-cost and self-damage behavior;
- explicit PvE/PvP coefficient or cap differences.

Mark only rules verified in `v2SkillsCommonCatalog.ts`, `v2CombatConstants.ts`, `engine.ts`, `engine.playerPhase.ts`, `engine.enemyPhase.ts`, `engine-pvp.ts`, or `engine.pvpPhase.ts`; omit uncertain prose rather than inferring it.

- [ ] **Step 4: Update the manual from the verified audit**

Rewrite the mana-shield notes in combat/stats with the approved formulas and ordering. Add a `복합 스킬 효과 읽는 법` section to `skills.tsx` under the five tested headings, using representative skills from the audit and explaining caps, source exclusions, trigger timing, and one-use flags without changing balance data.

- [ ] **Step 5: Run manual tests and confirm GREEN**

Run:

```bash
npm test -- src/app/manual/current-content.test.ts
npx tsc --noEmit
```

Expected: manual tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/manual/content/combat.tsx src/app/manual/content/stats.tsx src/app/manual/content/skills.tsx src/app/manual/current-content.test.ts docs/game-design/complex-skill-manual-audit.md
git commit -m "docs: document complex combat skill mechanics"
```

---

### Task 8: Full Regression, Static Analysis, and Production Build

**Files:**
- Modify only files required to fix regressions caused by Tasks 1-7.

**Interfaces:**
- Verifies the complete implementation and distinguishes the known baseline simulation timeout from new failures.

- [ ] **Step 1: Run the complete focused regression set**

Run:

```bash
npm test -- src/adventure/data/v2/v2CombatConstants.test.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/magicBarrier.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts src/adventure/v2/combat/engine.magicAttack.test.ts src/adventure/v2/combat/engine.monsterSkillSkipsBasic.test.ts src/adventure/v2/combat/engine.dotClock.test.ts src/adventure/v2/combat/dotUnify.test.ts src/adventure/v2/combat/statusDamageReduction.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/pvpMartialCounter.test.ts src/components/adventure/StatsPanel.test.ts src/components/adventure/CombatMatchupSummary.test.tsx src/components/adventure/BattleScene.test.tsx src/components/adventure/BattleLogList.test.tsx src/app/manual/current-content.test.ts
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run type checking and lint**

Run:

```bash
npx tsc --noEmit
npx eslint src/adventure/data/v2/v2CombatConstants.ts src/adventure/data/v2/v2CombatConstants.test.ts src/adventure/v2/combat/magicBarrier.ts src/adventure/v2/combat/magicBarrier.test.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/engine.pvp-atb.ts src/lib/server/derivePlayerCombatV2.ts src/components/adventure/StatsPanel.tsx src/components/adventure/CombatMatchupSummary.tsx src/components/adventure/BattleScene.tsx src/app/manual/content/combat.tsx src/app/manual/content/stats.tsx src/app/manual/content/skills.tsx
```

Expected: both commands exit 0.

- [ ] **Step 3: Run full tests**

Run:

```bash
npm test
```

Expected: zero new failures. If `levelDesignSim.test.ts` alone exceeds its existing 15-second limit, rerun that file once in isolation and report it separately from feature regressions.

- [ ] **Step 4: Run image validation and production build**

Run:

```bash
npm run check-images
npm run build
```

Expected: both commands exit 0; the build also runs the idempotent image optimizer and reference check through `prebuild`.

- [ ] **Step 5: Review diff and commit any verification-only corrections**

```bash
git status --short
git diff --check
git diff --stat HEAD~7..HEAD
```

If verification required corrections, stage only those files and commit them as:

```bash
git commit -m "fix: complete mana shield regression coverage"
```
