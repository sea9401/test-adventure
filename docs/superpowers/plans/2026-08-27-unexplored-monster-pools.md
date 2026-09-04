# Unexplored Monster Pools Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a fully typed, testable foundation for the 12 unexplored monster pools, their 36 relative-stat monster definitions, encounter-share calculation, 12 pool materials, and capped trace accumulation without exposing unfinished content to live hunting.

**Architecture:** Keep unexplored content in focused `src/adventure/data/v2/unexplored*` modules instead of expanding the already large general dungeon catalog. The catalog stores relative combat profiles and existing-engine ability descriptors; a pure encounter resolver converts node-requested shares into an exact 100% distribution while preserving the 30% base-pool floor. Rewards are modeled independently so later hunt-route integration can consume them after the common baseline, node save, and boss crafting are approved.

**Tech Stack:** TypeScript 5, Vitest 4, existing V2 material catalog and `Monster` combat vocabulary.

## Global Constraints

- This plan implements the monster-pool foundation only; it does not add a live hunting-area route, exploration-node persistence, UI, boss crafting, images, or deployment.
- The 36 stat profiles remain multipliers against an injected unexplored baseline; this plan does not invent final absolute monster stats.
- The base pool always owns at least 30% of encounters and all special pools together own at most 70%.
- A pool core requests 20 percentage points and its frequency enhancer requests another 10 percentage points.
- Every pool contains exactly three monsters and exactly one shared material.
- Traces are pool-specific, grant one per defeated special monster, and cap at 2,500 per pool.
- Focused enhancement is represented in the catalog but its final combat and drop multipliers remain outside this foundation because the approved spec requires simulation first.
- Do not add PNG or WebP assets in this plan.
- Do not modify unrelated dirty worktree files.

---

## File Structure

- Create `src/adventure/data/v2/unexploredMonsterPools.ts`: pool IDs, roles, relative profiles, ability descriptors, pool/material metadata, and catalog lookup helpers.
- Create `src/adventure/data/v2/unexploredMonsterPools.test.ts`: catalog completeness and exact approved-value regression tests.
- Create `src/adventure/data/v2/unexploredEncounters.ts`: requested-share normalization and deterministic weighted encounter selection.
- Create `src/adventure/data/v2/unexploredEncounters.test.ts`: base-floor, cap, multi-pool, rounding, and RNG-boundary tests.
- Create `src/adventure/data/v2/unexploredRewards.ts`: pool material catalog, trace parsing, capped trace grants, and reward result types.
- Create `src/adventure/data/v2/unexploredRewards.test.ts`: material mapping and trace-cap regression tests.
- Modify `src/adventure/data/v2/dungeonDrops.ts`: spread the 12 unexplored materials into `V2_MATERIALS` so existing inventory and marketplace readers can resolve their names.

---

### Task 1: Define the 12-pool and 36-monster catalog

**Files:**
- Create: `src/adventure/data/v2/unexploredMonsterPools.ts`
- Test: `src/adventure/data/v2/unexploredMonsterPools.test.ts`

**Interfaces:**
- Produces: `UNEXPLORED_POOL_IDS`, `UnexploredPoolId`, `UnexploredMonsterRole`, `UnexploredRelativeStats`, `UnexploredAbilityId`, `UnexploredMonsterDefinition`, `UnexploredMonsterPool`, `UNEXPLORED_MONSTER_POOLS`, `UNEXPLORED_POOL_BY_ID`, and `UNEXPLORED_MONSTER_BY_ID`.
- Consumes: `MonsterTag` from `@/adventure/data/monsters/types` only for existing combat-family classification.

- [x] **Step 1: Write a failing catalog integrity test**

```ts
import { describe, expect, it } from "vitest";
import {
  UNEXPLORED_MONSTER_POOLS,
  UNEXPLORED_POOL_BY_ID,
  UNEXPLORED_MONSTER_BY_ID,
} from "./unexploredMonsterPools";

describe("unexplored monster pool catalog", () => {
  it("contains 12 pools, three roles per pool, and 36 unique monsters", () => {
    expect(UNEXPLORED_MONSTER_POOLS).toHaveLength(12);
    expect(Object.keys(UNEXPLORED_POOL_BY_ID)).toHaveLength(12);
    expect(Object.keys(UNEXPLORED_MONSTER_BY_ID)).toHaveLength(36);
    for (const pool of UNEXPLORED_MONSTER_POOLS) {
      expect(pool.monsters.map((monster) => monster.role).sort()).toEqual([
        "attack",
        "base",
        "variant",
      ]);
      expect(pool.monsters).toHaveLength(3);
      expect(new Set(pool.monsters.map((monster) => monster.id)).size).toBe(3);
      expect(pool.materialId).toBe(`v2_unexplored_${pool.id}_material`);
    }
  });

  it("keeps every relative stat finite and positive", () => {
    for (const monster of Object.values(UNEXPLORED_MONSTER_BY_ID)) {
      for (const value of Object.values(monster.stats)) {
        expect(Number.isFinite(value), monster.id).toBe(true);
        expect(value, monster.id).toBeGreaterThan(0);
      }
    }
  });
});
```

