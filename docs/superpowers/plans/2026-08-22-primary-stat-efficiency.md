# Primary Stat Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 힘·지능의 공격력 환산을 0.7로 높이고 힘 1당 최대 HP 1을 추가하면서 순수 힘·지능 스킬의 기준 피해는 보존한다.

**Architecture:** 서버 파생 능력치 상수와 HP 산식을 변경하고, 공유 전투 산식에서 순수 스킬의 직접 힘·지능 계수에 공격력 환산 증가분만큼 동적 보정을 적용한다. 레벨업 결과 카드와 매뉴얼도 같은 산식을 반영하며 기존 저장 데이터와 장비 수치는 변경하지 않는다.

**Tech Stack:** TypeScript, Vitest, Next.js 애플리케이션의 서버 파생 산식 및 공유 전투 모듈

## Global Constraints

- 힘 1당 물리 공격력은 `0.7`이다.
- 지능 1당 마법 공격력은 `0.7`이다.
- 힘 1당 최대 HP는 `1`, 활력 1당 최대 HP는 기존 `3`이다.
- 순수 물리·마법 스킬은 기준 상태에서 힘·지능 1당 명목 피해 기여를 보존한다.
- 능력치 기반 최소 데미지 하한, 무기 위력, 장비 카탈로그와 저장 구조는 변경하지 않는다.
- 배포하지 않는다.

---

### Task 1: 파생 공격력과 힘 HP

**Files:**
- Modify: `src/lib/server/v2CombatCoefficients.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`

**Interfaces:**
- Produces: `ATK_PER_STR = 0.7`, `MAGIC_ATK_PER_INT = 0.7`, `HP_PER_STR = 1`
- Produces: `v2LevelGrowthHpMp({ levelsGained, strGained, vitGained, intGained })`

- [x] **Step 1: 파생 수치 실패 테스트 작성**

`derivePlayerCombatV2.test.ts`에 힘 100 투자 시 공격력 70·HP 100, 지능 100 투자 시 마법 공격력 70 증가를 검증한다. 힘 HP가 `maxHpPct`의 캐릭터 HP 배수에는 포함되지만 장비 고정 HP는 포함되지 않는 기존 순서도 검증한다. `v2LevelGrowthHpMp`는 힘·활력·레벨 HP를 모두 합산하는 테스트를 추가한다.

- [x] **Step 2: 실패 확인**

Run: `npm test -- --run src/lib/server/derivePlayerCombatV2.test.ts`

Expected: 기존 계수 0.35와 힘 HP 미반영으로 새 기대값이 실패한다.

- [x] **Step 3: 최소 구현**

`v2CombatCoefficients.ts`에서 공격력 계수 두 개를 0.7로 바꾸고 `HP_PER_STR = 1`을 추가한다. `characterHp`에 `totalStats.str * HP_PER_STR`을 더하고 `v2LevelGrowthHpMp`와 사냥 결과 호출부에 `strGained`를 연결한다.

- [x] **Step 4: 단위 테스트 통과 확인**

Run: `npm test -- --run src/lib/server/derivePlayerCombatV2.test.ts`

Expected: PASS

### Task 2: 순수 스킬 이중 상향 방지

**Files:**
- Modify: `src/adventure/v2/combat/combatPattern.ts`
- Modify: `src/adventure/v2/combat/combatPattern.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Test: `src/adventure/battle/combatShared.test.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**
- Produces: `V2_PRIMARY_STAT_ATTACK_CONVERSION_GAIN = 0.35`
- Changes: `v2PureSkillFormulaCoefficients()`가 기존 직접 계수에서 `실제 공격력 계수 × 0.35`를 차감하고 0으로 하한 처리한다.

- [x] **Step 1: 계수 보존 실패 테스트 작성**

물리·마법 각 차수와 다단 입력에서 다음 등식이 성립하는지 검증한다.

```text
기존 직접 계수 + 기존 공격력 계수×0.35
= 보정 직접 계수 + 기존 공격력 계수×0.7
```

또한 높은 사용자 지정 공격력 계수에서도 직접 계수가 음수가 되지 않는지 검증한다.

- [x] **Step 2: 실패 확인**

