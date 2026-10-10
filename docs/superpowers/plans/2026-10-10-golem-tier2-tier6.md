# Golem Tier 2-6 Lineage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the five-job golem lineage (바위투사 → 태고골렘) with ten weight-cycle skills that work identically in PvE and PvP and are priced by the existing power/SP rubric.

**Architecture:** A declarative `weightCycle` field on skill definitions (mirroring `bleedHunt`) is read by one pure resolver in `mutationCombat.ts`; `resolveV2SkillCast` folds its output into the existing haste/delay/shield/heal/pierce channels, so PvE and PvP pick it up through the shared cast path. Two always-on passive effects (SPD penalty relief, full-weight damage reduction) are derived from the equipped list at the existing SPD and damage-reduction call sites, with no derive/save plumbing.

**Tech Stack:** TypeScript 5, Next.js 16 App Router, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-10-golem-tier2-tier6-design.md`

## Global Constraints

- Weight stays `0~3`; shared rule `+5%` direct physical skill damage and `−5%` SPD per stack is unchanged when no golem-line passive is equipped.
- Existing `v2c_golem_rocksmash`, `v2c_golem_tectoniccollapse`, `v2c_golem_stoneskin` behaviour and SP stay byte-identical.
- Unlock thresholds reuse `TIER2_UNLOCK_CUMLEVEL`…`TIER6_UNLOCK_CUMLEVEL`; prerequisites read `cumLevelForJob` of the job directly below.
- Current job never gates any weight-cycle effect (collectible skills).
- Bonuses apply only to pure direct physical skills (`isPureDirectPhysicalSkill`); basic attacks, magic, DoT, reflect, counter, fixed and equipment extra hits excluded.
- No `fixedMpCost`, no cooldowns, no `spCostDiscount`; job tempo `steady`, builders `control`, releases `payoff`.
- No DB/save changes, no deploy, no maintenance mode, no subagents. Work in `/tmp/wt-golem-line` on `feat/golem-tier2-tier6`.
- Player-facing copy: no markdown or dashes in descriptions, no "v2" wording.

## Review Focus

1. Release with 0 weight (e.g. 암반 내려찍기 at weight 0) — base damage only, no haste/shield/regain/log line. Test in Task 3.
2. 지각 붕괴 (no `weightCycle`) used as the release while 짐 벗기/암벽 갑주/산맥의 몸 are equipped — passives still fire. Test in Task 4.
3. Release skill cast that misses — weight consumed, haste/shield/regain applied, delay and actual-damage heal not applied. Test in Task 5.
4. A non-golem job equipping only 강철 골격 with 0 weight — SPD unchanged; with weight 3 — SPD ×0.91 not ×0.85. Test in Task 5.
5. Golem enemy in PvP with 대지의 정점 at weight 3 — reduction applies to the defender side only, and sums with existing reduction before existing caps. Test in Task 5.

---

### Task 1: Weight-cycle metadata, scoring and skill-detail chips

**Files:**
- Create: `src/adventure/data/v2/weightCycle.ts`
- Create: `src/adventure/data/v2/weightCycle.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts` (field on `V2SkillDefinition` next to `bleedHunt`; score at the two `bleedHuntPowerValue` sites ~L1002/L1076; chips next to `describeBleedHunt` ~L2874)

**Interfaces:**
- Produces:
```ts
export const WEIGHT_CYCLE_AVG_CONSUME = 2.4;
export const WEIGHT_CYCLE_FULL_UPTIME = 0.35;
export const WEIGHT_CYCLE_OVERLOAD_RATE = 0.35;
export type WeightCycleMechanic = {
  gain?: { amount: number; amountFromEmpty?: number; overloadPenetrationPct?: number };
  release?: {
    damagePctPerStack: number;
    enemyDelayPctPerStack?: number; enemyDelayMaxPct?: number;
    fullPenetrationPct?: number; fullActualDamageHealPct?: number; fullCastHastePct?: number;
  };
  onRelease?: {
    hastePctPerStack?: number; hasteMaxPct?: number;
    shieldMaxHpPctPerStack?: number; regainWeight?: number;
  };
  speedPenaltyPctPerStack?: number;
  fullWeightDirectPhysicalDamagePct?: number;
  fullWeightDamageTakenReductionPct?: number;
};
export function weightCyclePowerValue(m: WeightCycleMechanic | undefined, rawActive: number): number;
export function describeWeightCycle(m: WeightCycleMechanic): string[];
```
`V2SkillDefinition.weightCycle?: WeightCycleMechanic`.

- [ ] **Step 1: Write `weightCycle.test.ts`**
  - `weightCyclePowerValue(undefined, 2)` → `0`.
  - Monotonic: raising any single field (each of the 13 numeric fields) strictly increases the value; e.g. `{release:{damagePctPerStack:15}}` < `{release:{damagePctPerStack:18}}`.
  - `release.damagePctPerStack` scales with `rawActive`: value at `rawActive=2` is exactly double the value at `rawActive=1` when only that field is set.
  - `describeWeightCycle({gain:{amount:1, amountFromEmpty:2}})` → `["중량 +1 · 중량 0에서 +2 (최대 3)"]`; `{gain:{amount:1, overloadPenetrationPct:10}}` includes `"중량 3에서 과적 타격: 방어 관통 +10%p"`; `{onRelease:{hastePctPerStack:5,hasteMaxPct:15}}` → `"해방 시 소모 1당 다음 행동 5% 가속 (최대 15%)"`; `{speedPenaltyPctPerStack:3}` → `"중량당 SPD 감소 5% → 3%"`.

- [ ] **Step 2: Run** `npx vitest run src/adventure/data/v2/weightCycle.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `weightCycle.ts`**
  Score = sum of terms, reusing the bleedHunt divisors (haste `22/3`, penetration `3`, damage `4`, delay `40`, actual heal `8`) plus shield `/16` (same as the `shield` effect):
  - gain: `(amountFromEmpty − amount) × 0.4 × (1 − OVERLOAD_RATE)` + `overloadPenetrationPct / 3 × OVERLOAD_RATE`
  - release: `rawActive × damagePctPerStack × AVG_CONSUME / 100` + `min(delayPerStack × AVG, delayMax) / 40` + full terms `× FULL_UPTIME` (pen `/3`, heal `/8`, haste `/(22/3)`)
  - onRelease: `min(hastePerStack × AVG, hasteMax) / (22/3)` + `shieldPerStack × AVG / 16` + `regainWeight × 0.4`
  - `(5 − speedPenaltyPctPerStack) × AVG / (22/3)` when set; `fullWeightDirectPhysicalDamagePct / 4 × FULL_UPTIME`; `fullWeightDamageTakenReductionPct / 8 × FULL_UPTIME`
  Wire `weightCyclePowerValue(def.weightCycle, raw)` into both score sites (passive branch passes `0` as `rawActive`), and `describeWeightCycle` chips next to `describeBleedHunt`. Add a release chip `"중량 전부 소모 · 소모 1당 최종 피해 +N%"` plus full-consume chips from `release`.