- [x] **Step 2: Run the test and verify that the module is missing**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts`

Expected: FAIL because `./unexploredMonsterPools` cannot be resolved.

- [x] **Step 3: Add the typed catalog shell and lookup construction**

```ts
import type { MonsterTag } from "@/adventure/data/monsters/types";

export const UNEXPLORED_POOL_IDS = [
  "iron_legion",
  "mana_barrier",
  "regenerating_swarm",
  "red_berserkers",
  "crystal_artillery",
  "precision_hunters",
  "runaway_machines",
  "shadow_stalkers",
  "venom_colony",
  "bloodstained_dead",
  "frozen_legion",
  "crushing_colossi",
] as const;

export type UnexploredPoolId = (typeof UNEXPLORED_POOL_IDS)[number];
export type UnexploredMonsterRole = "base" | "attack" | "variant";

export type UnexploredRelativeStats = {
  hp: number;
  atk: number;
  def: number;
  magicDef: number;
  spd: number;
};

export type UnexploredAbilityId =
  | "brace"
  | "pierce"
  | "heavy_every_3"
  | "status_resist_15"
  | "status_resist_35_brace"
  | "arcane_bolt"
  | "heal"
  | "attack_and_heal"
  | "extra_heal_uses"
  | "low_hp_enrage"
  | "high_crit"
  | "periodic_heavy"
  | "arcane_burst"
  | "limited_arcane_nova"
  | "high_accuracy"
  | "high_accuracy_crit"
  | "high_accuracy_pierce"
  | "fast_actions"
  | "guaranteed_bonus_attack"
  | "bonus_attack_low_hp_enrage"
  | "high_evasion"
  | "evasion_crit"
  | "very_high_evasion_pierce"
  | "poison_1"
  | "poison_2"
  | "poison_2_survival_debuff"
  | "bleed"
  | "fast_bleed"
  | "bleed_periodic_heavy"
  | "slow"
  | "strong_slow_arcane"
  | "frost_limited_burst"
  | "crushing_blow";

export type UnexploredMonsterDefinition = {
  id: string;
  name: string;
  role: UnexploredMonsterRole;
  tags: readonly MonsterTag[];
  stats: UnexploredRelativeStats;
  abilities: readonly UnexploredAbilityId[];
};

export type UnexploredMonsterPool = {
  id: UnexploredPoolId;
  name: string;
  materialId: `v2_unexplored_${UnexploredPoolId}_material`;
  materialName: string;
  focusDescription: string;
  rewardCategories: readonly ("material" | "equipment" | "quality" | "gold" | "general")[];
  slowKillRewardBonusPctRange?: readonly [10, 15];
  monsters: readonly [
    UnexploredMonsterDefinition,
    UnexploredMonsterDefinition,
    UnexploredMonsterDefinition,
  ];
};

export const UNEXPLORED_MONSTER_POOLS = [] as const satisfies readonly UnexploredMonsterPool[];

export const UNEXPLORED_POOL_BY_ID = Object.fromEntries(
  UNEXPLORED_MONSTER_POOLS.map((pool) => [pool.id, pool]),
) as Record<UnexploredPoolId, UnexploredMonsterPool>;

