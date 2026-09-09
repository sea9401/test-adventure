# Poison merge implementation plan

**Goal:** 독 장비가 기존 스킬 독을 약화시키지 않고 행운·맹독 보정을 받게 한다.
**Architecture:** `combatShared.applyV2DotsToTarget`에서 독만 대상별 피해를 비교한다. `playerDotDamage`에 플레이어 독 생성 함수를 두어 모든 장비 경로에서 보정을 한 번 적용한다.
**Tech Stack:** TypeScript, Vitest. Next.js API/UI 변경 없음.

## Steps

- [x] `poisonEquipmentRegression.test.ts`에 병합, 장비 단독, 실제 스킬·폭발 회귀 테스트를 작성하고 실패 확인.
- [x] `combatShared.ts`에 최대 HP·HP 비례 보정 인자를 추가하고 독의 강한 계산값과 긴 지속시간 유지. 출혈·연소 변경 금지.
- [x] `playerDotDamage.ts`에 `makePlayerPoisonDot(args, player)` 추가. 기존 `makePoisonDot` 결과에 공통 독 보정을 한 번 적용.
- [x] PvE/PvP 엔진, 기본 공격 페이즈, 6T 어댑터의 플레이어 독 생성과 병합 호출 교체. 몬스터 병합에는 대상 HP 전달.
- [x] 회귀 테스트 통과 후 combat 테스트 전체, 타입 검사, 변경 파일 lint 수행. diff 자체 검토 후 이번 파일만 커밋.

사용자 승인에 따라 현재 세션에서 직접 실행한다. 서브에이전트·배포·통합·푸시 없음.

## Validation

- 회귀 테스트: 기존 구현에서 19건 실패 확인, 수정 후 28건 통과.
- 전투 및 독 파생/토벌 테스트: 88개 파일 948건 통과. 이후 추가 경계 테스트 5건도 통과(총 953건).
- 변경 파일 ESLint 및 diff 공백 검사 통과.
- 전체 TypeScript 검사 통과 (`NODE_OPTIONS=--max-old-space-size=8192`, `--noEmit --incremental false`). 기본 메모리 실행은 OOM으로 중단되어 한도를 늘려 검증했다.
- 모든 플레이어 장비 독 생성 경로와 PvE/PvP 병합 대상 HP 전달을 직접 검토했다.
