# 겨울 이벤트 주사위 말판 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 접속과 일일 퀘스트로 주사위를 모아 24칸 말판을 돌고, 겨울 주화를 교환소에서 쓰는 기간 한정 이벤트를 만든다.

**Architecture:** 규칙은 DB·시계에 의존하지 않는 순수 엔진(`winterBoard.ts`)에 두고, 서버 서비스가 `saves_kv`의 `winter-board.v1`을 잠가 엔진을 호출한 뒤 보상을 지급한다. 화면은 이벤트 메뉴의 새 탭이고, 5분 주기 알림 조회가 주사위 적립을 겸한다.

**Tech Stack:** Next.js 16 App Router, Drizzle + `savesKv` 헬퍼, Vitest, 기존 UI 공용 컴포넌트.

**Spec:** `docs/superpowers/specs/2026-11-12-winter-dice-board-design.md`

## Global Constraints

- 굴리기 종료 `2026-12-11T00:00:00+09:00`, 교환소 종료 `2026-12-15T00:00:00+09:00`. 시작 조건 없음.
- 하루 주사위: 접속 1 + 일일 퀘스트 완료 수(최대 4). 한 요청의 굴림은 최대 60회.
- 칸 배치·보상·교환소 값은 설계 문서의 표와 같아야 한다.
- 잠금: `winter-board.v1` 먼저, 그 뒤 지급 대상 세이브는 요청당 하나.
- 마이그레이션, 새 그림, 새 글꼴, 픽토그램 이모지 금지. 패널은 `surfaces` 토큰과 공용 컴포넌트.
- 플레이어 문구에 내부 용어·홍보 수식어 금지. 서브에이전트 사용 금지.

## Review Focus

1. 같은 `requestId`의 `roll`이 두 번 오면 주사위·주화가 한 번만 반영된다 → Task 3 테스트.
2. 자정을 넘긴 뒤 첫 조회에서 어제 적립 기록이 오늘 상한을 깎지 않는다 → Task 1 테스트.
3. 굴리기 종료 뒤(12-11 이후)에도 받지 않은 바퀴 보상과 남은 주화는 12-14까지 쓸 수 있다 → Task 1·3 테스트.
4. 저장값이 깨졌거나 비어 있어도(새 계정) 기본 상태로 읽힌다 → Task 1 테스트.
5. "앞으로 3칸"으로 출발 칸을 넘으면 완주가 한 번만 세어진다 → Task 1 테스트(칸 배치상 19→22라 넘지 않지만, 엔진이 임의 위치에서 올바른지 직접 검증).

---

### Task 1: 규칙 엔진과 칭호

**Files:**
- Create: `src/adventure/data/v2/winterBoard.ts`, `src/adventure/data/v2/winterBoard.test.ts`
- Modify: `src/adventure/data/titles.ts` (칭호 3종: `winter_wanderer` "겨울 나그네", `winter_trailblazer` "눈길의 개척자", `winter_finisher` "겨울을 완주한 모험가")

**Interfaces (Produces):**