export const UNEXPLORED_MONSTER_BY_ID = Object.fromEntries(
  UNEXPLORED_MONSTER_POOLS.flatMap((pool) =>
    pool.monsters.map((monster) => [monster.id, monster]),
  ),
) as Record<string, UnexploredMonsterDefinition>;
```

- [x] **Step 4: Replace the empty array with all approved catalog rows**

Use these pool rows and stat tuples in order; each tuple is `[HP, 공격, 물리 방어, 마법 방어, 속도]` and the monster order is `base`, `attack`, `variant`:

| Pool ID | Pool / material | Monster rows: ID, name, tuple, abilities |
| --- | --- | --- |
| `iron_legion` | 철갑 군단 / 강화 철편 | `armored_shieldman`, 철갑 방패병, `[1.10,.90,1.55,1,.85]`, `brace`; `armored_spearman`, 철갑 창병, `[.95,1.05,1.35,.90,1]`, `pierce`; `armored_crusher`, 철갑 파쇄병, `[1.20,1.10,1.45,.95,.65]`, `heavy_every_3` |
| `mana_barrier` | 마력 방벽체 / 방벽 결정 | `barrier_guardian`, 결계 수호체, `[1.05,.90,1,1.60,.85]`, `status_resist_15`; `rune_executor`, 룬 집행자, `[.90,1.10,.85,1.40,1]`, `arcane_bolt`; `seal_watcher`, 봉인 감시체, `[1.10,.95,1.05,1.35,.75]`, `status_resist_35_brace` |
| `regenerating_swarm` | 재생 군체 / 재생 조직 | `regenerating_spore`, 재생 포자체, `[1.35,.85,1,1,.75]`, `heal`; `devouring_regenerator`, 포식 재생체, `[1.10,1.10,.90,.90,1]`, `attack_and_heal`; `proliferating_core`, 증식 핵체, `[1.55,.90,1.05,1.05,.60]`, `extra_heal_uses` |
| `red_berserkers` | 붉은 광전대 / 광폭 혈석 | `red_berserker`, 붉은 광전병, `[.90,1.30,.75,.80,1]`, `low_hp_enrage`; `blood_duelist`, 혈전 투사, `[.80,1.25,.70,.70,1.15]`, `high_crit`; `red_executioner`, 붉은 처형자, `[1.05,1.40,.80,.80,.70]`, `periodic_heavy` |
| `crystal_artillery` | 수정 포격대 / 수정 렌즈 | `crystal_mage`, 수정 술사, `[.90,1.15,.80,1.10,.85]`, `arcane_bolt`; `refraction_artillery`, 굴절 포격체, `[.75,1.35,.70,1,.70]`, `arcane_burst`; `crystal_sentinel`, 수정 파수체, `[1.05,1.10,1.15,1.25,.65]`, `limited_arcane_nova` |
| `precision_hunters` | 정밀 사냥단 / 정밀 조준경 | `precision_scout`, 정밀 척후병, `[.95,1.05,.90,.90,1.10]`, `high_accuracy`; `lethal_sniper`, 치명 저격수, `[.80,1.20,.75,.80,.90]`, `high_accuracy_crit`; `armor_hunter`, 갑옷 사냥꾼, `[1,1.10,1,.90,.85]`, `high_accuracy_pierce` |
| `runaway_machines` | 폭주 기계 / 과열 동력핵 | `rushing_machine`, 질주 기계, `[.90,.90,1,.85,1.35]`, `fast_actions`; `combo_automaton`, 연격 자동인형, `[.80,.75,.90,.85,1.20]`, `guaranteed_bonus_attack`; `overheated_enforcer`, 과열 집행기, `[1,1,1,.90,1.15]`, `bonus_attack_low_hp_enrage` |
| `shadow_stalkers` | 그림자 추적자 / 그림자 피막 | `shadow_scout`, 그림자 척후병, `[.90,1,.85,.90,1.20]`, `high_evasion`; `night_assassin`, 밤의 암살자, `[.80,1.20,.70,.80,1.10]`, `evasion_crit`; `phantom_stalker`, 허상 추적귀, `[.75,1.05,.75,.90,1.30]`, `very_high_evasion_pierce` |
| `venom_colony` | 맹독 군락 / 농축 독낭 | `venom_fang_devourer`, 독니 포식자, `[1,.90,.95,.95,1]`, `poison_1`; `venom_sprayer`, 맹독 살포체, `[.85,1.05,.80,.90,1.15]`, `poison_2`; `corrosive_colony`, 부식 군체, `[1.15,.90,1.05,1,.75]`, `poison_2_survival_debuff` |
| `bloodstained_dead` | 혈흔 망자 / 응고 혈액 | `hooked_dead`, 갈고리 망자, `[1,1.05,.90,.90,1]`, `bleed`; `bloodtrail_pursuer`, 혈주 추격자, `[.85,1,.80,.85,1.25]`, `fast_bleed`; `severing_executioner`, 절단 집행자, `[1.10,1.20,1,.90,.70]`, `bleed_periodic_heavy` |
| `frozen_legion` | 혹한 군단 / 혹한 결정 | `frost_toucher`, 서리 접촉자, `[1.05,.90,1.05,1.10,.80]`, `slow`; `freezing_mage`, 빙결 술사, `[.85,1.15,.80,1.10,.85]`, `strong_slow_arcane`; `frozen_sentinel`, 혹한 파수자, `[1.20,1.05,1.15,1.25,.60]`, `frost_limited_burst` |
| `crushing_colossi` | 파쇄 거수 / 거수 골편 | `bedrock_colossus`, 암반 거수, `[1.30,1.10,1.20,.90,.55]`, `periodic_heavy`; `ironwall_crusher`, 철벽 분쇄자, `[1.15,1.25,1.10,.85,.65]`, `pierce`; `crust_destroyer`, 지각 파괴자, `[1.40,1.35,1.25,.90,.45]`, `crushing_blow` |

Assign tags in monster order exactly as follows:

| Pool ID | Tags in base / attack / variant order |
| --- | --- |
| `iron_legion` | `humanoid`, `humanoid`, `humanoid` |
| `mana_barrier` | `golem`, `golem`, `golem` |
| `regenerating_swarm` | `slime`, `beast`, `slime` |
| `red_berserkers` | `humanoid`, `humanoid`, `humanoid` |
| `crystal_artillery` | `spirit`, `golem`, `golem` |
| `precision_hunters` | `humanoid`, `humanoid`, `humanoid` |
| `runaway_machines` | `golem`, `golem`, `golem` |
| `shadow_stalkers` | `humanoid`, `humanoid`, `spirit` |
| `venom_colony` | `beast`, `slime`, `slime` |
| `bloodstained_dead` | `undead`, `undead`, `undead` |
| `frozen_legion` | `spirit`, `humanoid`, `golem` |
| `crushing_colossi` | `golem`, `golem`, `golem` |

Store these exact focus and reward categories so UI readers do not recreate them:

| Pool ID | Focus description | Reward categories |
| --- | --- | --- |
| `iron_legion` | 물리 방어 증가 | `material`, `equipment` |
| `mana_barrier` | 마법 방어와 상태 피해 저항 증가 | `material`, `quality` |
| `regenerating_swarm` | 체력과 회복 가능 횟수 증가 | `material`, `general` |
| `red_berserkers` | 공격력과 치명타 증가 | `material`, `gold` |
| `crystal_artillery` | 마법 공격과 스킬 사용 가능 횟수 증가 | `material`, `equipment` |
| `precision_hunters` | 적중, 치명타와 관통 증가 | `material`, `quality` |
| `runaway_machines` | 속도와 추가 공격 확률 증가 | `material`, `gold` |
| `shadow_stalkers` | 회피와 속도 증가 | `material`, `quality` |
| `venom_colony` | 중독 중첩량 증가 | `material`, `general` |
| `bloodstained_dead` | 출혈 중첩량과 직접 공격력 증가 | `material`, `gold` |
| `frozen_legion` | 둔화 효과와 마법 공격 증가 | `material` |
| `crushing_colossi` | 공격력, 관통과 강타 피해 증가 | `material`, `equipment` |

Set `slowKillRewardBonusPctRange: [10, 15]` on `crushing_colossi`; omit it from the other pools. This records the approved compensation without selecting a final percentage before combat simulation.

- [x] **Step 5: Add exact-value regression assertions**

```ts
it("preserves the approved edge profiles", () => {
  expect(UNEXPLORED_MONSTER_BY_ID.armored_shieldman.stats.def).toBe(1.55);
  expect(UNEXPLORED_MONSTER_BY_ID.proliferating_core.stats.hp).toBe(1.55);
  expect(UNEXPLORED_MONSTER_BY_ID.rushing_machine.stats.spd).toBe(1.35);
  expect(UNEXPLORED_MONSTER_BY_ID.crust_destroyer.stats).toEqual({
    hp: 1.4,
    atk: 1.35,
    def: 1.25,
    magicDef: 0.9,
    spd: 0.45,
  });
  expect(UNEXPLORED_POOL_BY_ID.crushing_colossi.slowKillRewardBonusPctRange).toEqual([
    10,
    15,
  ]);
});
```

- [x] **Step 6: Run the catalog tests**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts`