- [ ] **Step 4: Run Step 1 test** — Expected: PASS.

- [ ] **Step 5: Run** `npx vitest run src/adventure/data/v2/weightCycle.test.ts src/adventure/data/v2/v2Skills.test.ts` — Expected: PASS (no existing skill declares `weightCycle`, so scores are unchanged).

- [ ] **Step 6: Commit** `feat: 중량 순환 메타데이터와 성능 점수`

### Task 2: Register the five jobs and ten skills

**Files:**
- Create: `src/adventure/data/v2/golemJobLine.test.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts` (ID union and definitions after `v2c_golem_stoneskin`)
- Modify: `src/adventure/data/v2/__snapshots__/v2SkillDetails.test.ts.snap` (regenerate with `-u` only after reviewing that the diff contains only the ten new skills)
- Modify: `src/adventure/data/v2/v2JobCatalog.ts` (tier-2 block after `beastwarrior`; tier 3/4/5/6 blocks after `tracker`/`bloodtracker`/`predator`/`primalpredator`; `LEGACY_CLASS_SPEC_BY_JOB` with `class: "mutant"`)
- Modify: `src/adventure/data/v2/proficiency.ts` (~L177 profiles), `src/adventure/data/v2/v2Skills.ts` (~L1249 tempo `steady`), `src/adventure/data/v2/v2SkillsByJob.ts` (after `golem`)
- Modify tests: `v2JobCatalog.test.ts`, `proficiency.test.ts`, `v2SkillsByJob.test.ts`, `src/adventure/v2/jobRoadmapModel.test.ts`, `jobExplorer.test.ts`, `V2JobLadder.test.tsx`, `src/app/manual/jobManualModel.test.ts`

