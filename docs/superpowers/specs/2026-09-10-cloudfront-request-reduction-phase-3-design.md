# CloudFront 요청 절감 3차 설계

## 목표와 범위

1·2차 이후에도 요청 상위에 남는 낚시, 게임 상태, 생활 필드, 버전 확인, 자동사냥 요청을 순서대로 줄인다. 플레이 속도와 보상 총량, 서버 권위 판정, 화면 복귀 시 최신화는 유지한다.

AWS 설정 변경과 운영 배포는 하지 않는다. 실시간 연결 방식(SSE/WebSocket) 도입도 이번 범위에서 제외한다.

## 조사 결과

- 일반 낚시 화면의 `useFishing`은 진입 시 progression, challenges, status 세 GET을 동시에 보낸다. challenges 응답에 progression이 이미 있어 한 요청은 완전히 중복이다.
- 위험 낚시 실시간 조우는 로컬 고정 tick 시뮬레이션을 사용하면서 복구용 checkpoint를 약 2초마다 POST한다. 별도로 상위 상태와 거대어 상태도 활성 조우 중 10초마다 두 GET으로 갱신한다.
- `fetchGameState`에는 동일 full GET의 in-flight 병합이 있지만 영속 `GameStateProvider`의 core GET은 이를 우회한다. 페이지의 full GET과 provider의 core GET이 동시에 시작돼도 합쳐지지 않는다.
- 생활 필드 hook은 focus마다 무조건 재조회한다. 세계 지도는 모든 환경이 든 full 응답을 받고도 선택 지역용 environment endpoint를 한 번 더 호출한다.
- 버전 확인은 5분 interval이 숨김 탭에서도 계속 실행된다.
- 사냥 서버에는 이미 5/10/50/100회 batch와 판별별 정지 조건이 구현돼 있다. 그러나 기본 1회 설정의 자동사냥은 1.5초마다 단판 요청을 보낸다. 반대로 큰 batch 선택 후 자동사냥도 1.5초마다 묶음을 반복해 의도한 판당 cadence보다 빨라질 수 있다.

## 1. 낚시 요청 최적화

### 일반 낚시 진입 요청 통합

기존 `/api/v2/fishing/challenges` 응답을 낚시 화면용 overview로 확장한다. 기존 필드에 다음을 추가한다.

- `dailyCatchCoins`
- `dailyCatchItems`
- `activeAutoActivity`

이 endpoint는 progression도 이미 반환하므로 `useFishing`은 진입 시 challenges 한 요청만 사용해 progression, 도전 배지, 일일 어획, 자동 생활 상태를 모두 채운다. 기존 progression/status endpoint는 다른 소비자와 배포 smoke 호환을 위해 유지한다.

### 위험 낚시 실시간 요청 완화

복구 checkpoint 간격을 2초에서 4초로 늘린다. 시뮬레이션은 계속 50ms 로컬 tick으로 진행하므로 입력감과 판정은 바뀌지 않는다. transcript는 sessionStorage에 계속 저장되고 종료 상태는 간격과 무관하게 즉시 finish 요청을 보낸다.

활성 조우/거대어의 상위 상태 폴링은 10초에서 30초로 늘리고 재귀 timeout으로 바꾼다. 숨김 탭에서는 예약을 중단하며 visible 복귀 시 즉시 동기화한다. 사용자 행동 POST 성공 후의 즉시 refresh는 유지한다.

## 2. 게임 상태 요청 조정

full/core 요청을 조율하는 `GameStateFetchCoordinator`를 둔다.

- 동일 URL의 동시 GET은 기존처럼 하나로 병합하고 각 소비자에게 clone을 반환한다.
- core 조회 직전에 이미 full 조회가 진행 중이면 full 응답에 합류한다. full 응답은 core 필드를 포함하므로 provider가 그대로 적용할 수 있다.
- core 조회는 한 microtask를 양보해 같은 React commit에서 자식 화면이 시작한 full 조회를 먼저 발견한다.
- POST, abort signal이 있는 요청은 병합하지 않는다.

