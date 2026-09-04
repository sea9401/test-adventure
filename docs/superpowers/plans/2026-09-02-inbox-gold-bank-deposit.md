# 우편 골드 은행 자동 입금 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 우편으로 수령하는 모든 골드를 보유금 대신 은행 잔액에 원자적으로 적립한다.

**Architecture:** 기존 `POST /api/marketplace/inbox/claim` 트랜잭션의 우편 종류별 보상 집계만 단일 은행 골드 합계로 통일한다. 응답과 클라이언트 상태 반영 계약은 기존 `bankedGoldAdded/newBankedGold` 경로를 그대로 사용한다.

**Tech Stack:** Next.js 16.2.11 Route Handlers, TypeScript, Drizzle ORM, Vitest 4

## Global Constraints

- 모든 골드 우편 종류를 은행에 직접 적립한다.
- 기존 보유 골드는 변경하지 않는다.
- 골드 외 보상과 우편 수령 트랜잭션 동작은 변경하지 않는다.
- 배포하지 않는다.

---

### Task 1: 우편 골드 지급 경로 통일

**Files:**
- Modify: `src/lib/server/inboxClaimSeasonReward.test.ts`
- Modify: `src/app/api/marketplace/inbox/claim/route.ts`

**Interfaces:**
- Consumes: `parseInboxPayload`가 반환하는 `sale_proceeds`, `bid_refund`, `buy_order_refund`, `guild_quest_reward`, `admin_gift`의 `gold`
- Produces: 수령 응답의 `bankedGoldAdded`, `newBankedGold`; 변경되지 않는 `character.v2.gold`

- [x] **Step 1: 모든 골드 우편의 은행 적립 실패 테스트 작성**

  판매 대금 1,000G, 입찰 환불 50G, 구매주문 환불 70G, 길드 의뢰 80G, 운영자 우편 100G를 한 요청으로 수령한다. 초기 `{ gold: 100, bankedGold: 200 }`에서 응답과 저장값이 `gold: 100`, `bankedGold: 1_500`, `goldAdded: 0`, `bankedGoldAdded: 1_300`인지 리터럴로 검증한다.

- [x] **Step 2: 테스트를 실행해 RED 확인**

  Run: `npx vitest run src/lib/server/inboxClaimSeasonReward.test.ts`

  Expected: 기존 구현이 환불·길드·운영자 골드 300G를 보유금에 넣어 실패한다.

- [x] **Step 3: 최소 서버 구현**

  `walletGoldTotal` 분기를 제거하고 다섯 종류의 양수 골드를 모두 `bankedGoldTotal`에 합산한다. 캐릭터 잠금·업서트와 응답은 기존 은행 골드 경로만 사용한다.

- [x] **Step 4: 집중 테스트를 실행해 GREEN 확인**

  Run: `npx vitest run src/lib/server/inboxClaimSeasonReward.test.ts`

  Expected: 모든 테스트가 통과한다.

- [x] **Step 5: 정적 검사와 빌드**

  Run: `npx eslint src/app/api/marketplace/inbox/claim/route.ts src/lib/server/inboxClaimSeasonReward.test.ts`

  Run: `npx tsc --noEmit`

  Run: `npm run build`

  Expected: 모든 명령이 종료 코드 0으로 끝난다.

- [x] **Step 6: 로컬 커밋**

```bash
git add docs/superpowers/specs/2026-09-02-inbox-gold-bank-deposit-design.md docs/superpowers/plans/2026-09-02-inbox-gold-bank-deposit.md src/app/api/marketplace/inbox/claim/route.ts src/lib/server/inboxClaimSeasonReward.test.ts
git commit -m "fix: deposit inbox gold into bank"
```
