# CloudFront 요청 절감 4차 구현 계획

> 설계: `docs/superpowers/specs/2026-09-10-cloudfront-request-reduction-phase-4-design.md`

## 목표

고정 주기 API 요청을 visible-only 적응형 폴링으로 바꾸고 거래소 판매 진입 요청을 통합한다. 각 단계는 회귀 테스트를 먼저 실패시키고 구현한 뒤 관련 검증과 별도 커밋까지 순서대로 수행한다. 채팅, AWS 설정, 운영 배포, 푸시는 범위 밖이다.

## 기반: 공통 visible adaptive scheduler

- 순수 delay 정책과 브라우저 timer를 분리한 scheduler 테스트를 먼저 작성한다.
- recursive timeout, hidden 중단, visible 즉시 실행, focus 선택 지원, in-flight 중복 방지, changed/unchanged/failed 결과 처리를 구현한다.
- scheduler 단위 테스트와 타입 검사를 통과시키고 1단계 커밋에 포함한다.

## 1. 서버 피드

- `ServerFeedView` 요청 테스트에 최신 페이지 adaptive 간격, hidden 중단·visible 복귀, 과거 페이지 무폴링 동작을 추가한다.
- fetch 결과에서 안정적인 최신 snapshot을 만들고 기존 `feedPollDelayMs`·`nextFeedIdlePollCount` 정책을 공통 scheduler에 연결한다.
- fixed interval을 제거하되 focus 즉시 refresh와 오류 상태를 유지한다.
- 관련 테스트, 타입 검사, lint를 실행하고 커밋한다.

## 2. 거래소 목록

- 거래소 요청 테스트에 browse/mine의 adaptive 간격과 hidden 복귀 동작을 추가한다.
- 시간 필드를 제외한 browse snapshot helper와 10→30→60초 delay 정책을 테스트 우선으로 만든다.
- browse/mine fixed interval을 공통 scheduler로 교체하고 기존 mutation 후 즉시 refresh를 유지한다.
- 관련 테스트, 타입 검사, lint를 실행하고 커밋한다.

## 3. 협동 보스·길드·토너먼트

- 협동 보스 목록·상세 hook에 visible-only, adaptive delay, 상세 terminal 중단 테스트를 추가한다.
- 길드 레이드와 공유 토큰 panel에 hidden 중단과 idle backoff 테스트를 추가한다.
- 토너먼트에 visible-only adaptive polling 및 완료 중단 테스트를 추가한다.
- 각 응답의 안정적인 snapshot과 화면별 delay 함수를 구현하고 fixed interval을 공통 scheduler로 교체한다.
- 관련 테스트, 타입 검사, lint를 실행하고 커밋한다.

## 4. 거래소 판매 진입 API 통합

- 로컬 Next.js route 문서를 다시 확인한다.
- 판매 overview payload 조립 테스트와 route 인증·성공 테스트를 먼저 작성한다.
- 필요한 save를 한 번에 읽어 기존 parser로 응답을 구성하는 server helper와 `/api/v2/marketplace/sell-overview` route를 구현한다.
- 거래소 요청 테스트에 판매 탭 전환 시 새 endpoint 한 건만 발생하고 기존 네 inventory GET이 추가되지 않는 조건을 추가한다.
- `V2MarketplaceView`의 `loadInventory`를 overview 한 건으로 교체한다.
- 관련 테스트, 타입 검사, lint를 실행하고 커밋한다.

## 최종 검증

- 모든 4차 대상 테스트를 함께 실행한다.
- 전체 lint, TypeScript 검사, 전체 테스트, production build를 실행한다.
- 전체 테스트 실패가 기존 기준선과 동일한지 확인한다.
- 사용자의 `tsconfig.json` 변경이 어떤 커밋에도 포함되지 않았는지 확인한다.
- 배포 없이 커밋 목록과 예상 요청 절감 효과를 보고한다.