**Interfaces:**
- Consumes: `WeightCycleMechanic` (Task 1).
- Produces: job IDs `rockbrawler`, `rockgiant`, `irongolem`, `mountaingolem`, `primevalgolem` and the ten skill IDs below.

- [ ] **Step 1: Write failing tests**
  - Catalog rows exactly as the spec's 직업 성장 table (name, tier, `cultivateProfile`, `jobBonus`, single prereq).
  - Boundaries via `isJobUnlocked`: golem `jobCumLevel` 999/1000 → rockbrawler; 2499/2500 → rockgiant; 4499/4500 → irongolem; 17999/18000 → mountaingolem; 34999/35000 → primevalgolem. `groups.mutant = 99_999` and beastkin line at 99_999 do not unlock rockbrawler.
  - `V2_SKILLS_BY_JOB[jobId]` equals the `[active, passive]` pairs in the table below; job tempo `steady`; proficiency profile equals `cultivateProfile`.
  - Roadmap/explorer/ladder: golem node children `["rockbrawler"]` and single chain to `primevalgolem`; mutant children unchanged `["beastkin","golem"]`.
  - Manual model lists all five under line `mutant` with skills and the unlock text `"<직업명> 숙련도 N"`.
  - Update existing exact job-count / tier-count assertions by `+5` (tier 2 +1, tier 3..6 +1 each).
- [ ] **Step 1b: Write `golemJobLine.test.ts`** modelled on `beastkinJobLine.test.ts` (`PACKAGES` table; one attack + one passive; no `fixedMpCost`/cooldown/`spCostDiscount`; power envelope and exact SP; data declares each approved number):

| Job | Active (tier, tempo, weightCycle) | Passive (passive stats, weightCycle) | Power | SP |
|---|---|---|---|---|
| rockbrawler | `v2c_rockbrawler_boulderroll` 바위 굴리기 (2, control, `gain:{amount:1,amountFromEmpty:2}`) | `v2c_rockbrawler_unburden` 짐 벗기 (`{}`, `onRelease:{hastePctPerStack:5,hasteMaxPct:15}`) | 2.30–2.50 | 8 |
| rockgiant | `v2c_rockgiant_bedrockslam` 암반 내려찍기 (3, payoff, `release:{damagePctPerStack:15,enemyDelayPctPerStack:6,enemyDelayMaxPct:18}`) | `v2c_rockgiant_rampart` 암벽 갑주 (`statPct:{vit:10}`, `onRelease:{shieldMaxHpPctPerStack:3}`) | 2.90–3.10 | 9 |
| irongolem | `v2c_irongolem_ironhammer` 강철 망치 (3, control, `gain:{amount:1,overloadPenetrationPct:10}`) | `v2c_irongolem_ironframe` 강철 골격 (`statPct:{str:12}`, `speedPenaltyPctPerStack:3`) | 3.70–3.90 | 12 |
| mountaingolem | `v2c_mountaingolem_landslide` 산사태 (3, payoff, `release:{damagePctPerStack:18,fullActualDamageHealPct:14}`) | `v2c_mountaingolem_mountainbody` 산맥의 몸 (`statPct:{vit:12}, maxHpPct:12`, `onRelease:{regainWeight:1}`) | 5.00–5.20 | 15 |
| primevalgolem | `v2c_primevalgolem_primordialcollapse` 태고의 붕괴 (3, payoff, `release:{damagePctPerStack:20,fullPenetrationPct:12,fullCastHastePct:15}`) | `v2c_primevalgolem_apex` 대지의 정점 (`statPct:{vit:24,str:18}, maxHpPct:16`, `fullWeightDirectPhysicalDamagePct:10, fullWeightDamageTakenReductionPct:8`) | 9.20–9.40 | 26 |

  Also assert: all ten skills `stat: "vit"` for actives and every active effect is a single `dmg(..., "def")`; release actives carry `defaultPattern` `{priority: 500, condition: {kind:"self_resource", resource:"weight", op:"atLeast", value:3}}`; 바위 굴리기 carries `{priority: 450, condition: {kind:"self_resource", resource:"weight", op:"atMost", value:0}}`; the existing three golem skills' `spCostOf` equal their pre-change values (capture them in the test as literals before adding any definitions).

