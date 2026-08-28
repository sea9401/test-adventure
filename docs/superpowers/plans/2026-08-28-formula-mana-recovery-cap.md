# Formula Mana Recovery Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 태초술사·태초현자의 최대 MP 비례 회복이 실제 MP 소비량을 넘어 자원을 생성하지 못하게 한다.

**Architecture:** 공용 스킬 시전 계산에서 유료 `manaRestore`를 실제 시전 소비량으로 제한한다. `FormulaState`에는 주기 소비·회복 원장을 추가하고, 순수 정산 함수가 완전식 10% 회복과 다음 상태를 계산하게 해 PvE·PvP가 같은 규칙을 공유한다.

**Tech Stack:** TypeScript, Vitest, v2 PvE/PvP combat engines

## Global Constraints

- 무료 명상의 기존 회복량은 유지한다.
- 기존 전투 상태의 새 원장 필드는 선택값으로 읽는다.
- PvE와 PvP가 동일한 정산 함수를 사용한다.
- 배포하지 않는다.
- 현재 작업 트리의 기존 MP 비용 변경을 보존한다.

---

### Task 1: 유료 MP 회복 상한

**Files:**
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Test: `src/adventure/battle/combatShared.test.ts`

**Interfaces:**
- Consumes: `effectiveMpCost`, `mpSpent`, 원시 `manaRestore`
- Produces: 상한 적용된 `nextMp`, `manaRestored`

- [ ] **Step 1: 유료 회복은 실제 소비량으로 제한되고 무료 명상은 유지되는 실패 테스트 작성**
- [ ] **Step 2: 대상 테스트를 실행해 순증가 기대값에서 실패하는지 확인**
- [ ] **Step 3: `effectiveMpCost > 0`인 경우 `manaRestore`를 `mpSpent`로 제한**
- [ ] **Step 4: 대상 테스트 통과 확인**

### Task 2: 완전식 주기 MP 원장

**Files:**
- Modify: `src/adventure/v2/combat/primordialSageCombat.ts`
- Test: `src/adventure/v2/combat/primordialSageCombat.test.ts`

**Interfaces:**
- Consumes: 이전 `FormulaState`, 단계 전이, 현재 소비·회복·비용 환급, 요청 완전식 회복
- Produces: `settleFormulaManaRecovery(...)`의 상한 적용 회복량과 다음 `FormulaState`

- [ ] **Step 1: 미환급 소비량 상한·완료 초기화·구 상태 호환 실패 테스트 작성**
- [ ] **Step 2: 테스트가 정산 함수 부재로 실패하는지 확인**
- [ ] **Step 3: 선택형 `mpSpent`·`mpRestored` 필드와 순수 정산 함수 구현**
- [ ] **Step 4: 순수 함수 테스트 통과 확인**

### Task 3: PvE/PvP 배선과 로그

**Files:**
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/atbSkillCast.test.ts`
- Modify: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`

**Interfaces:**
- Consumes: `settleFormulaManaRecovery(...)`
- Produces: 상한 적용 상태 MP, 다음 완전식 원장, `[마력 최적화]` 회복 로그

- [ ] **Step 1: MP 0 무투자 강제 시전과 이전 소비 환급의 PvE/PvP 실패 테스트 작성**
- [ ] **Step 2: 현재 10% 무제한 회복 때문에 실패하는지 확인**
- [ ] **Step 3: 두 엔진에서 공용 정산 결과를 상태·로그에 적용**
- [ ] **Step 4: PvE/PvP 대상 테스트 통과 확인**

### Task 4: 사용자 설명과 전체 검증

**Files:**
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**
- Consumes: 확정된 회복 상한 규칙
- Produces: 실제 동작과 일치하는 스킬 설명

- [ ] **Step 1: 상한 문구를 요구하는 실패 테스트 작성**
- [ ] **Step 2: `근원공명`·`마력 최적화` 설명 갱신**
- [ ] **Step 3: 관련 Vitest와 TypeScript 검사를 실행**
- [ ] **Step 4: diff와 기존 사용자 변경 보존 여부를 검토하고 관련 파일만 커밋**
