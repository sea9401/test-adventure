# Combat Pattern Role Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전투 패턴의 `역할 사용`이 편집 화면에 표시된 장착 순서상 첫 스킬과 다르게 후순위 스킬로 바뀌는 버그를 수정한다.

**Architecture:** 역할 해석은 첫 역할 스킬의 ID만 결정하고, 기존 후보 평가기가 그 스킬의 MP·재사용 대기·효과 유효성을 검사한다. 첫 역할 스킬이 실행 불가능하면 같은 역할 안에서 대체하지 않고 다음 패턴 블록으로 이동한다.

**Tech Stack:** TypeScript, Vitest, Next.js 프로젝트의 순수 전투 엔진 모듈

## Global Constraints

- 배포하지 않는다.
- 기존 저장 패턴 형식과 UI는 변경하지 않는다.
- 회귀 테스트를 먼저 실패시킨 뒤 최소 구현을 적용한다.

---

### Task 1: 역할 스킬 선택 계약 일치

**Files:**
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Test: `src/adventure/v2/combat/combatPatternCast.test.ts`

**Interfaces:**
- Consumes: `resolveV2SkillCast(input: V2SkillCastInput): V2SkillCastResult`
- Produces: 장착 순서상 첫 역할 스킬만 해석하고, 실행 불가능할 때 다음 블록으로 넘어가는 동작

- [x] **Step 1: 실패하는 회귀 테스트 작성**

  `마나 보호막 → 마력탄 → 명상` 순서로 장착하고 MP를 0으로 둔다. `내 보호막 없음 → 버프` 뒤에 `항상 → 마력탄`을 배치한 패턴을 실행해 `castSkillId`가 `v2c_mage_boltcast`인지 단언한다.

- [x] **Step 2: 회귀 테스트가 올바른 이유로 실패하는지 확인**

  Run: `npx vitest run src/adventure/v2/combat/combatPatternCast.test.ts -t "역할 사용은 첫 장착 스킬이 사용 불가하면 다음 패턴 블록으로 넘어간다"`

  Expected: `v2c_mage_meditate`가 선택되어 `v2c_mage_boltcast` 기대값과 불일치한다.

- [x] **Step 3: 최소 구현 적용**

  `resolveRole`에서 역할이 맞는 첫 스킬을 즉시 반환하고 내부 `isUsable` 검사를 제거한다. 기존 후보 평가기의 `isUsable` 검사가 실패한 역할 블록을 건너뛰게 한다.

- [x] **Step 4: 관련 검증 실행**

  Run: `npx vitest run src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/combatPattern.test.ts`

  Expected: 두 테스트 파일 모두 통과한다.

  Run: `npx tsc --noEmit`

  Expected: 타입 오류 없이 종료한다.

- [x] **Step 5: 변경 커밋**

  ```bash
  git add docs/superpowers/specs/2026-08-25-combat-pattern-role-selection-design.md docs/superpowers/plans/2026-08-25-combat-pattern-role-selection.md src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/combatShared.ts
  git commit -m "fix: keep combat role selection aligned with loadout order"
  ```