- [ ] **Step 3b: Add the ten definitions and ID union entries.** Start each active from the same-tier beastkin active's `mpCost`/`procChance`/`dmg` coefficients but with `"def"` scaling, then adjust only damage coefficients (not SP) until each package lands in its envelope. Descriptions are one plain Korean sentence each.

- [ ] **Step 4b: Run** `npx vitest run src/adventure/data/v2/golemJobLine.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillDetails.test.ts` — review the snapshot diff, then re-run with `-u` for that snapshot only. Expected: PASS.

- [ ] **Step 2: Run** the test files above — Expected: FAIL.
- [ ] **Step 3: Implement** catalog, legacy mapping, profiles, tempo and job→skills mapping.
- [ ] **Step 4: Run** the same files — Expected: PASS.
- [ ] **Step 5: Commit** `feat: 골렘 2~6차 직업과 스킬 등록`

### Task 3: Pure weight-cycle resolver

**Files:**
- Modify: `src/adventure/v2/combat/mutationCombat.ts`
- Modify: `src/adventure/v2/combat/mutationCombat.test.ts`

**Interfaces:**
- Consumes: `WeightCycleMechanic` (Task 1) and the skill IDs (Task 2).
- Produces:
```ts
export type WeightCycleCastResolution = {
  consumes: boolean;            // active has release or mutationWeightConsumePctPerStack > 0
  consumed: number;             // pre-cast weight if consumes, else 0
  weightGain: number;           // 0 when consumes
  regainAfterConsume: number;   // from equipped onRelease.regainWeight, only if consumed > 0
  releaseDamagePct: number;     // release.damagePctPerStack × consumed
  piercePct: number;            // overload pen (pre-cast 3) + fullPenetrationPct (consumed 3)
  directPhysicalDamagePct: number; // fullWeightDirectPhysicalDamagePct if pre-cast 3
  selfHastePct: number;         // min(onRelease haste) + fullCastHastePct
  enemyDelayPct: number;        // min(delayPerStack × consumed, max)
  shieldMaxHpPct: number;       // shieldMaxHpPctPerStack × consumed
  actualDamageHealPct: number;  // fullActualDamageHealPct if consumed 3
};
export function resolveWeightCycleCast(input: {
  preCastWeight: number;
  active: { weightCycle?: WeightCycleMechanic; mutationWeightGain?: number; mutationWeightConsumePctPerStack?: number };
  equippedPassives: readonly WeightCycleMechanic[];
}): WeightCycleCastResolution;
export function weightSpeedMultiplier(weight: number, pctPerStack?: number): number; // default 5, unchanged for callers
export function equippedWeightCycleProfile(equipped: readonly string[]): {
  speedPenaltyPctPerStack: number;      // min over equipped passives, default 5
  fullWeightDamageTakenReductionPct: number; // sum
};
export function weightFullDamageTakenReductionPct(weight: number, equipped: readonly string[]): number;
```
`mutationCastTransition` gains optional `regainAfterConsume?: number` (applied after consume, clamped) and returns `weightRegained: number`; `mutationTransitionLogLines` appends `[산맥의 몸] 중량 +N (W/3)` when `weightRegained > 0`.

