# Max HP Passive Hard Cap Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최대 HP 비율 패시브의 50% 하드캡을 제거해 높은 중첩에서도 모든 패시브가 최대 HP에 영향을 주게 한다.

**Architecture:** 공용 생존 증가 점감 함수는 유한 하드캡 또는 무제한을 선택할 수 있게 하고, 최대 HP 경로만 무제한을 사용한다. 활력과 방어력은 기존 하드캡을 그대로 전달한다.

**Tech Stack:** TypeScript, Vitest

## Global Constraints

- 최대 HP의 30% 소프트캡과 초과분 35% 반영률은 유지한다.
- 활력·방어력·받는 피해 감소 규칙은 변경하지 않는다.
- 장비 고정 HP 계산 순서는 변경하지 않는다.
- 배포하지 않는다.
- 서브에이전트를 사용하지 않는다.

---

### Task 1: 최대 HP 하드캡 제거

**Files:**
- Modify: `src/lib/server/derivePlayerCombatV2.ts:212-235`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts:466-474`

**Interfaces:**
- Consumes: raw passive percentage values
- Produces: unchanged `stackedVitalityIncreasePct`, uncapped `stackedMaxHpIncreasePct`, unchanged `stackedDefenseIncreasePct`

- [ ] **Step 1: Write failing unit and integration regressions**

```ts
expect(stackedMaxHpIncreasePct(30)).toBe(30);
expect(stackedMaxHpIncreasePct(66)).toBeCloseTo(42.6, 5);
expect(stackedMaxHpIncreasePct(124)).toBeCloseTo(62.9, 5);

const full = derivePlayerCombatV2Pure({
  level: 100,
  v2Equipped: {},
  maxHpPct: 124,
});
const reduced = derivePlayerCombatV2Pure({
  level: 100,
  v2Equipped: {},
  maxHpPct: 90,
});
expect(full.maxHp).toBeGreaterThan(reduced.maxHp);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/lib/server/derivePlayerCombatV2.test.ts`

Expected: FAIL because 124% and 90% both currently clamp to an effective 50%.

- [ ] **Step 3: Make the shared hard cap optional**

Change `stackedSurvivalIncreasePct` so `hardCapPct` accepts `number | null`. Return the softened value directly when the cap is `null`; otherwise retain `Math.min(hardCapPct, softened)`. Pass `null` only from `stackedMaxHpIncreasePct`.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
npm test -- --run src/lib/server/derivePlayerCombatV2.test.ts
npx tsc --noEmit
```

Expected: all tests and typecheck pass.

- [ ] **Step 5: Commit the maximum HP change**

```bash
git add src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts
git commit -m "balance: remove max HP passive hard cap"
```

### Task 2: Combined verification

**Files:**
- Verify only

**Interfaces:**
- Consumes: both completed implementations
- Produces: verification evidence

- [ ] **Step 1: Run focused combined tests**

```bash
npm test -- --run src/admin/broadcastMailAttachments.test.ts src/admin/tabs/BroadcastTab.test.tsx src/lib/server/derivePlayerCombatV2.test.ts src/adventure/data/v2/museunCashItems.test.ts src/app/api/v2/me/use-cash-item/route.test.ts
```

- [ ] **Step 2: Run the full test suite and typecheck**

```bash
npm test
npx tsc --noEmit
git diff --check
```

Expected: all tests and typecheck pass, with no whitespace errors.
