# Full Game Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임 동작을 유지하면서 거래소·사냥 API·전역 상태·전투 엔진의 확인된 결합과 낭비를 줄이고 구조 회귀를 자동 검출한다.

**Architecture:** 네트워크와 상태를 가진 코디네이터는 유지하고 순수 계산·표시 컴포넌트·좁은 컨텍스트를 별도 모듈로 추출한다. 서버 최적화는 잠금 순서를 유지한 단일 쿼리 통합으로 제한하며, 구조 정리는 정적 진입점이 없는 은퇴 UI만 삭제한다.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript 5, Drizzle ORM 0.45, Vitest 4.1

**Execution status:** 구현 완료. 최종 검증 결과는 이 계획 하단의 `Execution Result`에 기록한다.

## Global Constraints

- 전투 결과, 보상량, 거래소 동작 및 API 응답 형식은 바꾸지 않는다.
- `src/components/ui/surfaces.ts`의 불투명 표면 규칙을 유지한다.
- DB 스키마와 마이그레이션은 변경하지 않는다.
- 운영 배포와 점검 모드 변경은 하지 않는다.
- 서브에이전트를 사용하지 않는다.

---

### Task 1: 대형 모듈 회귀 예산

**Files:**
- Create: `scripts/module-budgets.mjs`
- Create: `src/architecture/moduleBudgets.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `checkModuleBudgets(entries, readLineCount): BudgetViolation[]`
- Produces: `npm run check-module-budgets`

- [ ] **Step 1: 실패 테스트 작성** — 예산 이하 파일은 통과하고, 초과 파일은 경로·실제 줄 수·예산을 반환하며, 존재하지 않는 파일은 실패하는 사례를 작성한다.
- [ ] **Step 2: RED 확인** — `npm test -- scripts/module-budgets.test.ts`가 모듈 부재로 실패하는지 확인한다.
- [ ] **Step 3: 최소 구현** — `BudgetViolation`을 `{ path, lines, maxLines, reason }` 형태로 반환하고 CLI는 위반 시 exit code 1을 설정한다.
- [ ] **Step 4: GREEN 확인** — 단위 테스트와 `npm run check-module-budgets`를 실행한다.

### Task 2: 거래소 묶음 매물 UI 분리

**Files:**
- Create: `src/adventure/v2/marketplace/MarketplaceStackBrowse.tsx`
- Create: `src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`

**Interfaces:**
- Consumes: `MarketplaceStackGroup`, 수량 문자열, 구매·즐겨찾기·도구 열기 콜백
- Produces: `MarketplaceStackBrowse`, `StackBuyConfirm`, `BuyOrderBookSummary`

- [ ] **Step 1: 실패 테스트 작성** — 새 모듈의 두 컴포넌트를 import하고 서버 마크업에 품목명·견적·잔량이 포함되는지 확인한다.
- [ ] **Step 2: RED 확인** — 새 모듈이 없어 테스트가 실패하는지 확인한다.
- [ ] **Step 3: 컴포넌트 추출** — 코디네이터의 상태나 fetch를 옮기지 않고 props 기반 UI만 이동한다.
- [ ] **Step 4: GREEN 확인** — 거래소 관련 테스트와 TypeScript 검사를 실행한다.

### Task 3: 사냥 점령 조회 단일화

**Files:**
- Create: `src/app/api/v2/dungeon/hunt/huntLocations.ts`
- Create: `src/app/api/v2/dungeon/hunt/huntLocations.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`

**Interfaces:**
- Produces: `normalizedHuntLocationIds(catalogOutpostId, tileOutpostId): string[]`
- Route query: `outpost_id IN (...) ORDER BY outpost_id FOR SHARE`

- [ ] **Step 1: 실패 테스트 작성** — null 제거, 중복 제거, 사전순 정렬을 검증한다.
- [ ] **Step 2: RED 확인** — 모듈 부재 실패를 확인한다.
- [ ] **Step 3: 순수 함수 구현** — 유효한 비어 있지 않은 문자열만 반환한다.
- [ ] **Step 4: 라우트 변경** — 위치별 반복 SELECT를 한 번의 `inArray` SELECT로 바꾸고 `outpostId`를 결과에 포함해 Map을 채운다.
- [ ] **Step 5: GREEN 확인** — hunt 테스트 전체와 TypeScript 검사를 실행한다.

### Task 4: 게임 상태 새로고침 컨텍스트 분리

**Files:**
- Create: `src/adventure/v2/GameStateRefreshContext.tsx`
- Create: `src/adventure/v2/GameStateRefreshContext.test.tsx`
- Modify: `src/adventure/v2/GameStateProvider.tsx`
- Modify: `src/adventure/v2/V2ProfileImageView.tsx`
- Modify: `src/adventure/v2/V2CodexView.tsx`
- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`
- Modify: `src/adventure/v2/V2AttendanceView.tsx`
- Modify: `src/adventure/v2/V2QuestView.tsx`
- Modify: `src/adventure/v2/V2CosmeticsView.tsx`
- Modify: `src/app/(game)/battle/mastery-tower/page.tsx`
- Modify: `src/app/(game)/battle/grid-dungeon/page.tsx`

