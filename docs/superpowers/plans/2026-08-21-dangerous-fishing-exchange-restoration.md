# 위험 해역 교환소 복구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최신 `main`에 위험 해역 교환 API·화면·칭호·영구 프로필 테두리·사용처 안내를 원자성과 데이터 호환성을 유지해 복원한다.

**Architecture:** 선언형 교환 카탈로그를 서버와 UI가 공유하고, 서버 트랜잭션이 재료·코인·보상을 잠금 순서대로 갱신한다. 영구 꾸미기는 기존 기간제 저장 구조의 선택 필드로 확장하며, 상점 UI는 공용 불투명 표면 상수를 사용한다.

**Tech Stack:** TypeScript, React 19, Next.js 16 Route Handlers, Drizzle ORM, Vitest

## Global Constraints

- 기준 브랜치는 `origin/main` SHA `409e1fcd5`다.
- 원본 기능 브랜치 전체를 병합하지 않는다.
- 기존 위험 해역 재료 ID, 장비 보유 데이터, 거래소 거래를 유지한다.
- 실패·중복 요청에서는 어떤 자원도 추가 차감하거나 지급하지 않는다.
- 새 관계형 DB 마이그레이션은 만들지 않는다.
- 카드와 패널은 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`를 사용한다.
- 배포와 점검 모드 변경은 하지 않는다.

---

### Task 1: 교환 카탈로그와 영구 꾸미기 호환성 복원

**Files:**
- Create: `src/adventure/v2/dangerousFishingExchange.ts`
- Modify: `src/adventure/data/titles.ts`
- Modify: `src/adventure/data/v2/dangerousFishing.ts`
- Modify: `src/adventure/data/v2/museunCosmetics.ts`
- Modify: `src/adventure/state/character.ts`
- Test: `src/adventure/v2/dangerousFishingExchange.test.ts`
- Test: `src/adventure/data/v2/museunCosmetics.test.ts`

**Interfaces:**
- Consumes: 위험 해역 어획물·증표·장비 ID와 기존 꾸미기 저장값
- Produces: 교환 카탈로그, 자동 혼합 납품 선택, `permanentOwned` 기반 영구 테두리 판정

- [ ] **Step 1: 원본 도메인과 영구 꾸미기 커밋을 재적용한다**

```bash
git cherry-pick a4218e459 d94c29ec1
```

- [ ] **Step 2: 도메인과 기간제 꾸미기 회귀 테스트를 실행한다**

```bash
npx vitest run src/adventure/v2/dangerousFishingExchange.test.ts src/adventure/data/v2/museunCosmetics.test.ts
```

Expected: 교환 비용·자동 선택·중복 보유와 기간제·영구 꾸미기 판정이 모두 PASS한다.

### Task 2: 원자적 교환 API 복원

**Files:**
- Create: `src/lib/server/dangerousFishingExchange.ts`
- Create: `src/app/api/v2/dangerous-fishing/exchange/route.ts`
- Test: `src/lib/server/dangerousFishingExchangeRoute.test.ts`

**Interfaces:**
- Consumes: `DangerousFishingExchangeRequest`, 공용 교환 카탈로그, 플레이어 KV 저장소
- Produces: 인증된 GET 상태와 멱등·원자적 POST 교환 결과

- [ ] **Step 1: 원본 서버와 Route Handler 커밋을 재적용한다**

```bash
git cherry-pick 400630e87
```

- [ ] **Step 2: 서버 도메인·라우트 테스트를 실행한다**

```bash
npx vitest run src/lib/server/dangerousFishingExchangeRoute.test.ts
```

Expected: 성공 차감·지급, 부족·중복 보유 불변성, `operationId` 재전송 멱등성이 모두 PASS한다.

### Task 3: 낚시 상점 UI와 사용처 안내 복원

**Files:**
- Create: `src/adventure/v2/DangerousFishingExchangeSection.tsx`
- Create: `src/adventure/v2/useDangerousFishingExchange.ts`
- Modify: `src/adventure/v2/DangerousFishingShopSection.tsx`
- Modify: `src/adventure/v2/FishingShopPanel.tsx`
- Modify: `src/adventure/v2/FishingShopView.tsx`
- Modify: `src/adventure/v2/DangerousFishingBossPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingCargoPanel.tsx`
- Modify: `src/app/manual/content/pastimes.tsx`
- Test: `src/adventure/v2/DangerousFishingExchangeSection.test.tsx`
- Test: `src/adventure/v2/DangerousFishingShopSection.test.tsx`
- Test: `src/adventure/v2/DangerousFishingView.test.tsx`
- Test: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: 교환 API 상태와 공용 교환 카탈로그
- Produces: 잠금·부족·보유·교환 가능 상태, 1회·최대 교환 확인, 사용처 링크와 매뉴얼 표

- [ ] **Step 1: 원본 상점 UI와 안내 커밋을 재적용한다**

```bash
git cherry-pick f055efaae a3af9a062
```

- [ ] **Step 2: UI와 매뉴얼 테스트를 실행한다**

```bash
npx vitest run src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx src/adventure/v2/DangerousFishingView.test.tsx src/app/manual/current-content.test.tsx
```

Expected: 상점 상태·확인창·중복 클릭 방지·사용처 안내가 모두 PASS한다.

### Task 4: 위험 해역 통합 검증

**Files:**
- Test: `src/lib/server/dangerousFishingRoute.test.ts`
- Test: `src/lib/server/marketplaceV2Fulfillment.test.ts`
- Test: `src/app/(game)/town/fishing/shop/page.test.tsx`

**Interfaces:**
- Consumes: Tasks 1~3의 교환·꾸미기·UI 경계
- Produces: 기존 낚시·거래소·상점과의 통합 회귀 근거

- [ ] **Step 1: 위험 해역과 거래소 회귀 테스트를 실행한다**

```bash
npx vitest run src/lib/server/dangerousFishingRoute.test.ts src/lib/server/marketplaceV2Fulfillment.test.ts 'src/app/(game)/town/fishing/shop/page.test.tsx'
```

Expected: 기존 출항·귀환·거래소 배송·상점 진입이 모두 PASS한다.

- [ ] **Step 2: 변경 범위를 확인한다**

```bash
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected: 설계 문서와 위험 해역 교환·꾸미기·상점·매뉴얼·테스트 파일만 나타난다.

