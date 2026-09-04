# Toss Homepage Review Surface Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 토스페이먼츠 홈페이지 심사에서 상품, 사업자 정보, 테스트 결제 흐름을 확인할 수 있는 공개 표면을 안전하게 구성한다.

**Architecture:** 공개 상품 페이지와 공통 사업자 정보 컴포넌트를 서버 렌더링하고, 실제 구매는 기존 로그인 전용 코인 상점으로 연결한다. 심사 모드에서는 운영 환경 사전 점검이 사업자 정보·리뷰 계정·테스트 키 구성을 강제하며, 결제 클라이언트는 Toss Payments SDK v2의 결제창 이벤트 흐름을 사용한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Playwright, Toss Payments SDK v2

---

### Task 1: 사업자 공개 정보와 심사 준비 사전 점검

**Files:**
- Create: `src/lib/publicMerchantInfo.ts`
- Create: `src/lib/publicMerchantInfo.test.ts`
- Modify: `scripts/check-production-env.mjs`
- Modify: `src/db/productionEnvPreflight.test.ts`
- Modify: `.env.example`
- Modify: `.env.production`

1. 법정 상호·사업자등록번호와 환경 변수 기반 대표자·주소·연락처를 읽는 테스트를 먼저 작성한다.
2. 심사 모드에서 공개 사업자 정보, 리뷰 계정, 테스트 결제 키가 빠지면 실패하는 사전 점검 테스트를 작성하고 실패를 확인한다.
3. 최소 구현을 추가하고 해당 테스트를 통과시킨다.

### Task 2: 공개 코인 상품 페이지와 고유 상품 이미지

**Files:**
- Create: `src/app/products/museun-coin/page.tsx`
- Create: `src/app/products/museun-coin/page.test.tsx`
- Create: `src/components/MerchantDisclosure.tsx`
- Create: `public/images/products/museun-coin-1000.svg`
- Create: `public/images/products/museun-coin-2000.svg`
- Create: `public/images/products/museun-coin-3000.svg`
- Create: `public/images/products/museun-coin-5000.svg`
- Modify: `src/app/sitemap.ts`
- Modify: `docs/asset-rights.json`

1. 네 개 상품·서로 다른 이미지·가격·즉시 지급·이용 조건이 나타나는 서버 렌더링 테스트를 작성하고 실패를 확인한다.
2. 상품 페이지와 고유 SVG 자산을 구현하고 사이트맵에 공개 URL을 추가한다.
3. 이미지 및 자산 권리 검사를 통과시킨다.

### Task 3: 로그인 랜딩 푸터 사업자 정보 보강

**Files:**
- Modify: `src/app/sign-in/LandingContent.tsx`
- Modify: `src/app/sign-in/LandingContent.test.tsx`
- Modify: `src/app/sign-in/page.tsx`
- Modify: `src/app/dev/landing/page.tsx`

1. 상품 안내 링크와 완성된 사업자 정보가 푸터에 표시되는 테스트를 추가하고 실패를 확인한다.
2. 서버에서 읽은 사업자 정보를 랜딩에 전달하고 공통 컴포넌트로 표시한다.
3. 랜딩 단위 테스트를 통과시킨다.

### Task 4: Toss Payments SDK v2 결제창 흐름 교정

**Files:**
- Modify: `src/adventure/v2/MuseunCoinCheckout.test.tsx`
- Modify: `src/adventure/v2/MuseunCoinCheckout.tsx`

1. `renderPaymentWindow()` 이후 `paymentRequest` 이벤트에서만 승인 요청을 시작하고, `cancel` 시 UI 잠금을 해제하는 테스트를 작성한다.
2. 현재 직접 `requestPayment()` 호출을 이벤트 기반 결제창 흐름으로 교체한다.
3. 결제 컴포넌트 테스트를 통과시킨다.

### Task 5: 공개 경로 회귀 검사와 운영 안내

**Files:**
- Modify: `e2e/public-surface.spec.ts`
- Create: `docs/operations/toss-homepage-review.md`

1. 공개 상품 페이지가 로그인 없이 열리는 E2E 기대값을 추가한다.
2. 배포 전 입력값, 리뷰 계정, 테스트 결제 확인 및 심사 종료 후 되돌릴 값을 운영 문서로 기록한다.
3. 관련 단위 테스트, 린트, 타입 검사, 빌드, 이미지 검사와 가능한 E2E를 실행한다.
4. 변경을 커밋하며 배포·푸시·점검 모드 전환은 수행하지 않는다.
