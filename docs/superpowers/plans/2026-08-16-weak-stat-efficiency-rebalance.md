# Weak Stat Efficiency Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 힘·민첩·행운을 약화하지 않고 활력·지능·정신의 동일 투자 대비 전투 기여를 보강한다.

**Architecture:** 기존 `v2CombatCoefficients.ts`의 순수 계수와 `derivePlayerCombatV2Pure` 파생식만 조정한다. 동일 입력에서 스탯 하나만 바꾼 테스트로 한계효율을 고정하고, UI·매뉴얼 설명은 실제 공식과 동기화한다.

**Tech Stack:** TypeScript, Vitest, React 19, Next.js 16 정적 매뉴얼 컴포넌트

## Global Constraints

- `VIT_ATK_COEF=0.10`, `DEF_PER_VIT=0.35`, `MIN_DMG_PER_INT=0.15`를 사용한다.
- 정신 마법 공격 공식은 `INT×0.35 + SPI×0.10 + max(0, SPI−INT)×0.60`이다.
- `MIN_DMG_PER_SPI=0.08`을 사용한다.
- 힘·민첩·행운 계수, 직업 스킬, 장비, 몬스터, 전투 시간 제한은 변경하지 않는다.
- 기존 작업 트리의 장비 UI 변경과 `NUL`, `_workspace/`는 수정하거나 커밋하지 않는다.
- 어떤 환경에도 배포하지 않는다.

---

### Task 1: 동일 조건 스탯 한계효율 회귀 테스트

**Files:**
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Consumes: `derivePlayerCombatV2Pure(input): DerivedPlayerCombatV2`
- Produces: 활력·지능·정신 파생식과 정신 경계 동작을 고정하는 회귀 테스트

- [ ] **Step 1: 새 계수와 동일 조건 델타를 기대하는 실패 테스트 작성**

테스트 import에 `DEF_PER_VIT`, `MAGIC_ATK_PER_SPI`, `MIN_DMG_PER_INT`, `MIN_DMG_PER_SPI`를 추가한다. 활력 계수 기대값을 갱신하고 다음 동작을 검증한다.

```ts
it("같은 100포인트 투자에서 활력은 공격력 10과 방어력 35를 더한다", () => {
  const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
  const invested = derivePlayerCombatV2Pure({
    level: 50,
    allocatedStats: { vit: 100 },
    v2Equipped: {},
  }).player;

  expect(VIT_ATK_COEF).toBe(0.1);
  expect(DEF_PER_VIT).toBe(0.35);
  expect(invested.atk - base.atk).toBe(10);
  expect(invested.def - base.def).toBe(35);
});

it("지능과 정신은 후반 스킬 최소 피해에 각각 기여한다", () => {
  const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
  const intBuild = derivePlayerCombatV2Pure({ level: 50, allocatedStats: { int: 100 }, v2Equipped: {} }).player;
  const spiBuild = derivePlayerCombatV2Pure({ level: 50, allocatedStats: { spi: 100 }, v2Equipped: {} }).player;

  expect(MIN_DMG_PER_INT).toBe(0.15);
  expect(MIN_DMG_PER_SPI).toBe(0.08);
  expect(intBuild.minDamage! - base.minDamage!).toBe(15);
  expect(spiBuild.minDamage! - base.minDamage!).toBe(8);
});
```

정신이 지능 이하일 때도 `SPI×MAGIC_ATK_PER_SPI`만큼 마법 공격력이 증가하고, 정신이 지능을 넘어선 두 입력의 차이는 `SPI 100당 70`으로 유지되는 테스트도 추가한다.

- [ ] **Step 2: 집중 테스트를 실행해 의도한 RED 확인**

Run: `npx vitest run src/lib/server/derivePlayerCombatV2.test.ts`

Expected: 새 상수 import 또는 새 기대 계수에서 FAIL. 기존 코드가 새 효율을 아직 제공하지 않기 때문에 실패해야 한다.

- [ ] **Step 3: 실패 원인이 오타나 테스트 설정이 아닌 새 동작 부재인지 확인**

Expected: `VIT_ATK_COEF`, `DEF_PER_VIT`, 정신 마법 공격 또는 최소 피해 기대값 차이만 남는다.

### Task 2: 약세 스탯 파생 계수 구현

**Files:**
- Modify: `src/lib/server/v2CombatCoefficients.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Test: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Consumes: `totalStats.int`, `totalStats.spi`, `totalStats.vit`
- Produces: `MAGIC_ATK_PER_SPI`, `MIN_DMG_PER_SPI`, 갱신된 `PlayerCombat.atk/def/magicAtk/minDamage`

- [ ] **Step 1: 최소 계수 변경 구현**

```ts
export const DEF_PER_VIT = 0.35;
export const VIT_ATK_COEF = 0.1;
export const MIN_DMG_PER_INT = 0.15;
export const MIN_DMG_PER_SPI = 0.08;
export const MAGIC_ATK_PER_SPI = 0.1;
export const MAGIC_ATK_PER_EXCESS_SPI = 0.6;
```

파생식은 다음처럼 바꾼다.

```ts
const magicAtk =
  Math.floor(
    totalStats.int * MAGIC_ATK_PER_INT +
      totalStats.spi * MAGIC_ATK_PER_SPI +
      excessSpi * MAGIC_ATK_PER_EXCESS_SPI,
  ) +
  equipAcc.magicAtk +
  V2_BASE_COMBAT_BONUS;

