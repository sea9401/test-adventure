# 물리·마법 스킬 최소 피해 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 평타 하한은 유지하면서 직접 피해 스킬의 최소 피해를 물리(힘·활력)와 마법(지능·정신) 계열로 분리한다.

**Architecture:** 기존 `PlayerCombat.minDamage`를 물리 스킬 하한으로 유지하고 `magicMinDamage`를 추가한다. 파생 단계에서 두 값을 독립 계산한 뒤 PvE·PvP 스킬 시전자 상태에 전달하고, 공용 스킬 피해 함수가 스케일링 계열에 맞는 값을 선택한다. 기존 호출은 `magicMinDamage` 미지정 시 `minDamage`로 폴백한다.

**Tech Stack:** TypeScript, Vitest, Next.js 프로젝트의 기존 v2 전투 엔진

## Global Constraints

- 평타의 유효 공격력 15% 하한은 변경하지 않는다.
- 물리 스킬 최소 피해는 `floor(STR×0.15 + VIT×0.05)`이다.
- 마법 스킬 최소 피해는 `floor(INT×0.15 + SPI×0.08)`이다.
- `scaling="magic"`과 `scaling="spi"` 직접 피해만 마법 스킬 하한을 사용한다.
- 지속 피해·반사·회복·HP 비용은 범위 밖이다.
- 기존 호출 호환성을 유지하고 배포하지 않는다.

---

### Task 1: 파생 스탯 분리

**Files:**
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`

**Interfaces:**
- Produces: `PlayerCombat.minDamage?: number`(물리), `PlayerCombat.magicMinDamage?: number`(마법)

- [x] **Step 1: 파생값 격리 회귀 테스트 작성**

  기본 캐릭터와 스탯 100 투자 캐릭터를 비교해 STR/VIT만 `minDamage`를 각각 15/5 올리고, INT/SPI만 `magicMinDamage`를 각각 15/8 올리는지 리터럴 값으로 검증한다. 반대 계열 값은 변하지 않아야 한다.

- [x] **Step 2: RED 확인**

  Run: `npm test -- src/lib/server/derivePlayerCombatV2.test.ts`
  Expected: `magicMinDamage`가 없고 기존 `minDamage`가 네 스탯을 합산하므로 실패한다.

- [x] **Step 3: 최소 구현**

  `derivePlayerCombatV2Pure`에서 두 하한을 독립 계산해 `PlayerCombat`에 저장하고 필드 주석을 계열별 의미로 갱신한다.

- [x] **Step 4: GREEN 확인**

  Run: `npm test -- src/lib/server/derivePlayerCombatV2.test.ts`
  Expected: PASS

### Task 2: 스킬 피해 계열별 하한 선택

**Files:**
- Modify: `src/adventure/battle/combatShared.test.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`

**Interfaces:**
- Consumes: `PlayerCombat.minDamage`, `PlayerCombat.magicMinDamage`
- Produces: `v2DamageAmount({ attackerMinDamage, attackerMagicMinDamage, scaling, ... })`

- [x] **Step 1: 계열 선택 회귀 테스트 작성**

  높은 방어력에서 물리 호출은 `attackerMinDamage`, 마법 호출은 `attackerMagicMinDamage`를 반환하는지 검증한다. 마법 하한 미지정 호출은 기존 `attackerMinDamage` 폴백도 검증한다.

- [x] **Step 2: RED 확인**

  Run: `npm test -- src/adventure/battle/combatShared.test.ts`
  Expected: `attackerMagicMinDamage` 인터페이스가 없어 타입 검사 또는 기대값이 실패한다.

- [x] **Step 3: 최소 구현**

  공용 피해 함수와 시전자 타입에 마법 하한을 추가하고 `magic`/`spi` 스케일에만 이를 사용한다. 일반 직접 피해와 `missingHpDamage` 경로를 같은 규칙으로 맞추며 PvE·PvP 엔진에서 값을 전달한다.

- [x] **Step 4: GREEN 확인**

  Run: `npm test -- src/adventure/battle/combatShared.test.ts`
  Expected: PASS

### Task 3: 설명·골든·전체 검증

**Files:**
- Modify: `src/app/manual/content/combat.tsx`
- Modify: `src/app/manual/current-content.test.tsx`
- Modify: `docs/v2-combat-redesign.md`
- Modify: `src/adventure/v2/__snapshots__/combatGolden.test.ts.snap`

**Interfaces:**
- Consumes: 사용자에게 노출되는 물리/마법 스킬 하한 규칙

- [x] **Step 1: 매뉴얼 회귀 기대값 작성 및 문구 갱신**

  매뉴얼 테스트가 `물리 스킬`, `마법 스킬`, `STR·VIT`, `INT·SPI` 구분을 요구하도록 바꾸고 실제 설명을 동일하게 갱신한다.

- [x] **Step 2: 집중 테스트와 골든 갱신**

  Run: `npm test -- src/app/manual/current-content.test.tsx src/adventure/v2/combatGolden.test.ts -u`
  Expected: PASS, 의도된 `minDamage` 감소와 `magicMinDamage` 추가만 스냅샷에 반영된다.

- [x] **Step 3: 최종 검증**

  Run: `npx tsc --noEmit`
  Run: `npm test`
  Run: `npm run check-images`
  Run: `node --import tsx scripts/sim-v2-progression.ts --skills --depths=8,20,50`
  Expected: 모든 명령 exit 0. 시뮬레이션 결과는 계열 분리의 의도와 일치한다.

- [x] **Step 4: 커밋**

  Run: `git add <변경 파일>`
  Run: `git commit -m "balance: split physical and magic skill damage floors"`