- [ ] **Step 1: Write failing tests** in `mutationCombat.test.ts`:
  - For each pre-cast weight 0,1,2,3: 바위 굴리기 gain = `2,1,1,1`; 강철 망치 gain `1,1,1,1` (clamped later by transition) and pierce `0,0,0,10`.
  - 암반 내려찍기 at 0/1/2/3: `releaseDamagePct 0/15/30/45`, `enemyDelayPct 0/6/12/18`.
  - 지각 붕괴 (no `weightCycle`, consume 20) at 3 with 짐 벗기 + 암벽 갑주 + 산맥의 몸 equipped → `selfHastePct 15`, `shieldMaxHpPct 9`, `regainAfterConsume 1`; at 0 → all three 0.
  - 짐 벗기 cap: consumed 3 at 5% → 15; 태고의 붕괴 consumed 3 + 짐 벗기 → `selfHastePct 30`; consumed 2 → `10` (full bonus requires 3).
  - 산사태 consumed 3 → `actualDamageHealPct 14`; consumed 2 → `0`.
  - 대지의 정점 equipped, pre-cast 3, non-release active → `directPhysicalDamagePct 10`; pre-cast 2 → `0`.
  - `weightSpeedMultiplier(3)` → `0.85`; `weightSpeedMultiplier(3, 3)` → `0.91`.
  - `equippedWeightCycleProfile([])` → `{5, 0}`; `["v2c_irongolem_ironframe"]` → `{3, 0}`; `weightFullDamageTakenReductionPct(3, ["v2c_primevalgolem_apex"])` → `8`, at weight 2 → `0`.
  - `mutationCastTransition(3, {consumeWeight:true, regainAfterConsume:1})` → `{weightAfter:1, weightConsumed:3, weightRegained:1}`; log lines `["[암반 내려찍기] 중량 3 소모", "[산맥의 몸] 중량 +1 (1/3)"]` when named.