Expected: PASS with all pool counts, roles, IDs, and representative edge values preserved.

- [x] **Step 7: Commit the catalog**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.ts src/adventure/data/v2/unexploredMonsterPools.test.ts
git commit -m "feat: add unexplored monster pool catalog"
```

---

### Task 2: Normalize requested encounter shares

**Files:**
- Create: `src/adventure/data/v2/unexploredEncounters.ts`
- Test: `src/adventure/data/v2/unexploredEncounters.test.ts`

**Interfaces:**
- Consumes: `UnexploredPoolId` and `UNEXPLORED_POOL_IDS` from Task 1.
- Produces: `UNEXPLORED_BASE_MIN_SHARE`, `UNEXPLORED_SPECIAL_MAX_SHARE`, `UnexploredPoolSelection`, `UnexploredEncounterShare`, `unexploredEncounterShares(selections)`, and `pickUnexploredEncounterGroup(shares, rng)`.

- [x] **Step 1: Write failing share-normalization tests**

```ts
import { describe, expect, it } from "vitest";
import {
  unexploredEncounterShares,
  pickUnexploredEncounterGroup,
} from "./unexploredEncounters";

describe("unexplored encounter shares", () => {
  it("keeps an unmodified area at 100% base", () => {
    expect(unexploredEncounterShares([])).toEqual([{ kind: "base", share: 100 }]);
  });

  it("applies core 20 and frequency 10 cumulatively", () => {
    expect(
      unexploredEncounterShares([
        { poolId: "iron_legion", core: true, frequency: true },
        { poolId: "venom_colony", core: true, frequency: false },
      ]),
    ).toEqual([
      { kind: "base", share: 50 },
      { kind: "pool", poolId: "iron_legion", share: 30 },
      { kind: "pool", poolId: "venom_colony", share: 20 },
    ]);
  });

  it("proportionally caps three 30-point requests at 70 special", () => {
    const shares = unexploredEncounterShares([
      { poolId: "iron_legion", core: true, frequency: true },
      { poolId: "venom_colony", core: true, frequency: true },
      { poolId: "frozen_legion", core: true, frequency: true },
    ]);
    expect(shares.reduce((sum, entry) => sum + entry.share, 0)).toBe(100);
    expect(shares[0]).toEqual({ kind: "base", share: 30 });
    expect(shares.slice(1).map((entry) => entry.share)).toEqual([24, 23, 23]);
  });

  it("uses half-open cumulative RNG boundaries", () => {
    const shares = unexploredEncounterShares([
      { poolId: "iron_legion", core: true, frequency: true },
    ]);
    expect(pickUnexploredEncounterGroup(shares, () => 0.699999)).toEqual({ kind: "base" });
    expect(pickUnexploredEncounterGroup(shares, () => 0.7)).toEqual({
      kind: "pool",
      poolId: "iron_legion",
    });
  });
});
```

- [x] **Step 2: Run the test and verify that the module is missing**

Run: `npm test -- src/adventure/data/v2/unexploredEncounters.test.ts`

Expected: FAIL because `./unexploredEncounters` cannot be resolved.

- [x] **Step 3: Implement share calculation with deterministic largest-remainder rounding**

```ts
import {
  UNEXPLORED_POOL_IDS,
  type UnexploredPoolId,
} from "./unexploredMonsterPools";

