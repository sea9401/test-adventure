# CloudFront Request Reduction Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전역 상단 상태 요청을 통합하고, 공개 정적 자산에 브라우저 캐시를 부여하며, 변화 없는 채팅·전광판 폴링을 점진적으로 늦춰 CloudFront viewer request를 추가 절감한다.

**Architecture:** 영속 `GameChrome`에 단일 `ChromeStatusProvider`를 두고 알림·우편·공지 배지를 한 API로 동기화한다. 정적 공개 자산은 파일명이 비해시라는 점을 고려해 하루 브라우저 캐시를 사용한다. 채팅과 전광판은 재귀 타이머와 연속 무변화 횟수로 30초에서 최대 120초까지 backoff하며 새 데이터가 오면 즉시 기본 간격으로 복귀한다.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript, Drizzle ORM, Vitest 4, Testing Library

## Global Constraints

- 기존 상세 알림, 우편함, 공지 목록 API와 사용자 이벤트 이름을 유지한다.
- 열린 채팅의 3초 갱신 주기는 변경하지 않는다.
- `/sw.js`는 캐시하지 않는다.
- `tsconfig.json`의 기존 사용자 변경을 수정하거나 커밋하지 않는다.
- AWS 설정, 플랜, 운영 배포, push/merge/PR은 변경하지 않는다.

---

### Task 1: 통합 chrome 상태 서버 API

**Files:**
- Create: `src/lib/server/chromeStatus.ts`
- Create: `src/lib/server/chromeStatus.test.ts`
- Create: `src/app/api/v2/chrome-status/route.ts`
- Create: `src/app/api/v2/chrome-status/route.test.ts`

**Interfaces:**
- Consumes: 인증된 `userId`, 알림·farm save·우편·공지 조회 데이터
- Produces: `{ notificationUnread, mailUnread, hasUnreadNotice }`와 private/no-store API 응답

- [ ] **Step 1: Write failing server and route tests**

서버 계산 테스트는 저장 알림과 수확 준비 알림을 합산하고, 우편 카운트와 최신 공지 열람 여부를 반환하는지 확인한다. route 테스트는 미인증 401, 인증 성공 응답, `private, no-store` 헤더를 확인한다.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/server/chromeStatus.test.ts src/app/api/v2/chrome-status/route.test.ts`

Expected: 모듈이 없어 실패한다.

- [ ] **Step 3: Implement the minimal reader and route**

기존 세 API와 같은 Drizzle 조건을 사용하는 `readChromeStatus`를 구현한다. 알림·farm save·우편·최신 공지는 가능한 범위에서 병렬 조회하고, 최신 공지가 있을 때만 view를 추가 조회한다. route는 `ensureUser()`를 한 번 호출한다.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `npm test -- src/lib/server/chromeStatus.test.ts src/app/api/v2/chrome-status/route.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/chromeStatus.ts src/lib/server/chromeStatus.test.ts src/app/api/v2/chrome-status/route.ts src/app/api/v2/chrome-status/route.test.ts
git commit -m "feat: add consolidated chrome status endpoint"
```

### Task 2: 상단 배지 폴링을 Provider 하나로 통합

**Files:**
- Create: `src/adventure/v2/ChromeStatusProvider.tsx`
- Create: `src/adventure/v2/ChromeStatusProvider.test.tsx`
- Modify: `src/adventure/v2/GameChrome.tsx`
- Modify: `src/adventure/v2/NotificationBell.tsx`
- Modify: `src/adventure/v2/NotificationBell.layout.test.tsx`
- Modify: `src/adventure/v2/V2NoticeLink.tsx`
- Modify: `src/adventure/v2/V2NoticeLink.test.tsx`

**Interfaces:**
- Consumes: `/api/v2/chrome-status`, visibility 상태, 기존 refresh 이벤트
- Produces: Provider 하위에서 공유되는 알림·우편·공지 상태와 count updater

- [ ] **Step 1: Write failing Provider and consumer tests**

Provider가 최초 한 요청만 보내고 값을 두 consumer에 전달하는지 확인한다. fake timer로 60초 visible 폴링, hidden 중단, visible 복귀 즉시 조회, 세 refresh 이벤트가 모두 같은 통합 endpoint를 호출하는지 확인한다. Bell 미리보기와 낙관적 읽음 처리의 count 갱신도 회귀 테스트한다.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/adventure/v2/ChromeStatusProvider.test.tsx src/adventure/v2/NotificationBell.layout.test.tsx src/adventure/v2/V2NoticeLink.test.tsx`

Expected: Provider 모듈 부재 또는 기존 개별 endpoint 호출 단언 불일치로 실패한다.

- [ ] **Step 3: Implement Provider and migrate consumers**

Provider는 중복 실행을 막는 ref와 마지막 성공 상태를 유지한다. `NotificationBell`은 Provider 카운트를 사용하고 기존 두 count fetch effect를 제거한다. `V2NoticeLink`는 Provider의 공지 상태를 사용하고 자체 폴링을 제거한다. `GameChrome`에서 `V2TopBar`를 Provider로 감싼다.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `npm test -- src/adventure/v2/ChromeStatusProvider.test.tsx src/adventure/v2/NotificationBell.layout.test.tsx src/adventure/v2/V2NoticeLink.test.tsx src/adventure/v2/GameChrome.layout.test.tsx src/adventure/v2/V2TopBar.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/ChromeStatusProvider.tsx src/adventure/v2/ChromeStatusProvider.test.tsx src/adventure/v2/GameChrome.tsx src/adventure/v2/NotificationBell.tsx src/adventure/v2/NotificationBell.layout.test.tsx src/adventure/v2/V2NoticeLink.tsx src/adventure/v2/V2NoticeLink.test.tsx
git commit -m "feat: consolidate chrome status polling"
```