- [ ] **Step 2: Run** `npx vitest run src/adventure/v2/combat/mutationCombat.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the functions above in `mutationCombat.ts` (look up equipped passives with `V2_SKILLS[id]?.category === "passive" && V2_SKILLS[id]?.weightCycle`).
- [ ] **Step 4: Run** the test file plus `mutationCombatEngine.test.ts` — Expected: PASS (existing callers unchanged).
- [ ] **Step 5: Commit** `feat: 중량 순환 판정 순수 함수`

### Task 4: Fold the resolution into the shared cast path

**Files:**
- Modify: `src/adventure/v2/combat/combatShared.ts` (`resolveV2SkillCast`: snapshot near `bleedSnapshot` ~L1342; pierce in `directDamagePiercePct` ~L1437; damage in `physicalMutationMult` ~L1922; payoff `mutationPayoffPct` ~L1931; transition ~L1939; shield/haste/delay/heal channels)
- Create: `src/adventure/v2/combat/weightCycleCast.test.ts`

**Interfaces:**
- Consumes: `resolveWeightCycleCast`, extended `mutationCastTransition` (Task 3).
- Produces: `V2SkillCastResult.mutationTransition.weightRegained`; weight-cycle effects delivered through existing `selfHasteToApply`, `enemyDelayToApply`, `shieldToApply`, `healFromActualDamagePct`.

- [ ] **Step 1: Write failing tests** calling `resolveV2SkillCast` directly (attacker `def: 100`, `maxHp: 10_000`, `mutationWeight` set, `procRoll: 0`):
  - 암반 내려찍기 at weight 3 deals `round(base × 1.15 weight-mult × 1.45)` relative to weight 0 (compute ratio, tolerance ±1), `enemyDelayToApply.pct 18`, transition `weightAfter 0`.
  - 지각 붕괴 at weight 3 with 암벽 갑주 + 짐 벗기 equipped → `shieldToApply.hp 900`, `selfHasteToApply.pct 15`; same at weight 0 → no shield, no haste.
  - 산맥의 몸 equipped + 지각 붕괴 at 3 → `weightAfter 1`, `weightRegained 1`, and damage equals the no-regain case (regain not counted in this hit).
  - 강철 망치 at 3 → `weightAfter 3`, damage ratio vs. weight-2 cast reflects +10%p pierce against a `def` target; at 2 → `weightAfter 3`.
  - 태고의 붕괴 at 3 → `healFromActualDamagePct 0`, `selfHasteToApply.pct 15`; 산사태 at 3 → `healFromActualDamagePct 14`.
  - A magic attack skill with 대지의 정점 at weight 3 → no damage change (pure direct physical only).
  - Existing 암석 강타 / 지각 붕괴 results are identical with no golem-line passive equipped (compare to a captured baseline object from before the change).
- [ ] **Step 2: Run** `npx vitest run src/adventure/v2/combat/weightCycleCast.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** — move the `mutationWeight` snapshot up beside `bleedSnapshot`; call `resolveWeightCycleCast` once; add `piercePct` into `directDamagePiercePct`; multiply `(1 + directPhysicalDamagePct/100)` into `physicalMutationMult`; set `mutationPayoffPct` = `releaseDamagePct` when the active has `weightCycle.release`, else keep the legacy formula; pass `weightGain`, `consumeWeight`, `regainAfterConsume` to `mutationCastTransition`; merge haste/delay/shield (`floor(maxHp × pct / 100)`, `turns: 3`)/heal into the existing variables.
- [ ] **Step 4: Run** the new test plus `combatPatternCast.test.ts`, `mutationCombatEngine.test.ts`, `bleedHuntCast.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: 공용 시전 해석에 중량 순환 반영`

### Task 5: Engine SPD, damage-taken and logs (PvE + PvP)

**Files:**
- Modify: `src/adventure/v2/combat/engine.atbSpeed.ts:23`, `engine.pvp-atb.ts:79`, `engine.pvpPhase.ts:129-134` (pass `equippedWeightCycleProfile(...).speedPenaltyPctPerStack`)
- Modify: `src/adventure/v2/combat/engine.enemySkills.ts` (`generalReductionPct` ~L120), `engine.enemyPhase.ts` (`passiveReducePct` ~L1055), `pvpDamageReduction.ts` (add `weightFullDamageTakenReductionPct(stacks.mutationWeight, v2Skills.equipped)`)
- Modify: `src/adventure/v2/combat/engine.playerSkills.ts` (~L1142) and `engine.pvpSkills.ts` (~L1643) log loops — no code change expected if Task 3's log lines flow through `mutationTransitionLogLines`; add haste/shield log lines `[짐 벗기] 다음 행동 N% 가속`, `[암벽 갑주] 보호막 +N%`, `[강철 망치] 과적 타격` via the same helper (extend its input with the resolution).
- Create: `src/adventure/v2/combat/weightCycleEngine.test.ts` (harness copied from `mutationCombatEngine.test.ts`)

**Interfaces:**
- Consumes: Task 3 functions; Task 4 cast result.