export const UNEXPLORED_BASE_MIN_SHARE = 30;
export const UNEXPLORED_SPECIAL_MAX_SHARE = 70;
const CORE_REQUEST_SHARE = 20;
const FREQUENCY_REQUEST_SHARE = 10;

export type UnexploredPoolSelection = {
  poolId: UnexploredPoolId;
  core: boolean;
  frequency: boolean;
};

export type UnexploredEncounterShare =
  | { kind: "base"; share: number }
  | { kind: "pool"; poolId: UnexploredPoolId; share: number };

export type UnexploredEncounterGroup =
  | { kind: "base" }
  | { kind: "pool"; poolId: UnexploredPoolId };

function normalizedUnitRoll(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1 - Number.EPSILON, Math.max(0, value));
}

export function unexploredEncounterShares(
  selections: readonly UnexploredPoolSelection[],
): UnexploredEncounterShare[] {
  const requested = UNEXPLORED_POOL_IDS.map((poolId) => {
    const selected = selections.find((entry) => entry.poolId === poolId);
    return {
      poolId,
      requested:
        (selected?.core ? CORE_REQUEST_SHARE : 0) +
        (selected?.core && selected.frequency ? FREQUENCY_REQUEST_SHARE : 0),
    };
  }).filter((entry) => entry.requested > 0);
  const requestedTotal = requested.reduce((sum, entry) => sum + entry.requested, 0);
  if (requestedTotal === 0) return [{ kind: "base", share: 100 }];

  const specialTotal = Math.min(UNEXPLORED_SPECIAL_MAX_SHARE, requestedTotal);
  const raw = requested.map((entry, index) => ({
    ...entry,
    index,
    rawShare: (entry.requested / requestedTotal) * specialTotal,
  }));
  const allocated = raw.map((entry) => Math.floor(entry.rawShare));
  let remainder = specialTotal - allocated.reduce((sum, value) => sum + value, 0);
  for (const entry of [...raw].sort(
    (a, b) =>
      b.rawShare - Math.floor(b.rawShare) - (a.rawShare - Math.floor(a.rawShare)) ||
      a.index - b.index,
  )) {
    if (remainder <= 0) break;
    allocated[entry.index] += 1;
    remainder -= 1;
  }

  return [
    { kind: "base", share: 100 - specialTotal },
    ...raw.map((entry) => ({
      kind: "pool" as const,
      poolId: entry.poolId,
      share: allocated[entry.index],
    })),
  ];
}

