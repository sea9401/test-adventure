# HP 기반 공격 계수 보상 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HP를 직접 피해로 전환하는 여덟 공격의 HP 파생 피해만 약 14% 복원한다.

**Architecture:** 원본 스킬 카탈로그의 `maxHp` 계수와 `hpCostDamage.soakRatio`만 조정한다. 생명 강타의 최대 HP 직접 계수는 직업 차수별 액티브 보정에서 보존하고, 기존 전투 엔진과 자동 설명 생성은 그대로 재사용한다.

**Tech Stack:** TypeScript, Vitest, 기존 V2 스킬 카탈로그와 공유 PvE/PvP 전투 계산기

## Global Constraints

- 회복, 재생, 보호막, 최대 HP 패시브와 기본 HP 산식은 변경하지 않는다.
- 자해율, 현재 HP 하한, STR·DEF·고정·처형 피해와 상태 효과는 변경하지 않는다.
- MP·SP·발동률·재사용 대기시간과 학습 비용은 유지한다.
- 현재 작업 트리의 기존 미커밋 변경을 되돌리거나 덮어쓰지 않는다.
- 배포하지 않는다.
- 서브에이전트를 사용하지 않는다.

---

### Task 1: HP 공격 보상의 실패하는 회귀 테스트

**Files:**
- Create: `src/adventure/data/v2/hpScaledAttackCompensation.test.ts`
- Create: `src/adventure/v2/combat/hpScaledAttackCompensation.test.ts`

**Interfaces:**
- Consumes: `V2_COMMON_SKILLS`, `V2_SKILLS`, `describeV2Skill`, `spCostOf`, `resolveV2SkillCast`
- Produces: 승인된 수치와 고체력·저체력 계산을 고정하는 실패 테스트

- [ ] **Step 1: Write the failing data regression test**

```ts
import { describe, expect, it } from "vitest";
import { V2_COMMON_SKILLS } from "./v2SkillsCommonCatalog";
import { describeV2Skill, spCostOf, V2_SKILLS } from "./v2Skills";

const HP_COST_RATIOS = {
  v2c_berserker_bloodslash: 1.6,
  v2c_bloodtemplar_stigma: 1.14,
  v2c_warlord_bloodbath: 2.05,
  v2c_overlord_ruin: 2.74,
  v2c_bloodlord_brand: 1.82,
  v2c_hegemon_annihilation: 3.42,
  v2c_blooddemon_reign: 2.62,
} as const;

describe("HP 기반 공격 계수 보상", () => {
  it("원본과 런타임 데이터에 승인된 HP 계수를 보존한다", () => {
    expect(V2_COMMON_SKILLS.v2c_immortal_lifestrike.effects[0]).toMatchObject({
      kind: "damage",
      scaling: "maxHp",
      statCoef: 0.04,
    });
    expect(V2_SKILLS.v2c_immortal_lifestrike.effects[0]).toMatchObject({
      kind: "damage",
      scaling: "maxHp",
      statCoef: 0.04,
    });

    for (const [id, soakRatio] of Object.entries(HP_COST_RATIOS)) {
      const raw = V2_COMMON_SKILLS[id as keyof typeof HP_COST_RATIOS].effects.find(
        (effect) => effect.kind === "hpCostDamage",
      );
      const runtime = V2_SKILLS[id as keyof typeof HP_COST_RATIOS].effects.find(
        (effect) => effect.kind === "hpCostDamage",
      );
      expect(raw, id).toMatchObject({
        kind: "hpCostDamage",
        soakRatio,
        soakCurrentHpFloorPct: 50,
      });
      expect(runtime, id).toMatchObject({
        kind: "hpCostDamage",
        soakRatio,
        soakCurrentHpFloorPct: 50,
      });
    }
  });

  it("자해·회복·보호막과 SP 비용은 유지한다", () => {
    const expectedSp = {
      v2c_immortal_lifestrike: 4,
      v2c_berserker_bloodslash: 6,
      v2c_bloodtemplar_stigma: 7,
      v2c_warlord_bloodbath: 6,
      v2c_overlord_ruin: 8,
      v2c_bloodlord_brand: 7,
      v2c_hegemon_annihilation: 11,
      v2c_blooddemon_reign: 10,
    } as const;
    for (const [id, sp] of Object.entries(expectedSp)) {
      expect(spCostOf(V2_SKILLS[id as keyof typeof expectedSp]), id).toBe(sp);
    }
    expect(V2_SKILLS.v2c_bloodtemplar_stigma.effects).toContainEqual({
      kind: "shield",
      pctMaxHp: 6,
      turns: 3,
    });
    expect(V2_SKILLS.v2c_blooddemon_reign.effects).toContainEqual({
      kind: "healFromDamage",
      pct: 20,
    });
    expect(describeV2Skill(V2_SKILLS.v2c_immortal_lifestrike)).toContain(
      "피해 공격력×1.2 + 최대 HP×0.04",
    );
  });
});
```