`GameStateProvider.refreshGameState`는 coordinator의 core 함수를 사용한다. 개별 action 응답으로 이미 적용 중인 resource patch 동작은 유지하며, 광범위한 route payload 변경은 이번 단계에서 하지 않는다. 이 방식은 서로 다른 mutation 결과를 장시간 캐시하지 않고 동시 mount/refresh 중복만 제거한다.

## 3. 생활 필드 조회 조정

`useLifeFieldStatus`는 다음 원칙으로 바꾼다.

- `life-field:refresh` 이벤트는 행동 결과이므로 즉시 조회한다.
- 단순 window focus에는 무조건 조회하지 않는다.
- environment 만료용 timeout이 hidden 상태에서 도달하면 네트워크 요청 대신 due 상태를 기록하고, visible 복귀 시 한 번 조회한다.
- full 응답도 포함된 환경 중 가장 빠른 만료 시각에 맞춰 재조회한다.

세계 지도에서는 full 응답으로 선택 지역의 environment와 trace를 파생해 같은 데이터를 위한 environment GET을 제거한다. 낚시·벌목·채광 개별 화면은 작은 environment endpoint를 그대로 사용한다.

## 4. 버전 확인 완화

버전 interval을 5분에서 15분으로 늘리고 visible 탭에서만 실행한다. 마운트 직후, visible 복귀, window focus 확인은 유지하되 하나의 요청이 진행 중이면 추가 이벤트 요청은 합친다. 새 빌드 감지 후의 토스트/hidden reload/포그라운드 사냥 보호 정책은 바꾸지 않는다.

## 5. 자동사냥 batch

스태미나 모드의 자동사냥은 선택 count가 1이면 서버의 기존 5회 batch를 사용한다. 사용자가 이미 5회 이상을 골랐다면 그 count를 그대로 사용한다. 다음 요청 간격은 `1.5초 × 실제 batch 판수`로 잡아 장기 평균 판당 1.5초와 보상 속도를 유지한다.

코어 쿨다운 모드와 희귀 지도는 서버 규칙상 단판을 유지한다. 수동 클릭도 선택한 count를 그대로 유지한다. batch 내부의 스태미나, 사망, 회복약, 레벨 목표, 희귀 지도 발견 정지 조건과 단일 트랜잭션/idempotent 저장 경로를 재사용한다.

## 오류와 복구

- 모든 조회 최적화는 마지막 성공 상태를 유지하고 다음 명시적 refresh/visible 복귀에서 회복한다.
- 위험 낚시 네트워크 오류의 기존 지수 backoff와 최대 자동 재시도 횟수를 유지한다.
- 상태 coordinator는 응답 내용을 캐시하지 않아 mutation 이후 오래된 snapshot을 재사용하지 않는다.
- batch 요청 실패 시 기존처럼 자동사냥을 즉시 중단하고 `request_failed`를 표시한다.

## 검증

- 낚시 challenges route 확장과 `useFishing` 단일 진입 요청 테스트
- 위험 낚시 4초 checkpoint, 30초 visible 상태 폴링, 종료 즉시 finish 회귀 테스트
- full/core coordinator의 동시 병합과 독립 응답 clone 테스트
- 생활 필드 hidden/due/visible 스케줄 및 세계 지도의 추가 environment 요청 제거 테스트
- 버전 확인의 15분 주기, hidden 중단, visible/focus 단일 실행 테스트
- 자동사냥 request count와 batch 크기별 cadence 순수 정책 및 화면 요청 테스트
- 관련 테스트, lint, TypeScript, 전체 테스트, production build

## 기대 효과

정상 낚시 진입 요청은 3회에서 1회, 위험 낚시 checkpoint는 대략 절반, 활성 위험 낚시 상태 GET은 대략 3분의 1로 줄어든다. 기본 자동사냥은 동일한 장기 판수에서 최대 5분의 1 요청을 사용한다. 상태·생활 필드·버전 절감폭은 화면 이동과 탭 전환 패턴에 따라 달라지며, 운영 반영 뒤 24시간 경로별 로그로 측정한다.
