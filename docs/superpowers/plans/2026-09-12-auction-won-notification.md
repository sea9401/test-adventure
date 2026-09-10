# Auction Won Notification Implementation Plan

**Goal:** 거래소 낙찰과 물품 지급 완료를 구매자에게 알린다.
**Architecture:** 정산 트랜잭션에 영속 알림을 저장하고 커밋 후 푸시를 보낸다. 클라이언트와 푸시가 같은 문구 함수를 사용한다.
**Tech Stack:** Next.js route handlers, Drizzle, React, Vitest.

## Constraints

- 현재 브랜치에서 직접 수행하며 서브에이전트·배포·외부 답변 등록은 사용하지 않는다.
- 품목·수량·낙찰가를 저장하고 판매자 정보는 노출하지 않는다.
- 기존 알림 보존·미읽음 정책을 재사용한다.

## Task 1: 정산 알림과 푸시

- [x] `src/app/api/v2/cron/marketplace-expire/route.test.ts`에 실제 알림 insert를 기록하는 DB 대역을 확장하고 구매자·페이로드·중복·실패 검증을 추가한다.
- [x] `src/lib/server/webPush.test.ts`에 낙찰 푸시의 내용과 매물별 태그를 검증한다. 변경 전 실패를 확인한다.
- [x] `src/lib/v2-notification-config.ts`에 `AuctionWonNotificationPayload`와 `auction_won`을 추가한다. `auctionWonNotificationText(payload)`는 품목·수량·낙찰가·지급 완료를 반환한다.
- [x] 정산 성공 분기에서 `await insertNotificationWith(tx, bidderId, "auction_won", payload)`를 실행한다. 트랜잭션 반환값에 payload를 포함하고 커밋 후 푸시를 try/catch로 격리한다.
- [x] 기존 거래 제한 테스트의 DB 대역을 새 알림 저장 쿼리에 맞춘다.

## Task 2: 알림 표시와 검증

- [x] `NotificationBell.layout.test.tsx`에 API로 받은 낙찰 알림의 실제 표시 회귀 테스트를 추가하고 실패를 확인한다.
- [x] `NotificationBell.tsx`, `V2NotificationsView.tsx`에서 낙찰 문구와 아이콘을 표시한다.
- [x] 관련 정산·알림·거래 제한 테스트, `npx tsc --noEmit`, 변경 파일 ESLint, `git diff --check`를 실행한다.
- [x] 변경 내용을 직접 검토하고 현재 브랜치에 커밋한다.

## Verification

관련 9개 테스트 파일의 60개 테스트 통과. 새 정산·푸시·미리보기 테스트의 변경 전 실패와 변경 후 성공을 확인했다. TypeScript 및 변경 파일 ESLint, diff 공백 검증 통과. DB 대역을 사용하는 회귀 테스트이며 실제 운영 푸시 전송과 배포는 수행하지 않았다.