export function pickUnexploredEncounterGroup(
  shares: readonly UnexploredEncounterShare[],
  rng: () => number,
): UnexploredEncounterGroup {
  const point = normalizedUnitRoll(rng()) * 100;
  let cumulative = 0;
  for (const entry of shares) {
    cumulative += entry.share;
    if (point < cumulative) {
      return entry.kind === "base"
        ? { kind: "base" }
        : { kind: "pool", poolId: entry.poolId };
    }
  }
  return { kind: "base" };
}
```

- [x] **Step 4: Run the encounter tests**

Run: `npm test -- src/adventure/data/v2/unexploredEncounters.test.ts`

Expected: PASS, including exact `30 + 24 + 23 + 23 = 100` behavior.

- [x] **Step 5: Commit the encounter resolver**

```bash
git add src/adventure/data/v2/unexploredEncounters.ts src/adventure/data/v2/unexploredEncounters.test.ts
git commit -m "feat: add unexplored encounter share resolver"
```

---

### Task 3: Select a monster inside the resolved pool

**Files:**
- Modify: `src/adventure/data/v2/unexploredEncounters.ts`
- Modify: `src/adventure/data/v2/unexploredEncounters.test.ts`

**Interfaces:**
- Consumes: `UNEXPLORED_POOL_BY_ID` from Task 1 and `UnexploredEncounterShare` from Task 2.
- Produces: `pickUnexploredMonster({ baseMonsterIds, shares, groupRng, monsterRng })`, returning `{ source: "base"; monsterId: string } | { source: "special"; poolId: UnexploredPoolId; monsterId: string } | null`.

- [x] **Step 1: Write failing selection tests**

```ts
it("selects uniformly inside the chosen special pool", () => {
  const result = pickUnexploredMonster({
    baseMonsterIds: ["base_a", "base_b"],
    shares: unexploredEncounterShares([
      { poolId: "iron_legion", core: true, frequency: true },
    ]),
    groupRng: () => 0.99,
    monsterRng: () => 0.999999,
  });
  expect(result).toEqual({
    source: "special",
    poolId: "iron_legion",
    monsterId: "armored_crusher",
  });
});

it("returns null only when the selected base pool is empty", () => {
  expect(
    pickUnexploredMonster({
      baseMonsterIds: [],
      shares: [{ kind: "base", share: 100 }],
      groupRng: () => 0,
      monsterRng: () => 0,
    }),
  ).toBeNull();
});
```

- [x] **Step 2: Run the focused test and verify that the export is missing**

Run: `npm test -- src/adventure/data/v2/unexploredEncounters.test.ts`

Expected: FAIL because `pickUnexploredMonster` is not exported.

- [x] **Step 3: Implement two-stage deterministic selection**

```ts
export type UnexploredMonsterPick =
  | { source: "base"; monsterId: string }
  | {
      source: "special";
      poolId: UnexploredPoolId;
      monsterId: string;
    };

export function pickUnexploredMonster(params: {
  baseMonsterIds: readonly string[];
  shares: readonly UnexploredEncounterShare[];
  groupRng: () => number;
  monsterRng: () => number;
}): UnexploredMonsterPick | null {
  const group = pickUnexploredEncounterGroup(params.shares, params.groupRng);
  const ids =
    group.kind === "base"
      ? params.baseMonsterIds
      : UNEXPLORED_POOL_BY_ID[group.poolId].monsters.map((monster) => monster.id);
  if (ids.length === 0) return null;
  const roll = normalizedUnitRoll(params.monsterRng());
  const monsterId = ids[Math.min(ids.length - 1, Math.floor(roll * ids.length))];
  return group.kind === "base"
    ? { source: "base", monsterId }
    : { source: "special", poolId: group.poolId, monsterId };
}
```

Use the same private `normalizedUnitRoll` helper as group selection so `NaN`, negative values, and `1` cannot produce an out-of-range array index.

- [x] **Step 4: Run the complete encounter suite**

Run: `npm test -- src/adventure/data/v2/unexploredEncounters.test.ts`

Expected: PASS.

- [x] **Step 5: Commit two-stage selection**

```bash
git add src/adventure/data/v2/unexploredEncounters.ts src/adventure/data/v2/unexploredEncounters.test.ts
git commit -m "feat: select unexplored encounter monsters"
```

---

### Task 4: Add the 12 shared materials and capped pool traces

**Files:**
- Create: `src/adventure/data/v2/unexploredRewards.ts`
- Create: `src/adventure/data/v2/unexploredRewards.test.ts`
- Modify: `src/adventure/data/v2/dungeonDrops.ts`

**Interfaces:**
- Consumes: `UNEXPLORED_MONSTER_POOLS` and `UnexploredPoolId` from Task 1.
- Produces: `UNEXPLORED_TRACE_CAP`, `UNEXPLORED_POOL_MATERIALS`, `UnexploredTraceState`, `parseUnexploredTraces(raw)`, `rollUnexploredTraceAmount(params)`, and `grantUnexploredTrace(traces, poolId, amount)`.
- Makes the 12 material IDs readable through existing `V2_MATERIALS` consumers.

- [x] **Step 1: Write failing reward-state tests**

```ts
import { describe, expect, it } from "vitest";
import {
  UNEXPLORED_POOL_MATERIALS,
  grantUnexploredTrace,
  parseUnexploredTraces,
  rollUnexploredTraceAmount,
} from "./unexploredRewards";

