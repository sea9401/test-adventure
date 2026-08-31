# Secret Shop Countdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비밀 상점 안내문에 서버 기준 남은 시간을 초 단위로 표시하고 만료 시 안전하게 퇴장시킨다.

**Architecture:** GET 응답이 지도 발견 시각과 공용 TTL로 계산한 `expiresAt` 및 `serverNow`를 제공한다. 클라이언트는 서버-클라이언트 시계 차이를 보정한 종료 시각을 상태로 보관하고, 순수 포맷 함수와 1초 타이머로 문구 및 만료 동작을 갱신한다.

**Tech Stack:** Next.js 16 App Router route handler, React 19 client component, TypeScript, Vitest

## Global Constraints

- 기존 안내문 뒤에 `· 남은 시간 MM:SS`를 붙인다.
- 로딩 중이거나 유효하지 않은 지도에는 카운트다운을 표시하지 않는다.
- 만료 시 구매를 막고 안내 후 사냥터로 돌아간다.
- 서버 시각을 기준으로 클라이언트 시계 오차를 보정한다.
- 배포하지 않는다.

---

### Task 1: 비밀 상점 만료 시각 API

**Files:**
- Create: `src/app/api/v2/secret-shop/route.test.ts`
- Modify: `src/app/api/v2/secret-shop/route.ts`

**Interfaces:**
- Consumes: `RareMapInstance.foundAt`, `RARE_MAP_TTL_MS`
- Produces: GET JSON의 `expiresAt: number`, `serverNow: number`

- [ ] **Step 1: 실패하는 API 테스트 작성**

고정된 `Date.now()`와 `newRareMapInstance("secret_shop_map", ...)`를 사용해 GET 응답이 아래 값을 포함하는지 검증한다.

```ts
expect(json).toMatchObject({
  ok: true,
  map: "rm-shop",
  serverNow: NOW,
  expiresAt: FOUND_AT + RARE_MAP_TTL_MS,
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/app/api/v2/secret-shop/route.test.ts`
Expected: `serverNow` 또는 `expiresAt` 누락으로 FAIL

- [ ] **Step 3: 최소 API 구현**

GET 시작 시 `const now = Date.now()`를 한 번만 읽고 지도 파싱과 응답에 공용으로 사용한다.

```ts
const now = Date.now();
const maps = parseRareMaps(save?.rareMaps, now);
// ...
serverNow: now,
expiresAt: map.foundAt + RARE_MAP_TTL_MS,
```

- [ ] **Step 4: API 테스트 통과 확인**

Run: `npx vitest run src/app/api/v2/secret-shop/route.test.ts`
Expected: PASS

### Task 2: 카운트다운 계산 및 화면 연결

**Files:**
- Create: `src/adventure/v2/secretShopCountdown.ts`
- Create: `src/adventure/v2/secretShopCountdown.test.ts`
- Modify: `src/adventure/v2/V2SecretShopView.tsx`

**Interfaces:**
- Consumes: GET JSON의 `expiresAt`, `serverNow`
- Produces: `formatSecretShopRemaining(ms: number): string`, `correctedSecretShopExpiry(expiresAt: number, serverNow: number, clientNow: number): number`

- [ ] **Step 1: 실패하는 순수 함수 테스트 작성**

```ts
expect(formatSecretShopRemaining(29 * 60_000 + 59_000)).toBe("29:59");
expect(formatSecretShopRemaining(-1)).toBe("00:00");
expect(correctedSecretShopExpiry(130_000, 100_000, 1_000_000)).toBe(1_030_000);
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/adventure/v2/secretShopCountdown.test.ts`
Expected: 모듈 또는 함수가 없어 FAIL

- [ ] **Step 3: 순수 함수 최소 구현**

남은 밀리초는 0 이상으로 제한하고 `Math.ceil(ms / 1000)`으로 표시해 유효 시간이 남아 있는데 `00:00`으로 먼저 보이지 않게 한다. 서버 종료까지 남은 시간에 클라이언트 수신 시각을 더해 보정 종료 시각을 만든다.

- [ ] **Step 4: 화면 타이머 및 만료 처리 연결**

GET 성공 시 보정 종료 시각을 저장하고, 1초 간격으로 `clockNow`를 갱신한다. `remainingMs <= 0`이면 타이머를 정리하고 `expired`를 한 번만 설정한 뒤 구매 버튼을 비활성화하고 시스템 메시지를 표시한 다음 `onBack()`을 호출한다. `no_map` 구매 오류도 같은 만료 처리 함수를 사용한다.

안내문은 다음 구조를 유지한다.

```tsx
품목당 1회 구매 · 비밀 상점 지도는 발견 후 30분 동안 개방
{remainingMs != null ? ` · 남은 시간 ${formatSecretShopRemaining(remainingMs)}` : ""}
```

- [ ] **Step 5: 순수 함수 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/secretShopCountdown.test.ts src/app/api/v2/secret-shop/route.test.ts`
Expected: PASS

### Task 3: 정적 검증 및 커밋

**Files:**
- Modify: 위 작업 파일만

**Interfaces:**
- Consumes: Task 1~2 결과
- Produces: 타입·린트·회귀 검증이 끝난 로컬 커밋

- [ ] **Step 1: 관련 린트 실행**

Run: `npx eslint src/app/api/v2/secret-shop/route.ts src/app/api/v2/secret-shop/route.test.ts src/adventure/v2/V2SecretShopView.tsx src/adventure/v2/secretShopCountdown.ts src/adventure/v2/secretShopCountdown.test.ts`
Expected: 오류 없음

- [ ] **Step 2: 타입 검사 실행**

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 3: 관련 테스트 재실행**

Run: `npx vitest run src/app/api/v2/secret-shop/route.test.ts src/adventure/v2/secretShopCountdown.test.ts src/adventure/data/v2/secretShop.test.ts`
Expected: PASS

- [ ] **Step 4: 구현 커밋**

```bash
git add src/app/api/v2/secret-shop/route.ts src/app/api/v2/secret-shop/route.test.ts src/adventure/v2/V2SecretShopView.tsx src/adventure/v2/secretShopCountdown.ts src/adventure/v2/secretShopCountdown.test.ts docs/superpowers/plans/2026-08-10-secret-shop-countdown.md
git commit -m "feat: show secret shop countdown"
```