```ts
export const WINTER_BOARD_SAVE_KEY = "winter-board.v1";
export const WINTER_ROLLING_ENDS_AT: number; // Date.parse("2026-12-11T00:00:00+09:00")
export const WINTER_SHOP_ENDS_AT: number;    // Date.parse("2026-12-15T00:00:00+09:00")
export const WINTER_QUEST_DICE_DAILY_CAP = 4;
export const WINTER_LAP_COINS = 20;
export const WINTER_ROLL_ALL_MAX = 60;
export type WinterTile =
  | { kind: "start" } | { kind: "coins"; coins: number } | { kind: "potion" }
  | { kind: "again" } | { kind: "forward"; steps: number };
export const WINTER_TILES: readonly WinterTile[]; // 24칸, 설계 표 순서
export type WinterPhase = "active" | "shop_only" | "ended";
export function winterPhase(nowMs: number): WinterPhase;
export type WinterReward =
  | { kind: "stamina_potion"; count: number }
  | { kind: "mastery_certificate"; count: number }
  | { kind: "cash_item"; itemId: "enchant_scroll" | "emblem_box"; count: number }
  | { kind: "title"; titleId: string };
export const WINTER_MILESTONES: readonly { laps: number; label: string; reward: WinterReward }[];
export const WINTER_SHOP_ITEMS: readonly { id: string; name: string; cost: number; limit: number; reward: WinterReward }[];
export type WinterRollEvent = {
  die: number; from: number; to: number; tile: WinterTile["kind"];
  coins: number; potions: number; diceRefund: number; lapsGained: number;
};
export type WinterRollResult = { events: WinterRollEvent[]; coins: number; potions: number; lapsGained: number };
export type WinterBoardState = { /* 설계 문서 "저장" 절 그대로 */ };
export function parseWinterBoardState(raw: unknown): WinterBoardState;
export function syncWinterDice(state: WinterBoardState, dayKey: string, completedDailyQuests: number):
  { state: WinterBoardState; granted: number };
export function rollWinterDice(state: WinterBoardState, opts: { all: boolean; rng: () => number }):
  { state: WinterBoardState; result: WinterRollResult } | { error: "no_dice" };
export function claimWinterMilestone(state: WinterBoardState, laps: number):
  | { state: WinterBoardState; reward: WinterReward }
  | { error: "unknown_milestone" | "milestone_locked" | "already_claimed" };
export function buyWinterShopItem(state: WinterBoardState, itemId: string):
  | { state: WinterBoardState; item: (typeof WINTER_SHOP_ITEMS)[number] }
  | { error: "unknown_item" | "limit_reached" | "not_enough_coins" };
export function winterPendingCount(state: WinterBoardState): number; // 주사위 수 + 받을 수 있는 바퀴 보상 수
```

`rollWinterDice`는 `lastRoll`을 건드리지 않는다(요청 식별은 서비스 몫). `recentRolls`는 최근 20개만 남긴다.

- [ ] **Step 1:** `winterBoard.test.ts`에 실패 테스트 작성: 칸 구성 개수(주화2×10·주화5×5·주화10×2·회복약2·한번더2·앞으로2·출발1), `winterPhase` 경계 3개, `parseWinterBoardState({})`·깨진 값 기본 상태, `syncWinterDice`(첫 조회 +1, 완료 3개 +3, 같은 날 재호출 0, 완료 6개여도 4 상한, 날짜 변경 뒤 다시 적립하되 남은 주사위 유지), `rollWinterDice`(주사위 0 → `no_dice`, 고정 rng로 칸 효과 5종, 출발 통과·정확 도착 각 +20 주화·바퀴 +1, 임의 위치에서 앞으로 3칸으로 출발을 넘으면 바퀴 +1만, "한 번 더" 환급 뒤 `all`이 이어서 굴림, 60회 상한, `recentRolls` 20개 유지), `claimWinterMilestone` 3가지 오류와 성공, `buyWinterShopItem` 3가지 오류와 성공·한도.
- [ ] **Step 2:** `npx vitest run src/adventure/data/v2/winterBoard.test.ts` → 모듈 없음으로 FAIL 확인.
- [ ] **Step 3:** `winterBoard.ts` 구현, `titles.ts`에 칭호 3종 추가(기존 축제 칭호와 같은 형식·분류).
- [ ] **Step 4:** 같은 명령 PASS, `npx vitest run src/adventure/data/titles` 관련 테스트 PASS.
- [ ] **Step 5:** Commit `feat: 겨울 이벤트 주사위 말판 규칙 엔진`.

### Task 2: 예상 획득량 모의 계산

**Files:** Modify `src/adventure/data/v2/winterBoard.test.ts`