describe("unexplored rewards", () => {
  it("defines one shared material for every pool", () => {
    expect(Object.keys(UNEXPLORED_POOL_MATERIALS)).toHaveLength(12);
    expect(UNEXPLORED_POOL_MATERIALS.v2_unexplored_iron_legion_material.name).toBe(
      "강화 철편",
    );
    expect(
      UNEXPLORED_POOL_MATERIALS.v2_unexplored_crushing_colossi_material.name,
    ).toBe("거수 골편");
  });

  it("sanitizes persisted traces and caps every pool at 2500", () => {
    const parsed = parseUnexploredTraces({
      iron_legion: 2499.9,
      venom_colony: 999999,
      frozen_legion: -3,
      unknown: 50,
    });
    expect(parsed).toEqual({ iron_legion: 2499, venom_colony: 2500 });
    expect(grantUnexploredTrace(parsed, "iron_legion", 5)).toEqual({
      traces: { iron_legion: 2500, venom_colony: 2500 },
      granted: 1,
    });
  });

  it("grants exactly one base trace for one defeated special monster", () => {
    const amount = rollUnexploredTraceAmount({
      defeatedSpecial: true,
      extraChancePct: 0,
      rng: () => 0,
    });
    expect(amount).toBe(1);
    expect(grantUnexploredTrace({}, "frozen_legion", amount)).toEqual({
      traces: { frozen_legion: 1 },
      granted: 1,
    });
  });

  it("allows at most one extra trace for a defeated special monster", () => {
    expect(
      rollUnexploredTraceAmount({
        defeatedSpecial: true,
        extraChancePct: 20,
        rng: () => 0.199999,
      }),
    ).toBe(2);
    expect(
      rollUnexploredTraceAmount({
        defeatedSpecial: true,
        extraChancePct: 999,
        rng: () => 0.999999,
      }),
    ).toBe(2);
    expect(
      rollUnexploredTraceAmount({
        defeatedSpecial: false,
        extraChancePct: 100,
        rng: () => 0,
      }),
    ).toBe(0);
  });
});
```

- [x] **Step 2: Run the reward tests and verify that the module is missing**

Run: `npm test -- src/adventure/data/v2/unexploredRewards.test.ts`

Expected: FAIL because `./unexploredRewards` cannot be resolved.

- [x] **Step 3: Implement material projection and trace helpers**

```ts
import {
  UNEXPLORED_MONSTER_POOLS,
  UNEXPLORED_POOL_IDS,
  type UnexploredPoolId,
} from "./unexploredMonsterPools";

export const UNEXPLORED_TRACE_CAP = 2_500;

export const UNEXPLORED_POOL_MATERIALS = Object.fromEntries(
  UNEXPLORED_MONSTER_POOLS.map((pool) => [
    pool.materialId,
    {
      id: pool.materialId,
      name: pool.materialName,
      description: `${pool.name} 개체에게서 얻는 미개척지 전용 재료.`,
    },
  ]),
) as Record<string, { id: string; name: string; description: string }>;

export type UnexploredTraceState = Partial<Record<UnexploredPoolId, number>>;

export function rollUnexploredTraceAmount(params: {
  defeatedSpecial: boolean;
  extraChancePct: number;
  rng: () => number;
}): 0 | 1 | 2 {
  if (!params.defeatedSpecial) return 0;
  const chance = Math.min(100, Math.max(0, Number(params.extraChancePct) || 0));
  const roll = Math.min(1 - Number.EPSILON, Math.max(0, Number(params.rng()) || 0));
  return roll * 100 < chance ? 2 : 1;
}

export function parseUnexploredTraces(raw: unknown): UnexploredTraceState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  return Object.fromEntries(
    UNEXPLORED_POOL_IDS.flatMap((poolId) => {
      const value = Math.floor(Number(source[poolId]));
      return Number.isFinite(value) && value > 0
        ? [[poolId, Math.min(UNEXPLORED_TRACE_CAP, value)]]
        : [];
    }),
  );
}