**Interfaces:**
- Produces: `GameStateRefreshProvider({ refreshGameState, children })`
- Produces: `useRefreshGameState(): () => Promise<void>`

- [ ] **Step 1: 실패 테스트 작성** — Provider 내부에서 동일 콜백을 얻고 Provider 밖에서는 명확한 오류를 던지는지 확인한다.
- [ ] **Step 2: RED 확인** — 모듈 부재 실패를 확인한다.
- [ ] **Step 3: 컨텍스트 구현** — nullable context와 전용 hook을 구현한다.
- [ ] **Step 4: Provider 연결** — 기존 Provider의 가장 안쪽에 새 Provider를 배치해 안정적인 `refreshGameState` 참조를 제공한다.
- [ ] **Step 5: 소비처 이전** — 새로고침만 쓰는 8개 소비처를 좁은 hook으로 바꾼다.
- [ ] **Step 6: GREEN 확인** — 관련 컴포넌트 테스트와 TypeScript 검사를 실행한다.

### Task 5: PvE/PvP 마법 방어 계산 통합

**Files:**
- Modify: `src/adventure/v2/combat/engine.damageHelpers.test.ts`
- Modify: `src/adventure/v2/combat/engine.damageHelpers.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`

**Interfaces:**
- Produces: `reducedMagicDefense(baseDefense, reductionPct): number`

- [ ] **Step 1: 실패 테스트 작성** — 0%, 양수, 상한 초과, 음수 입력과 반올림을 검증한다.
- [ ] **Step 2: RED 확인** — export 부재 실패를 확인한다.
- [ ] **Step 3: 최소 구현** — 기존 `cappedDefReductionPct`와 동일한 클램프 및 `Math.round`를 사용한다.
- [ ] **Step 4: 두 엔진 이전** — 각 엔진의 중복 계산을 공통 함수 호출로 교체한다.
- [ ] **Step 5: GREEN 확인** — 모든 combat 테스트를 실행한다.

### Task 6: 은퇴 UI 및 정적 분석 노이즈 정리

**Files:**
- Delete: Knip가 진입점 없음으로 판정한 은퇴 거점 UI 클러스터 16개 파일
- Modify: `knip.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Knip entry: `infra/**/*.{ts,mjs}`
- Direct dev dependency: `tsx@4.21.0`

- [ ] **Step 1: 삭제 전 참조 확인** — 각 파일이 앱·라우트 엔트리에서 참조되지 않고 서로만 연결되는지 `rg`로 확인한다.
- [ ] **Step 2: 은퇴 클러스터 삭제** — 거점 UI, 그 전용 아이콘·시간 hook 및 사용처 없는 MailboxBell을 제거한다.
- [ ] **Step 3: Knip 설정 보정** — infra 스크립트를 entry에 포함하고 전이 의존성 `tsx`를 직접 선언한다.
- [ ] **Step 4: 정적 분석 확인** — `npm run knip`에서 unused file 0, unresolved import 0을 확인한다. unused export는 정보성으로 유지한다.

### Task 7: 전체 검증과 전후 비교

**Files:**
- Modify: `docs/superpowers/plans/2026-08-13-full-optimization.md`

**Interfaces:**
- Verification commands: module budgets, images, Vitest, ESLint, TypeScript, Next build, Knip

- [ ] **Step 1: 전체 테스트** — `npm test`에서 실패 0을 확인한다.
- [ ] **Step 2: 정적 검사** — `npm run lint`, `npx tsc --noEmit`, `npm run check-images`, `npm run check-module-budgets`를 실행한다.
- [ ] **Step 3: 프로덕션 빌드** — `npm run build` exit code 0을 확인한다.
- [ ] **Step 4: 변화 확인** — `git diff --stat`, 대형 파일 줄 수, Knip unused files/unresolved imports를 기준선과 비교한다.
- [ ] **Step 5: 커밋** — 검증된 변경만 하나의 정비 커밋으로 기록한다.

## Execution Result

- 거래소 코디네이터: 3,925줄 → 3,746줄
- 사냥 점령 조회: 위치별 최대 2 SELECT → 정렬된 단일 SELECT
- 새로고침 전용 컨텍스트: 새로고침만 쓰는 8개 소비처 이전
- 전투 계산: PvE/PvP 마법 방어 감소 수식 단일화
- Knip: unused files 17 → 0, unresolved imports 1 → 0
- 은퇴 UI: 진입점 없는 16개 파일 제거
- 모듈 예산: 대형·신규 분리 모듈 9개 자동 검사