- [ ] **Step 2: Write the failing combat regression test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveV2SkillCast } from "./combatShared";

afterEach(() => vi.restoreAllMocks());

function castBloodslash(currentHp: number) {
  vi.spyOn(Math, "random").mockReturnValue(0);
  return resolveV2SkillCast({
    skills: {
      learned: ["v2c_berserker_bloodslash"],
      equipped: ["v2c_berserker_bloodslash"],
    },
    cooldowns: {},
    attacker: {
      mp: 999,
      atk: 0,
      str: 0,
      currentHp,
      maxHp: 1000,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
  });
}

describe("HP 소모 공격 실행 계수", () => {
  it("고체력에서는 현재 HP를 피해 기준으로 쓰되 자해율은 유지한다", () => {
    const result = castBloodslash(1000);
    expect(result.selfHpCost).toBe(80);
    expect(result.enemyDamage).toBe(128);
  });

  it("저체력에서는 최대 HP 50% 하한만 피해 기준에 적용한다", () => {
    const result = castBloodslash(300);
    expect(result.selfHpCost).toBe(24);
    expect(result.enemyDamage).toBe(64);
  });
});
```

- [ ] **Step 3: Run both tests to verify RED**

Run: `npx vitest run src/adventure/data/v2/hpScaledAttackCompensation.test.ts src/adventure/v2/combat/hpScaledAttackCompensation.test.ts`

Expected: FAIL because the current raw/final life-strike coefficient is `0.035`/`0.03`, the seven `soakRatio` values are still old, and 사혈격 damage is 112/56 instead of 128/64. The self-cost assertions already pass at 80/24.

---

### Task 2: HP 공격 계수의 최소 구현

**Files:**
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Test: `src/adventure/data/v2/hpScaledAttackCompensation.test.ts`
- Test: `src/adventure/v2/combat/hpScaledAttackCompensation.test.ts`

**Interfaces:**
- Consumes: Task 1의 실패 테스트
- Produces: 원본과 런타임에서 보존되는 최대 HP 계수 및 HP 전환 배율

- [ ] **Step 1: Implement the minimal data changes**

In `v2SkillsCommonCatalog.ts`, change only the eight approved HP-derived values.

In `v2Skills.ts`, preserve `scaling === "maxHp"` in `scaledDirectStatCoef` alongside the existing DEX/LUK specialized-scaling exceptions:

```ts
if (scaling === "dex" || scaling === "luk" || scaling === "maxHp") {
  return statCoef;
}
```

Because explicit `spCost` values are upward-only floors, keep the existing costs by normalizing only the SP rubric's `hpCostDamage` evaluation. Divide `e.soakRatio` by `HP_COST_DAMAGE_COMPENSATION_MULT = 1.14` when calculating `soakValue`; do not apply this normalization to runtime damage.

- [ ] **Step 2: Run both focused tests to verify GREEN**

Run: `npx vitest run src/adventure/data/v2/hpScaledAttackCompensation.test.ts src/adventure/v2/combat/hpScaledAttackCompensation.test.ts`

Expected: PASS.

---

### Task 3: Broader regression and balance verification

**Files:**
- Test: `src/adventure/data/v2/v2Skills.test.ts`
- Test: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Test: `src/adventure/battle/combatShared.test.ts`
- Test: `src/adventure/battle/engine-pvp.test.ts`
- Verify: `scripts/sim-v2-progression.ts`

**Interfaces:**
- Consumes: final `V2_SKILLS` and shared PvE/PvP combat behavior
- Produces: evidence that the compensation does not alter non-HP effects or destabilize the current balance work

- [ ] **Step 1: Run the affected suites**

Run: `npx vitest run src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/battle/combatShared.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/data/v2/hpScaledAttackCompensation.test.ts src/adventure/v2/combat/hpScaledAttackCompensation.test.ts`

Expected: PASS.

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Run representative progression simulation**

Run: `node --import tsx scripts/sim-v2-progression.ts --skills --tier6-counts=3 --depths=20,50`

Expected: completes without error; VIT/HP builds improve only through the targeted attack components and do not become a clear new dominant build.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check`

Expected: no whitespace errors. Confirm that existing unrelated working-tree changes remain present and that this task changed only the design/plan docs, two focused tests, eight catalog values, the SP-rubric normalization, and the `maxHp` scaling exception.

- [ ] **Step 5: Commit only isolated task changes**

Stage the two new tests and plan/spec docs normally. Partially stage only this task's hunks from `v2SkillsCommonCatalog.ts` and `v2Skills.ts`; do not stage the user's unrelated existing edits.

Commit message: `balance: compensate HP-scaled attack damage`
