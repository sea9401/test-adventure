# CloudFront 요청 절감 3차 구현 계획

> 설계: `docs/superpowers/specs/2026-09-10-cloudfront-request-reduction-phase-3-design.md`

## 목표

게임 동작과 장기 보상 속도는 유지하면서 CloudFront를 통과하는 반복 API 요청을 줄인다. 각 단계는 회귀 테스트를 먼저 실패시키고 구현한 뒤 관련 테스트를 통과시켜 별도 커밋한다. 운영 배포와 AWS 설정 변경은 범위 밖이다.

## 1. 일반·위험 낚시

- `src/app/api/v2/fishing/challenges/route.ts` 응답에 status의 일일 어획 및 자동 생활 상태를 포함한다.
- route 테스트와 `src/adventure/v2/useFishing` hook 테스트로 overview 한 번만 호출하는 동작을 고정한다.
- `useFishing`의 progression/status 초기 GET을 제거하고 challenges 응답으로 상태를 채운다.
- 위험 낚시 realtime checkpoint 테스트를 4초 기준으로 변경하고 상수를 구현한다.
- 활성 위험 낚시 상태 폴링 테스트를 추가한 뒤 30초 visible-only 재귀 timeout으로 변경한다.
- 관련 낚시 테스트, 타입 검사, lint를 실행하고 커밋한다.

## 2. 게임 상태 요청 조율

- `src/adventure/v2/fetchGameState.test.ts`에 full/core 동시 병합, core 단독 요청, clone 독립성, signal 우회 테스트를 추가한다.
- `fetchGameState.ts`에 full/core coordinator와 `fetchCoreGameState`를 구현한다.
- `GameStateProvider.tsx`의 직접 core fetch를 coordinator 호출로 교체한다.
- coordinator 및 provider 관련 테스트, 타입 검사, lint를 실행하고 커밋한다.

## 3. 생활 필드 조회 조정

- 환경 timeout이 hidden 중 네트워크를 호출하지 않고 visible 복귀 시 한 번 갱신되는 테스트를 추가한다.
- full 응답의 가장 빠른 환경 만료에 맞춘 refresh delay 테스트를 추가한다.
- 세계 지도에서 full 응답만으로 선택 지역 환경 카드를 그려 environment endpoint를 호출하지 않는 테스트를 추가한다.
- `LifeFieldPanels.tsx`에서 focus 무조건 갱신을 제거하고 due/visibility 스케줄러와 full 응답 파생 카드 API를 구현한다.
- `WorldRumorMapView.tsx`가 파생 카드를 사용하도록 변경한다.
- 관련 테스트, 타입 검사, lint를 실행하고 커밋한다.

## 4. 버전 확인 완화

- `VersionCheck` 테스트에 15분 주기, hidden 중 중단, visible 복귀 즉시 확인, 동시 이벤트 단일 실행을 추가한다.
- interval을 15분으로 바꾸고 visible-only 확인 및 in-flight 병합을 구현한다.
- 관련 테스트, 타입 검사, lint를 실행하고 커밋한다.

## 5. 자동사냥 batch 정책

- 자동사냥 request count와 다음 요청 간격을 계산하는 순수 정책 테스트를 추가한다.
- 스태미나 기본 1회 선택은 5회 batch/7.5초, 기존 5회 이상 선택은 해당 batch/판수 비례 간격, 코어·희귀 지도는 1회/1.5초로 고정한다.
- `V2DungeonFloorView.tsx`의 자동사냥 요청과 타이머가 정책을 사용하게 하고 수동 사냥은 변경하지 않는다.
- 관련 사냥 테스트, 타입 검사, lint를 실행하고 커밋한다.

## 최종 검증

- 모든 3차 대상 테스트를 함께 실행한다.
- 전체 lint, TypeScript 검사, 전체 테스트, production build를 실행한다.
- 실패가 기존 기준선과 동일한지 확인하고 `tsconfig.json`이 커밋에서 제외되었는지 확인한다.
- 배포 없이 커밋 목록과 예상 절감 효과를 사용자에게 보고한다.