const minDamage = Math.floor(
  totalStats.str * MIN_DMG_PER_STR +
    totalStats.int * MIN_DMG_PER_INT +
    totalStats.vit * MIN_DMG_PER_VIT +
    totalStats.spi * MIN_DMG_PER_SPI,
);
```

새 상수는 기존 공개 import 경로 안정성을 위해 `derivePlayerCombatV2.ts`에서도 재수출한다.

- [ ] **Step 2: 집중 테스트를 실행해 GREEN 확인**

Run: `npx vitest run src/lib/server/derivePlayerCombatV2.test.ts`

Expected: PASS.

- [ ] **Step 3: 파생식 관련 인접 테스트 실행**

Run: `npx vitest run src/lib/server/derivePlayerCombatV2*.test.ts src/adventure/v2/combat/combatShared.test.ts`

Expected: PASS. 의도된 고정 숫자 차이가 있으면 공식 변경과 직접 관련된 기대값만 갱신한다.

### Task 3: 사용자 설명 동기화

**Files:**
- Modify: `src/adventure/character/StatsPanel.tsx`
- Modify: `src/app/manual/content/stats.tsx`
- Modify: `src/app/manual/content/combat.tsx`
- Test: `src/adventure/character/StatsPanel.test.ts`
- Test: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: 새 정신 마법 공격 공식과 활력·지능 역할
- Produces: 실제 동작과 일치하는 툴팁·매뉴얼 문구

- [ ] **Step 1: 기존 설명을 찾는 테스트를 새 설명 기대값으로 변경하고 RED 확인**

`StatsPanel.test.ts`는 마법 공격력 도움말에 `정신도 일부 기여`와 `지능을 초과한 정신은 추가 전환` 의미가 모두 포함되는지 검증한다. `current-content.test.tsx`는 스탯 매뉴얼이 정신의 마법 공격 기여를 안내하는지 검증한다.

Run: `npx vitest run src/adventure/character/StatsPanel.test.ts src/app/manual/current-content.test.tsx`

Expected: 새 문구가 아직 없어 FAIL.

- [ ] **Step 2: 설명을 새 공식과 일치하도록 수정**

마법 공격력 툴팁은 다음 의미를 사용한다.

```ts
"마법 스킬과 마법 기본 공격의 위력입니다. 지능이 주축이고 정신도 일부 기여하며, 지능을 초과한 정신은 더 높은 비율로 전환됩니다."
```

스탯 표의 정신 역할은 `마법 방어 / 회복 / 마법 공격 보조 / 치명타 저항`으로 바꾸고, 전투 매뉴얼은 마법 공격력이 `INT 주축, SPI 보조`임을 명시한다.

- [ ] **Step 3: 문서 집중 테스트 GREEN 확인**

Run: `npx vitest run src/adventure/character/StatsPanel.test.ts src/app/manual/current-content.test.tsx`

Expected: PASS.

### Task 4: 시뮬레이션과 전체 검증

**Files:**
- Verify only: all changed files

**Interfaces:**
- Consumes: 완성된 파생식과 설명
- Produces: 현재 진행 구간의 승률·처치 시간 비교와 완료 증거

- [ ] **Step 1: 현재 기준 진행 시뮬레이션 재실행**

Run: `node --import tsx scripts/sim-v2-progression.ts --skills --depths=8,20,50`

Expected: STR·DEX·LUK는 공식상 직접 하향되지 않는다. VIT·INT·SPI의 파생 수치는 기존보다 높고 승률 또는 패배 시 적 잔여 HP가 악화되지 않는다.

- [ ] **Step 2: 타입 검사와 전체 테스트 실행**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm test`

Expected: exit 0.

- [ ] **Step 3: 이미지 참조 검사와 diff 검사**

Run: `npm run check-images`

Expected: missing reference 0. 기존 고아 이미지 경고는 별도 문제로 기록한다.

Run: `git diff --check`

Expected: 출력 없음.

- [ ] **Step 4: 변경 파일만 선택적으로 커밋**

```bash
git add src/lib/server/v2CombatCoefficients.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/character/StatsPanel.tsx src/adventure/character/StatsPanel.test.ts src/app/manual/content/stats.tsx src/app/manual/content/combat.tsx src/app/manual/current-content.test.tsx docs/superpowers/plans/2026-08-16-weak-stat-efficiency-rebalance.md
git commit -m "balance: strengthen vitality intelligence and spirit"
```

커밋 전에 `git diff --cached --stat`으로 기존 장비 UI 변경이 포함되지 않았는지 확인한다.