Run: `npm test -- --run src/adventure/v2/combat/combatPattern.test.ts`

Expected: 기존 직접 계수가 보정되지 않아 보존 등식이 실패한다.

- [x] **Step 3: 최소 구현**

`v2PureSkillFormulaCoefficients()`가 최종 타격별 `attackCoef`를 먼저 계산하고, 기존 타격별 직접 계수에서 `attackCoef * 0.35`를 차감하도록 변경한다. 소수점 안정성을 위해 기존 `scaledSkillStatCoef` 반올림 경계를 사용하고 결과를 0 이상으로 제한한다. SP 가격 평가는 표현 이전 전 직접 계수를 함께 반환받아 기존 가격을 보존한다.

- [x] **Step 4: 전투·스킬 테스트 통과 확인**

Run: `npm test -- --run src/adventure/v2/combat/combatPattern.test.ts src/adventure/battle/combatShared.test.ts src/adventure/data/v2/v2Skills.test.ts`

Expected: PASS. 스킬 설명 스냅샷 또는 정적 기대값이 실제 새 직접 계수와 일치해야 한다.

### Task 3: 사용자 문서와 전체 검증

**Files:**
- Modify: `src/app/manual/content/stats.tsx`
- Modify: `src/app/manual/content/combat.tsx`
- Modify: `src/app/manual/current-content.test.tsx`
- Modify: `src/adventure/v2/__snapshots__/combatGolden.test.ts.snap`
- Modify: `src/adventure/v2/combat/combatPatternCast.test.ts`
- Modify: `src/adventure/v2/combat/engine.dotClock.test.ts`
- Modify: `src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts`
- Modify: `src/adventure/data/v2/levelDesignSim.test.ts`

**Interfaces:**
- Consumes: 힘 1당 공격력 0.7·HP 1, 지능 1당 마법 공격력 0.7
- Produces: 현재 산식과 일치하는 스탯 및 전투 매뉴얼 문구

- [x] **Step 1: 매뉴얼 실패 테스트 작성**

`current-content.test.tsx`에서 힘의 최대 HP 보조, 힘·지능의 1당 공격력 0.7, 활력의 1당 HP 3이 표시되는지 검증한다.

- [x] **Step 2: 실패 확인**

Run: `npm test -- --run src/app/manual/current-content.test.tsx`

Expected: 새 수치 문구가 없어 실패한다.

- [x] **Step 3: 매뉴얼 갱신**

스탯 표의 힘 역할에 최대 HP를 추가하고, 최대 HP·MP 및 물리·마법 설명에 확정된 환산량과 힘 HP가 캐릭터 HP 배수에 포함되는 정책을 설명한다.

- [x] **Step 4: 관련 회귀 테스트 실행**

Run: `npm test -- --run src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/combatPattern.test.ts src/adventure/battle/combatShared.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/v2/combatGolden.test.ts src/app/manual/current-content.test.tsx`

Expected: PASS

- [x] **Step 5: 정적 검사와 밸런스 시뮬레이션**

Run: `npx tsc --noEmit`

Run: `node --import tsx scripts/sim-v2-progression.ts --skills`

Run: `node --import tsx scripts/sim-v2-pvp-weapon.ts`

Expected: 타입 오류와 실행 오류가 없다. 고정 레벨 PvP 시뮬레이션에서 STR 평균 승률이 Lv50 `67%→98%`, Lv100 `67%→93%`로 상승했으며, 사용자가 이 결과를 수용하고 전역 적용을 승인했다.

- [x] **Step 6: 구현 커밋**

```bash
git add src/lib/server/v2CombatCoefficients.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/combatPattern.ts src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/engine.dotClock.test.ts src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts src/adventure/battle/combatShared.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2Stats.ts src/adventure/data/v2/levelDesignSim.test.ts src/adventure/v2/__snapshots__/combatGolden.test.ts.snap src/app/api/v2/dungeon/hunt/route.ts src/app/manual/content/stats.tsx src/app/manual/content/combat.tsx src/app/manual/current-content.test.tsx docs/superpowers/plans/2026-08-22-primary-stat-efficiency.md
git commit -m "balance: improve primary stat efficiency"
```