### Task 3: 공개 정적 자산 브라우저 캐시

**Files:**
- Modify: `next.config.ts`
- Create: `src/staticAssetCacheConfig.test.ts`

**Interfaces:**
- Produces: 이미지·아이콘·manifest의 `public, max-age=86400, stale-while-revalidate=604800` 응답 헤더

- [ ] **Step 1: Write the failing config regression test**

설정 소스에서 공개 자산 경로와 캐시 정책이 모두 선언되어 있고 `/sw.js`의 no-store 정책이 남아 있는지 확인한다. 구성 코드라 런타임 컴포넌트 테스트 대신 소스 계약 테스트를 사용한다.

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/staticAssetCacheConfig.test.ts`

- [ ] **Step 3: Add explicit asset headers**

공통 `staticAssetCacheHeaders`를 선언해 `/images/:path*`, 두 아이콘, favicon, manifest에 적용한다. 전체 보안 헤더와 service worker 헤더 순서를 유지한다.

- [ ] **Step 4: Run test and verify GREEN**

Run: `npm test -- src/staticAssetCacheConfig.test.ts`

- [ ] **Step 5: Commit**

```bash
git add next.config.ts src/staticAssetCacheConfig.test.ts
git commit -m "perf: cache public game assets in browsers"
```

### Task 4: 닫힌 채팅 적응형 폴링

**Files:**
- Modify: `src/components/chat/chatPollingPolicy.test.ts`
- Modify: `src/components/chat/chatPollingPolicy.ts`
- Modify: `src/components/ChatButton.tsx`

**Interfaces:**
- Consumes: `open`, 연속 무변화 횟수, 각 채널 응답의 새 메시지 여부
- Produces: 열린 상태 3초 고정, 닫힌 상태 30/60/120초 backoff

- [ ] **Step 1: Write failing policy tests**

열린 채팅은 idle 횟수와 무관하게 3초이고, 닫힌 채팅은 0/2회에서 30초, 3/9회에서 60초, 10회 이상에서 120초인지 확인한다.

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/components/chat/chatPollingPolicy.test.ts`

- [ ] **Step 3: Implement policy and idle tracking**

`ChatButton` effect 안에서 성공 응답의 세 채널이 모두 비어 있을 때만 idle 횟수를 늘린다. 하나라도 새 메시지가 있으면 0으로 초기화한다. 첫 스냅샷은 초기화용 과거 데이터이므로 idle 판단에서 제외하고 다음 주기부터 판정한다.

- [ ] **Step 4: Run related tests and verify GREEN**

Run: `npm test -- src/components/chat/chatPollingPolicy.test.ts src/components/ChatButton.lazy.test.ts src/components/ChatButton.layout.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/chatPollingPolicy.test.ts src/components/chat/chatPollingPolicy.ts src/components/ChatButton.tsx
git commit -m "perf: back off idle closed chat polling"
```

### Task 5: 전쟁 전광판 적응형 폴링

**Files:**
- Modify: `src/lib/feed-config.test.ts`
- Modify: `src/lib/feed-config.ts`
- Modify: `src/adventure/v2/WarTicker.tsx`
- Modify: `src/adventure/v2/WarTicker.test.ts`

**Interfaces:**
- Consumes: 연속으로 동일한 사건 ID 묶음 횟수
- Produces: 30/60/120초 backoff, hidden 중단, visible/focus 즉시 조회

- [ ] **Step 1: Write failing policy and scheduling tests**

feed policy의 0/1회 30초, 2/5회 60초, 6회 이상 120초를 확인한다. 필요한 경우 ticker 컴포넌트 테스트로 동일 응답에서 backoff하고 새 ID에서 기본 단계로 복귀함을 검증한다.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/feed-config.test.ts src/adventure/v2/WarTicker.test.ts`

- [ ] **Step 3: Replace interval with recursive timeout**

`fetchWarFeed`가 성공 여부와 사건 ID 변경 여부를 반환하게 한다. effect는 한 요청씩 실행하고 성공한 동일 응답에서 idle을 증가, 변경 응답에서 0으로 초기화한다. 오류에는 idle을 바꾸지 않는다. focus와 visibility 복귀는 예약을 지우고 즉시 조회한다.

- [ ] **Step 4: Run related tests and verify GREEN**

Run: `npm test -- src/lib/feed-config.test.ts src/adventure/v2/WarTicker.test.ts src/app/api/feed/route.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/feed-config.test.ts src/lib/feed-config.ts src/adventure/v2/WarTicker.tsx src/adventure/v2/WarTicker.test.ts
git commit -m "perf: back off unchanged ticker polling"
```

### Task 6: 전체 회귀 검증

- [ ] **Step 1: Review diff scope and whitespace**

Run: `git diff --check 004dedb9d..HEAD` and `git status --short`

- [ ] **Step 2: Run targeted suite and lint**

새 API, Provider, consumer, cache config, chat, ticker 관련 테스트를 함께 실행한다. 변경된 TypeScript/TSX 파일에 lint를 실행한다.

- [ ] **Step 3: Run TypeScript and full tests**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

Run: `npm test`

기존 전체 테스트 실패가 있다면 이번 변경 파일과의 관련성을 확인하고 기존 기준과 비교해 별도로 기록한다.

- [ ] **Step 4: Run production build**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npm run build`

Expected: 타입 검사와 build 통과. 이미지 훅의 고아 파일 경고는 허용하되 실패는 허용하지 않는다.