- [ ] **Step 1:** 시드 고정 난수(mulberry32)로 "21일 × 하루 5개"와 "21일 × 하루 2개"를 각 2,000회 돌려 평균을 재는 테스트 작성. 기대: 5개/일 평균 주화 480~720·평균 바퀴 14~18, 2개/일 평균 주화 185~275.
- [ ] **Step 2:** 실행. 범위를 벗어나면 `WINTER_LAP_COINS`만 조정하고 설계 문서의 완주 주화 값도 같이 고친다.
- [ ] **Step 3:** Commit `test: 겨울 이벤트 예상 획득량 모의 계산`.

### Task 3: 서버 서비스와 API

**Files:**
- Create: `src/lib/server/winterBoard.ts`, `src/lib/server/winterBoard.test.ts`, `src/app/api/v2/events/winter-board/route.ts`

**Interfaces:**
- Consumes: Task 1 전부, `lockSaveForUpdate`/`readSave`/`upsertSave`(`savesKv`), `rolloverRepeatQuestsBeforeProgress`·`buildRepeatSignals`·`assembleQuestExtras`·`REPEAT_QUESTS_KEY`(`v2QuestContext`), `deriveRepeatBundle`·`parseRepeatSave`, `grantStaminaPotions`·`STAMINA_POTIONS_KEY`, `MASTERY_CERTIFICATE_KEY`, `addMuseunCashItem`, `grantTitleIfMissingInTx`, `hasCompletedOnboarding`, `recordEconomyEventSoon`, `enforceUserAndIpRateLimit`, `kstDayKey`.
- Produces:

```ts
export type WinterBoardView = {
  ok: true; phase: WinterPhase; rollingEndsAt: number; shopEndsAt: number; serverNow: number;
  position: number; laps: number; dice: number; coins: number;
  today: { visitGranted: boolean; questDiceGranted: number; questDiceCap: number };
  milestones: { laps: number; label: string; claimed: boolean; claimable: boolean }[];
  shop: { id: string; name: string; cost: number; limit: number; purchased: number }[];
  recentRolls: WinterRollEvent[]; pending: number;
};
export type WinterBoardFailure = { ok: false; error: string; status: number };
export function validWinterRequestId(value: unknown): value is string; // UUID v4 형식
export async function readWinterBoard(userId: string, now: Date): Promise<WinterBoardView | WinterBoardFailure>;
export async function rollWinterBoard(userId: string, input: { requestId: string; all: boolean }, now: Date, rng?: () => number):
  Promise<(WinterBoardView & { result: WinterRollResult }) | WinterBoardFailure>;
export async function claimWinterBoardMilestone(userId: string, laps: number, now: Date):
  Promise<(WinterBoardView & { reward: WinterReward }) | WinterBoardFailure>;
export async function buyWinterBoardItem(userId: string, itemId: string, now: Date):
  Promise<(WinterBoardView & { item: { id: string; name: string } }) | WinterBoardFailure>;
```

- `readWinterBoard`: `active`일 때만 적립한다. 무락으로 읽어 적립할 것이 있을 때만 트랜잭션에서 잠그고 다시 계산해 저장한다.
- 오류 코드와 HTTP 상태는 설계 문서 "오류" 표를 따른다.

- [ ] **Step 1:** `winterBoard.test.ts`(서버) 실패 테스트 작성. `@/db`·`savesKv`·`v2QuestContext`·`profile`·`grantTitle`·`economyLog`를 `vi.mock`으로 대체한 메모리 세이브 맵을 쓴다. 검증: 첫 `read`에서 접속 주사위 1 적립·완료 2개면 총 3, 같은 `requestId` `roll` 재요청은 저장 상태 불변이고 같은 `result`, 회복약 칸을 밟은 `roll`만 `stamina-potions.v1`을 잠금, `shop_only`에서 `roll`은 `rolling_closed`(409)이고 `buy`·`claim`은 성공, `ended`면 410, 온보딩 전이면 `no_character`, 각 보상 종류가 맞는 세이브에 들어감.
- [ ] **Step 2:** 실행해 모듈 없음 FAIL 확인.
- [ ] **Step 3:** 서비스 구현 후 라우트 구현(GET, POST `{ action: "roll", requestId, all? } | { action: "claim_milestone", laps } | { action: "buy", itemId }`, 분당 60회 제한, 성공 시 `recordEconomyEventSoon`).
- [ ] **Step 4:** 테스트 PASS.
- [ ] **Step 5:** Commit `feat: 겨울 이벤트 서버 서비스와 API`.

