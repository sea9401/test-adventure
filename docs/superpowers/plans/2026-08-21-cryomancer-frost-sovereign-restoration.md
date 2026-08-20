# 빙결술사·빙천제 복구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최신 `main`에 빙결술사·빙천제 계보와 한기·빙결·영구동토 전투 동작을 기존 테스트와 함께 복원한다.

**Architecture:** 원본 기능 커밋만 시간순으로 재적용해 카탈로그, 순수 한기 전이, 공용 시전, PvE/PvP/ATB, 리플레이·패턴 연결을 보존한다. 최신 코드와 충돌한 부분은 원본의 공개 동작을 유지하면서 현재 타입과 공용 전투 경로에 맞춘다.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Vitest

## Global Constraints

- 기준 브랜치는 `origin/main` SHA `409e1fcd5`다.
- 원본 기능 브랜치 전체를 병합하지 않는다.
- 몬스터가 플레이어에게 부여하는 기존 `chillStacks`와 새 적 한기를 분리한다.
- 현재 직업 ID가 아니라 장착한 스킬·패시브 메타데이터로 효과를 적용한다.
- DB 마이그레이션, 이미지, 배포와 점검 모드 변경은 하지 않는다.

---

### Task 1: 빙결술사 카탈로그와 순수 한기 전이 복원

**Files:**
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Create: `src/adventure/v2/combat/frostChill.ts`
- Test: `src/adventure/data/v2/cryomancerCatalog.test.ts`
- Test: `src/adventure/v2/combat/frostChill.test.ts`

**Interfaces:**
- Consumes: 기존 `V2JobDefinition`, `V2SkillDefinition`, 장착 SP와 차수 보정 규칙
- Produces: `cryomancer` 직업, `frostChillGain` 스킬 메타데이터, `resolveFrostChillGain` 순수 전이

- [ ] **Step 1: 원본 카탈로그·전이 테스트와 구현을 재적용한다**

```bash
git cherry-pick 37d83eeaa ea5cff0e5 9bb7d1807
```

- [ ] **Step 2: 카탈로그와 순수 전이 테스트를 실행한다**

```bash
npx vitest run src/adventure/data/v2/cryomancerCatalog.test.ts src/adventure/v2/combat/frostChill.test.ts
```

Expected: 빙결술사 계보와 `0 → 2 → 4 → 빙결 → 0` 전이가 모두 PASS한다.

### Task 2: PvE·PvP·ATB와 표시 연결 복원

**Files:**
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`
- Modify: `src/adventure/v2/combat/combatPattern.ts`
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Test: `src/adventure/v2/combat/frostChillPve.test.ts`
- Test: `src/adventure/v2/combat/frostChillPvp.test.ts`
- Test: `src/adventure/v2/combat/frostChillAtb.test.ts`

**Interfaces:**
- Consumes: `resolveFrostChillGain`, 시전 결과의 `frostChillGain`
- Produces: PvE/PvP 상태 전이, 빙결 추가 피해·ATB 지연, 패턴 조건과 리플레이 자원 표시

- [ ] **Step 1: 원본 전투·표시 커밋을 재적용한다**

```bash
git cherry-pick 906dc041c 2b03722e5 ab2db469c e36ad66fa 3ca848266
```

- [ ] **Step 2: 냉기 전투 회귀 테스트를 실행한다**

```bash
npx vitest run src/adventure/v2/combat/frostChillPve.test.ts src/adventure/v2/combat/frostChillPvp.test.ts src/adventure/v2/combat/frostChillAtb.test.ts src/adventure/v2/combat/combatPattern.test.ts
```

Expected: 빗나감·상태 차단·빙결 피해·행동 지연·패턴 조건이 모두 PASS한다.

### Task 3: 빙천제와 영구동토 복원

**Files:**
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/v2/combat/frostChill.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Test: `src/adventure/data/v2/frostSovereignCatalog.test.ts`
- Test: `src/adventure/v2/combat/frostSovereignCombat.test.ts`
- Test: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Consumes: 빙결술사 계보와 한기 5스택 전이
- Produces: `frostsovereign`, `freezeRetainStacks`, 빙결 후 한기 1 잔류

- [ ] **Step 1: 빙천제 설계·계획과 구현 커밋을 재적용한다**

```bash
git cherry-pick c98b80245 67afd4024 ecf9540d7 3a5fb4f40 32684d542 29e43d155 461f398cb 9a76f05e9
```

- [ ] **Step 2: 빙천제 카탈로그·파생·전투 테스트를 실행한다**

```bash
npx vitest run src/adventure/data/v2/frostSovereignCatalog.test.ts src/adventure/v2/combat/frostSovereignCombat.test.ts src/lib/server/derivePlayerCombatV2.test.ts
```

Expected: 계보, 패시브 집계, PvE/PvP 잔류 한기와 50% 지연이 모두 PASS한다.

### Task 4: 냉기 계보 통합 검증

**Files:**
- Test: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`
- Test: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Test: `src/adventure/v2/combat/atbSkillCast.test.ts`
- Test: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`

**Interfaces:**
- Consumes: Tasks 1~3의 공개 카탈로그와 전투 상태
- Produces: 최신 `main`과의 통합 회귀 근거

- [ ] **Step 1: 관련 전체 테스트를 실행한다**

```bash
npx vitest run src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts
```

Expected: 기존 원소 계보와 새 냉기 계보 테스트가 모두 PASS한다.

- [ ] **Step 2: 변경 범위에 다른 미배포 기능이 섞이지 않았는지 확인한다**

```bash
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected: 설계 문서와 냉기 카탈로그·전투·표시·테스트 파일만 나타난다.