- [ ] **Step 1: Write failing tests**, PvE (`applyPlayerV2SkillCast`, `effectivePlayerSpd`, `resolveEnemyPhase`) and PvP (`castV2SkillOnAttackerTurnPvP`, `effectiveSideSpd`, enemy-phase damage via `pvpSideDamageTakenReductionPct`):
  - `effectivePlayerSpd` at weight 3: `0.85×` without 강철 골격, `0.91×` with it; non-golem job equipping only 강철 골격 at weight 0 → unchanged. Same three cases for `effectiveSideSpd`.
  - Incoming enemy basic attack and enemy skill at player weight 3 with 대지의 정점: damage `= floor(base × 0.92)` (±1) vs. no passive; at weight 2 unchanged. PvP: `pvpSideDamageTakenReductionPct(defender)` increases by exactly 8 at weight 3, 0 at weight 2, and the attacker's equipped 대지의 정점 does not affect the defender.
  - Release that misses (`Math.random` mocked to force miss): weight 0 after, shield and haste applied, no enemy delay, no heal.
  - Logs after 암반 내려찍기 at 3 with 짐 벗기, 암벽 갑주, 산맥의 몸: contains `[암반 내려찍기] 중량 3 소모`, `[짐 벗기] 다음 행동 15% 가속`, `[암벽 갑주] 보호막 +9%`, `[산맥의 몸] 중량 +1 (1/3)` in that order; 강철 망치 at 3 logs `[강철 망치] 과적 타격`.
  - Haste sum 30% respects the existing ATB action-interval floor (assert the next interval equals the floor-clamped value used by `selfHaste` today).
- [ ] **Step 2: Run** `npx vitest run src/adventure/v2/combat/weightCycleEngine.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the call-site changes listed under Files.
- [ ] **Step 4: Run** the new test plus `npx vitest run src/adventure/v2/combat` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: 골렘 계보 속도·받는 피해·로그 PvE/PvP 반영`

### Task 6: Deterministic balance simulation

**Files:**
- Create: `scripts/sim-v2-golem-jobs.ts` (structure copied from `scripts/sim-v2-beastkin-jobs.ts`; export `runGolemBalance(seed: number, trials: number)`)
- Create: `src/adventure/v2/combat/weightCycleBalance.test.ts` (copied from `bleedHuntBalance.test.ts`)
- Modify only if tuning is required: `v2SkillsCommonCatalog.ts`, `weightCycle.ts`, `golemJobLine.test.ts`

**Interfaces:**
- Produces: report `cases[]` with `jobId, variant ("lineage"|"portable"), power, sp, powerPerSp, sameTierMedianPowerPerSp, winRatePct, averageActions, averageDamage, averageHealing, averageConsumed, fullWeightUptimePct`.

- [ ] **Step 1: Write the balance test**: determinism (`runGolemBalance(20_261_010, 2)` deep-equals itself); 10 cases over the five job IDs; all numbers finite; `averageConsumed` in `[0,3]`; portable `powerPerSp / sameTierMedianPowerPerSp` in `(0.65, 1.45)`.
- [ ] **Step 2: Run** — Expected: FAIL (script missing).
- [ ] **Step 3: Implement the script.**
- [ ] **Step 4: Run** `npx tsx scripts/sim-v2-golem-jobs.ts` with 12 trials and the test. If lineage `averageConsumed` differs from 2.4 by ≥0.3 or `fullWeightUptimePct` from 35 by ≥10, update the constants in `weightCycle.ts`, re-tune damage coefficients so `golemJobLine.test.ts` envelopes hold, and re-run Tasks 1–5 tests.
- [ ] **Step 5: Commit** `test: 골렘 계보 결정적 밸런스 시뮬레이션`

### Task 7: Full verification and spec reconciliation

**Files:**
- Modify only if values differ: `docs/superpowers/specs/2026-10-10-golem-tier2-tier6-design.md` (append "구현 관측 결과 (YYYY-MM-DD)" table like the beastkin spec)

- [ ] **Step 1: Run** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run check-images` — Expected: all pass; check-images unchanged (no new images).
- [ ] **Step 2: Record** observed package score/SP/ratio and simulation uptime in the spec.
- [ ] **Step 3: Commit** `docs: 골렘 계보 구현 관측 결과`