### Task 4: 화면과 알림

**Files:**
- Create: `src/adventure/v2/useWinterBoard.ts`, `src/adventure/v2/useWinterBoardReminder.ts`, `src/adventure/v2/V2WinterBoardView.tsx`, `src/adventure/v2/V2WinterBoardView.test.tsx`
- Modify: `src/adventure/v2/V2EventsView.tsx`(+test), `src/app/(game)/settings/events/page.tsx`, `src/adventure/v2/V2SettingsMenu.tsx`

**Interfaces:**
- Consumes: `WinterBoardView`(type import), Task 1 상수.
- Produces: `WinterBoardContent({ view, busy, lastResult, onRoll, onRollAll, onClaim, onBuy })`(표시 전용, 테스트 대상), `V2WinterBoardView()`(훅 연결), `useWinterBoardReminder(): number`(받을 것 수, 종료 뒤 0이고 요청하지 않음), `EventTab`에 `"winter"` 추가.

- [ ] **Step 1:** 실패 테스트 작성: `WinterBoardContent`가 주사위 0개면 굴리기 버튼이 비활성이고 얻는 방법 안내가 보인다, 주사위가 있으면 "주사위 굴리기"·"모두 굴리기"가 활성, 받을 수 있는 바퀴 보상에만 "받기" 버튼, 한도에 닿은 교환 품목은 비활성, `shop_only`면 굴리기 대신 종료 안내, 말판에 24칸과 현재 위치 표시(`aria-current`). `V2EventsView`는 `winterPhase`가 `ended`가 아니면 "겨울 이벤트" 탭이 첫 번째, `ended`면 탭 없음.
- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3:** 구현. 말판은 6열 격자, 짝수 줄 역순 배치. 문구는 `anti-slop-ui` 규칙을 따른다.
- [ ] **Step 4:** PASS + `bash .claude/skills/anti-slop-ui/scan.sh` + `npx vitest run src/components/ui/darkSurfaceAudit.test.ts src/components/ui/designSystemBudget.test.ts`.
- [ ] **Step 5:** Commit `feat: 겨울 이벤트 화면과 알림`.

### Task 5: 안내서와 변경 기록

**Files:** Modify `src/app/manual/content/controls.tsx`, `src/app/manual/current-content.test.tsx`; Create `docs/content-modification-records/2026-11-12-winter-dice-board.md`(기존 기록 형식)

- [ ] **Step 1:** 안내서 테스트 추가: 이벤트 절에 "겨울 이벤트", 하루 최대 5개, 종료일 문구가 엔진 상수에서 나온다.
- [ ] **Step 2:** FAIL 확인 → 안내서 작성 → PASS.
- [ ] **Step 3:** 변경 기록 작성, Commit `docs: 겨울 이벤트 안내서와 변경 기록`.

### Task 6: 전체 검증

- [ ] `npx vitest run --maxWorkers=6` 전체 통과.
- [ ] `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`, 변경 파일 `npx eslint`, `npm run check-module-budgets`, `npx knip`(CI가 쓰면) 통과.
- [ ] `next build` 뒤 로컬 운영 빌드에서 새 계정으로 적립 → 굴리기 → 모두 굴리기 → 바퀴 보상 → 교환을 화면으로 확인(390px, 라이트·다크).