export function grantUnexploredTrace(
  raw: unknown,
  poolId: UnexploredPoolId,
  amount = 1,
): { traces: UnexploredTraceState; granted: number } {
  const traces = parseUnexploredTraces(raw);
  const before = traces[poolId] ?? 0;
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  const after = Math.min(UNEXPLORED_TRACE_CAP, before + requested);
  return {
    traces: after > 0 ? { ...traces, [poolId]: after } : traces,
    granted: after - before,
  };
}
```

- [x] **Step 4: Register the materials in the existing catalog**

Add this import to `dungeonDrops.ts`:

```ts
import { UNEXPLORED_POOL_MATERIALS } from "./unexploredRewards";
```

Then add this spread inside `V2_MATERIALS`, adjacent to other hunting materials:

```ts
  ...UNEXPLORED_POOL_MATERIALS,
```

Keep `unexploredRewards.ts` independent of `dungeonDrops.ts`; the reward module owns the simple `{ id, name, description }` shape and `dungeonDrops.ts` only consumes it. This prevents a runtime import cycle.

- [x] **Step 5: Run reward and material-catalog tests**

Run: `npm test -- src/adventure/data/v2/unexploredRewards.test.ts src/adventure/data/v2/huntMaterialCatalog.test.ts src/adventure/data/v2/dungeonDrops.test.ts`

Expected: PASS. Existing material behavior remains unchanged, and the new material records are resolvable by ID.

- [x] **Step 6: Commit the reward foundation**

```bash
git add src/adventure/data/v2/unexploredRewards.ts src/adventure/data/v2/unexploredRewards.test.ts src/adventure/data/v2/dungeonDrops.ts
git commit -m "feat: add unexplored pool reward resources"
```

---

### Task 5: Add a foundation-level verification gate

**Files:**
- Modify: `src/adventure/data/v2/unexploredMonsterPools.test.ts`
- Modify: `src/adventure/data/v2/unexploredEncounters.test.ts`
- Modify: `src/adventure/data/v2/unexploredRewards.test.ts`

**Interfaces:**
- Consumes all exports from Tasks 1–4.
- Produces no new runtime API; it locks cross-module invariants before later route integration.

- [x] **Step 1: Add cross-module invariant tests**

```ts
it("keeps pool, material, and trace identifiers aligned", () => {
  for (const pool of UNEXPLORED_MONSTER_POOLS) {
    expect(UNEXPLORED_POOL_MATERIALS[pool.materialId]?.name).toBe(pool.materialName);
    expect(grantUnexploredTrace({}, pool.id).traces[pool.id]).toBe(1);
  }
});

it("never emits a distribution below the base floor", () => {
  const allMaxed = UNEXPLORED_POOL_IDS.map((poolId) => ({
    poolId,
    core: true,
    frequency: true,
  }));
  const shares = unexploredEncounterShares(allMaxed);
  expect(shares[0]).toEqual({ kind: "base", share: 30 });
  expect(shares.reduce((sum, entry) => sum + entry.share, 0)).toBe(100);
});
```

Put each assertion in the test file that owns the runtime behavior and import only the neighboring catalog needed for the invariant.

- [x] **Step 2: Run all unexplored foundation tests**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredRewards.test.ts`

Expected: PASS.

- [x] **Step 3: Run TypeScript and formatting checks**

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `git diff --check`

Expected: no output and exit code 0.

- [x] **Step 4: Review scope before the final commit**

Run: `git status --short`

Expected: only the six unexplored foundation files and the intentional `dungeonDrops.ts` edit are staged for this feature; unrelated fishing or manual changes remain unstaged.

- [x] **Step 5: Commit the invariant tests**

```bash
git add src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredRewards.test.ts
git commit -m "test: guard unexplored monster pool invariants"
```

---

## Follow-up Plans After This Foundation

These are separate implementation units because their values or UX are not yet approved:

1. Define the fixed unexplored baseline and run top-player simulations before turning the relative profiles into live `Monster` combat objects.
2. Implement the 160-node exploration save parser, point spending/refund API, level-100/reclass entry gate, and post-100 exploration XP.
3. Connect the encounter resolver and reward helpers to a dedicated unexplored hunt request while preserving the existing hunting flow and stamina behavior.
4. Implement trace-enhancer probability, focused-enhancement tuning, 1,000-trace summon-stone crafting, personal boss reuse of the cooperative-boss screen, and tradable summon stones.
5. Build the character-menu exploration network and battle-list unexplored-area UI using opaque shared surfaces, then create or commission the final 36 monster images under the image naming rules.
