# 법칙술사 6차 직업 구현 계획

> 승인 설계: `docs/superpowers/specs/2026-08-18-lawweaver-tier6-design.md`

## 목표

각인술사의 6차 전직 `법칙술사`를 추가하고, 장착 문장에 따라 네 종류의 전투 한정 각인을 생성·소비하는 `법칙 각인`/`만상각인 해방`을 PvE와 PvP에 동일하게 구현한다. 기존 저장 형식과 예전 리플레이는 그대로 읽혀야 하며 배포는 하지 않는다.

## 작업 1: 카탈로그와 파생 전투 플래그

대상:

- `src/adventure/data/v2/v2JobCatalog.ts`
- `src/adventure/data/v2/proficiency.ts`
- `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- `src/adventure/data/v2/v2SkillsByJob.ts`
- `src/adventure/data/v2/v2Skills.ts`
- `src/lib/server/derivePlayerCombatV2.ts`
- 관련 카탈로그/파생 테스트

절차:

1. 실패 테스트로 법칙술사의 계보, 보너스, 수행 프로필, 두 스킬의 수치와 기본 패턴을 고정한다.
2. `lawweaver` 직업과 두 스킬 ID를 카탈로그·직업 스킬 매핑·레거시 매핑에 추가한다.
3. 패시브 효과에 `lawInscription`, 액티브 정의에 `consumesLawInscriptions` 표식을 추가한다.
4. 장착 패시브 집계와 `derivePlayerCombatV2`를 통해 `PlayerCombat.lawInscription`을 전달한다.
5. 카탈로그와 파생 테스트를 통과시킨다.

## 작업 2: 순수 각인 상태와 해방 효과 계산

대상:

- 새 파일 `src/adventure/v2/combat/lawInscription.ts`
- 새 파일 `src/adventure/v2/combat/lawInscription.test.ts`
- `src/adventure/data/v2/v2Skills.ts`

절차:

1. 정규화, 총합/종류 수, 장착 문장별 생성, 최대치, 소비, 로그, 리플레이 스냅샷을 검증하는 실패 테스트를 먼저 작성한다.
2. `LawInscriptionState`와 생성/소비 전이를 순수 함수로 구현한다.
3. 승인된 원시 계수로 해방 효과 배열을 생성한다. 다양성은 이번 시전의 직접 피해 효과들에만 적용한다.
4. 동적 효과에도 카탈로그 빌드와 같은 6차 스케일(0.95)이 정확히 한 번 적용되도록 공용 스케일 함수를 노출한다.
5. 순수 테스트를 통과시킨다.

## 작업 3: 패턴 자원과 공용 시전 해석

대상:

- `src/adventure/v2/combat/combatPattern.ts`
- `src/adventure/v2/combat/combatShared.ts`
- `src/adventure/v2/V2CombatPatternView.tsx`
- `src/adventure/data/v2/arenaLoadout.ts`
- 관련 패턴/시전 테스트

절차:

1. `inscription` 자원 조건의 파싱·평가·UI 라벨과 총합 3 미만 시 해방 불가를 검증하는 실패 테스트를 작성한다.
2. 과거 호출부를 깨지 않도록 패턴 자원 맵은 누락 값을 0으로 해석한다.
3. `resolveV2SkillCast`에 현재 각인과 장착 스킬을 전달한다.
4. 해방 후보는 총합 3 이상일 때만 사용 가능하게 하고, 선택되면 동적 효과를 공용 피해/방어/치명/PvP 경로에 태운다.
5. 정상 시전된 생성 스킬은 명중 여부와 무관하게 각인 증가 결과를 남기고, 해방은 유효 시전에만 소비 스냅샷을 남긴다.
6. 패턴·공용 시전 테스트를 통과시킨다.

## 작업 4: PvE/PvP 상태 전이와 로그

대상:

- `src/adventure/v2/combat/engineState.ts`
- `src/adventure/v2/combat/engine.ts`
- `src/adventure/v2/combat/engine.atb.ts`
- `src/adventure/v2/combat/engine-pvp.ts`
- `src/adventure/v2/combat/engine.pvp-atb.ts`
- 관련 PvE/PvP ATB 테스트

절차:

1. PvE/PvP에서 생성, 종류별 2개·총 8개 상한, 소비, MP/자원 부족 보존, 빗나감 생성, 추가 효과 적용을 검증하는 실패 테스트를 작성한다.
2. `BattleStacks`/`PvPSideStacks`에 선택적 각인 상태를 추가하고 전투 시작 시 패시브 보유자만 초기화한다.
3. 공용 시전 결과의 생성/소비 전이를 두 엔진에 동일하게 적용한다.
4. 증가·소비·완전 각인 로그를 승인 문구로 추가하되 실제 변화가 없거나 실패한 시전에는 남기지 않는다.
5. ATB HP 스냅샷에 활성 각인 표시를 기존 시그니처 자원 레코드와 병합한다.
6. PvE/PvP 회귀 테스트를 통과시킨다.

## 작업 5: 리플레이 표시와 호환성

대상:

- `src/adventure/battle/BattleLogList.tsx`
- `src/adventure/data/v2/replayPayload.ts`
- 관련 UI/리플레이 테스트

절차:

1. `각인 4/8 · 공격 2 · 환류 2` 표시와 예전 스냅샷 미표시를 검증하는 실패 테스트를 작성한다.
2. 각인 스냅샷을 `lawInscriptions` 문자열 자원으로 렌더하고 한국어 라벨을 추가한다.
3. 기존 PvP 리플레이 관점 전환의 범용 자원 스왑을 그대로 활용하는 회귀 테스트를 추가한다.
4. UI/리플레이 테스트를 통과시킨다.

## 작업 6: 전체 검증과 커밋

1. 변경 파일의 포맷·타입 검사를 실행한다.
2. 관련 Vitest 묶음과 전체 테스트를 실행한다.
3. `npm run build` 또는 프로젝트의 동등한 빌드 검증을 실행한다.
4. `git diff --check`, `git status`, 변경 diff를 검토한다.
5. 배포 없이 현재 기능 브랜치에 하나의 구현 커밋으로 남긴다.
