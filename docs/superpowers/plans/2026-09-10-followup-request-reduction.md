# 후속 요청 절감 구현 계획

**Goal:** 입찰 후 GET, 시세 재방문 GET, heartbeat와 중복되는 version GET을 순서대로 줄인다.

**Architecture:** 기존 응답 patch와 단기 공통 데이터 캐시, heartbeat 결과 공유를 사용한다.

**Tech Stack:** Next.js 16.2, React 19, TypeScript, Vitest.

## 제약

현재 브랜치에서 순차 실행한다. 서브에이전트·푸시·배포 없이 기존 tsconfig 변경을 보존한다. 로컬 Next.js route handler 문서를 확인했다.

## 1. 입찰 응답 재사용

- [x] `marketplace/bid/route.test.ts` 성공 응답에 `{ bidCount: 1, expiresAt: "2026-08-31T06:10:00.001Z", gold: 9500, bankedGold: 0 }`를 단언한다.
- [x] `V2MarketplaceView.requests.test.tsx`에서 완전한 bid 응답 후 browse GET과 refreshGameState가 없고 applyResourcePatch가 잔액을 받는지 검증한다. 기존 응답 fallback도 유지한다.
- [x] 테스트 실패를 확인하고 route 응답 필드와 client patch를 구현한다. 내 입찰 GET은 유지한다.
- [x] route·화면 테스트, 변경 파일 lint를 통과시키고 커밋한다.

## 2. 시세 캐시

- [x] `marketplace/marketplacePriceCache.test.ts`에 30초 TTL 경계, 동시 요청 병합, 실패 재시도, 무효화 중 진행 응답 경쟁 테스트를 작성하고 모듈 부재 실패를 확인한다.
- [x] `readMarketplacePrices(): Promise<Record<string, PriceStat>>`와 `invalidateMarketplacePrices(): void`를 새 모듈에 구현한다. 성공 응답만 보관한다.
- [x] `loadPrices`를 캐시 reader로 바꾸고 `act` 및 bid 성공 시 무효화한다. 관련 화면 테스트에서 캐시를 초기화한다.
- [x] 화면 재마운트와 거래 후 재방문 테스트로 가격 GET 감소 및 강제 갱신을 검증하고 커밋한다.

## 3. heartbeat 빌드 정보 공유

- [x] `presenceBuildVersion.test.ts`에서 진행 중 응답 합류, 30초 TTL, 실패 및 buildId 누락을 검증한다.
- [x] `trackPresenceBuildVersion(request: Promise<string | null>): void`, `readPresenceBuildVersion(): Promise<string | null>`을 구현한다. 실패한 조회는 현재 체크에 null을 반환하고 오래된 정보를 새로 유효하게 만들지 않는다.
- [x] heartbeat route에 buildId를 추가하고 hook에서 성공한 결과를 공유한다. ping에 in-flight guard를 추가한다.
- [x] VersionCheck가 공유 결과를 먼저 확인하고 없을 때 `/api/version`을 호출하도록 한다. 합류·fallback·기존 주기 테스트를 검증한다.
- [x] 관련 테스트와 lint를 통과시키고 커밋한다.

## 최종 검증

- [x] 세 단계 관련 테스트를 함께 실행한다.
- [x] 전체 lint·TypeScript·production build 및 diff 검사를 수행한다.
- [x] 구현 효과, 남은 조회, 검증 범위 및 한계를 문서에 기록한다.

## 구현 및 검증 기록

- 1단계 `54aade648`: 입찰 성공의 지갑·매물 patch로 browse와 game-state GET을 생략한다. 이미 로드한 내 입찰 내역 GET과 구 응답 fallback은 유지한다.
- 2단계 `a5f797aa7`: 공통 시세만 30초 재사용한다. 행동 후 무효화 및 오래된 진행 응답의 캐시 오염 방지를 검증했다.
- 3단계 `81f387a71`: heartbeat의 공개 buildId를 버전 검사에서 재사용하고 진행 중 ping을 병합한다. 접속 등록·제재 주기 및 세션 무효화 처리를 유지한다.
- `efc45f778`: 전체 타입 검사에서 발견한 Promise 초기화 참조 오류를 수정했다.
- 통합 회귀 테스트 11개 파일 56개, 거래소 추가 화면 테스트 2개 파일 13개가 통과했다(총 69개). 타입 오류 수정 후 영향받은 17개 테스트를 다시 통과시켰다.
- 전체 ESLint·TypeScript 및 변경 diff 검사 통과. 전체 9천여 개 테스트는 이번에는 재실행하지 않았고 이전 기록의 실패 11개를 수정하지 않았다.
- 최초 build는 제한된 네트워크에서 Google Fonts 다운로드 실패. 네트워크 권한을 받은 재검증에서 production build와 postbuild가 통과했다(618개 정적 페이지 생성, manifest 보정 및 클라이언트 요리 비공개 정보 검사 포함).
- 개인 인벤토리·매물 캐시, 채팅 구조·AWS·푸시·운영 배포는 변경하지 않았다.
