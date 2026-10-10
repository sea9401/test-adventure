# 생활 축제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주간 테마(활동 보너스), 가공품 축제 주문, 주간 순위·우편 정산, 축제 상점을 갖춘 생활 축제를 추가한다.

**Architecture:** 데이터(`data/v2/lifeFestival.ts`)와 순수 규칙(`v2/lifeFestival.ts`)을 분리한다. 서버는 개인 세이브 `life-festival.v1`(증표·회차·구매)과 DB 테이블 2개(주간 점수·정산 마커)를 쓴다. 활동 보너스는 기존 길드 식당 경험치·레벨 보너스 합산 지점에 `lifeFestivalBonus()`를 더해 연결한다.

**Tech Stack:** Next.js 16 App Router 라우트 핸들러, Drizzle(PostgreSQL), Vitest, React + Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-10-life-festival-design.md`

## Global Constraints

- 주차 ID = `kstWeekMondayKey(now)` (`@/lib/kst`). 테마 기준 월요일 `2026-01-05`, 5종 순환 `harvest → forest → vein → fishing → feast`.
- 체감 배율: 주간 n번째 납품 n=1~5 → 1.0, 6~15 → 0.5, 16+ → 0.2. 증표 `floor(base×m)`, 점수 `round(base×10×m)`.
- 묶음 `times` 1~20. 순위 보상 1위 100 / 2~3위 60 / 4~10위 30 / 11~30위 10.
- 패널·카드는 `SURFACE_CARD`/`SURFACE_INSET`만 쓴다. 반투명 배경, 컨테이너 `opacity-*`, 제목 아래 플레이버 부제를 쓰지 않는다. 사용자 문구에 "v2"를 쓰지 않는다.
- 배포·운영 데이터 수정·서버 crontab 변경을 하지 않는다. 새 이미지를 추가하지 않는다.
- `npx tsc --noEmit`은 `NODE_OPTIONS=--max-old-space-size=4096`으로 실행한다.

## Review Focus

1. 같은 사용자의 연속 납품 두 요청 → 두 번째는 차감된 재고와 증가한 회차로 다시 검증된다(Task 4 테스트 "연속 납품").
2. 주차가 바뀐 뒤 지난 주 주문 ID로 납품 → `order_not_active`, 재고·세이브 무변경(Task 4).
3. 요리 납품에서 같은 foodId를 수량보다 많이 고르거나 보유보다 많이 고름 → `invalid_food_selection`(Task 1 `validateDishSelection` 테스트).
4. 세이브가 지난 주차인 상태에서 상점의 주간 한정 구매 → 한도가 초기화된 상태로 계산(Task 1 `parseLifeFestivalState` 주차 초기화 테스트).
5. 정산을 두 번 호출 → 두 번째는 `already`, 우편 추가 없음(Task 3).

---

### Task 1: 데이터와 순수 규칙

**Files:**
- Create: `src/adventure/data/v2/lifeFestival.ts`
- Create: `src/adventure/v2/lifeFestival.ts`
- Test: `src/adventure/v2/lifeFestival.test.ts`
- Modify: `src/adventure/data/titles.ts` (칭호 3종 추가, category `"collection"`)

**Interfaces:**
- Produces (data):
  - `type LifeFestivalThemeId = "harvest" | "forest" | "vein" | "fishing" | "feast"`
  - `type LifeFestivalActivity = "farming" | "woodcutting" | "mining" | "fishing" | "cooking"`
  - `LIFE_FESTIVAL_THEMES: readonly { id; name; activity; chancePct; xpPct; effectText }[]` — 순서 고정. 수치: harvest chancePct 10(수확량%), forest 10, vein 10, fishing 2, feast 5; xpPct 모두 25.
  - `type LifeFestivalRequirement = { kind: "processed"; itemId: LifeProcessedMaterialId; quantity } | { kind: "aid"; itemId: LifeFinishedItemId; quantity } | { kind: "ranch"; itemId: RanchProductItemId; quantity } | { kind: "dish"; quantity; minTier: 1|2|3|4|5; tag?: CookingEffectTag; minQuality?: "careful" | "masterpiece" }`
  - `LIFE_FESTIVAL_ORDERS: readonly { id: string; pool: LifeFestivalThemeId | "general"; requirement: LifeFestivalRequirement; baseTokens: number }[]` — 명세 2절 표의 28건 그대로.
  - `LIFE_FESTIVAL_SHOP_ITEMS: readonly { id; name; tokenCost; weeklyLimit: number | null; output: { kind: "finished"; itemId: LifeFinishedItemId; count } | { kind: "farm"; itemId: "compound_feed"; count } | { kind: "mastery_certificate"; count: 10 } | { kind: "stamina_potion"; count: 1 } | { kind: "material"; materialId: string; count: 1 } | { kind: "title"; titleId: string } }[]` — 명세 4절 표 10건. 칭호 상품은 `weeklyLimit: null`(1회).
  - `LIFE_FESTIVAL_RANK_REWARDS: readonly { maxRank: number; tokens: number }[]` = `[{1,100},{3,60},{10,30},{30,10}]`
  - 칭호 ID: `life_festival_regular`(축제 단골), `life_festival_master`(축제 명인), `life_festival_legend`(축제의 전설)
- Produces (rules, `v2/lifeFestival.ts`):
  - `LIFE_FESTIVAL_SAVE_KEY = "life-festival.v1"`
  - `type LifeFestivalState` (명세 5절 그대로)
  - `parseLifeFestivalState(raw: unknown, weekId: string): LifeFestivalState` — weekId가 다르면 `deliveries`·`weeklyPurchases`를 비우고 `tokens`·`tokensEarnedTotal`·`ownedOnceItemIds`는 유지.
  - `lifeFestivalThemeForWeek(weekId: string): LifeFestivalTheme`
  - `lifeFestivalOrdersForWeek(weekId: string): LifeFestivalOrder[]` — 테마 풀 3건 + 일반 풀 3건. 시드는 weekId 문자열 해시(FNV-1a 32bit)로 만든 결정적 셔플. 일반 풀에서는 이번 주 테마 주문과 `requirement`가 같은(JSON 비교) 항목을 제외한다.
  - `lifeFestivalMultiplier(nth: number): 1 | 0.5 | 0.2`
  - `lifeFestivalDeliveryReward(baseTokens: number, alreadyDelivered: number, times: number): { tokens: number; score: number }` — 회차마다 배율을 따로 적용해 합산.
  - `dishMatchesRequirement(food: CookingFoodDefinition, req: Extract<LifeFestivalRequirement, {kind:"dish"}>): boolean` — 품질 순서 normal < careful < masterpiece.
  - `validateDishSelection(selection: Record<string, number>, inventory: CookingFoodInventory, req, times: number): { ok: true } | { ok: false }` — 합계가 `req.quantity × times`와 정확히 같고, 각 foodId 보유량 이하이며, 모두 요건 충족.
  - `buyLifeFestivalShopItem(state: LifeFestivalState, itemId: string): { state: LifeFestivalState; item } | { error: "unknown_item" | "not_enough_tokens" | "weekly_limit" | "already_owned" }`
  - `grantLifeFestivalTokens(state: LifeFestivalState, tokens: number): LifeFestivalState` — `tokens`와 `tokensEarnedTotal`에 더한다.
  - `lifeFestivalBonus(activity: LifeFestivalActivity, now: Date): { themeId: LifeFestivalThemeId | null; chancePct: number; xpPct: number }` — 이번 주 테마 대상이 아니면 `{ themeId: null, chancePct: 0, xpPct: 0 }`.
  - `lifeFestivalBonusXp(baseXp: number, xpPct: number): number` = `Math.floor(baseXp × xpPct / 100)`.

- [ ] **Step 1: 실패하는 테스트 작성** — `lifeFestival.test.ts`:
  - `lifeFestivalThemeForWeek("2026-01-05").id === "harvest"`, `"2026-01-12"` → `"forest"`, `"2026-02-02"`(4주 뒤) → `"feast"`, `"2026-02-09"` → `"harvest"`.
  - `lifeFestivalOrdersForWeek("2026-10-12")`: 길이 6, 같은 입력 두 번 호출 시 ID 배열 동일, 앞 3건 `pool === 테마 id`, 뒤 3건 `pool === "general"`, requirement 중복 없음. 52주를 돌려 모든 주에서 중복 없음.
  - `lifeFestivalDeliveryReward(6, 0, 1)` → `{ tokens: 6, score: 60 }`; `(6, 4, 2)` → 5회차 1.0 + 6회차 0.5 → `{ tokens: 6 + 3, score: 60 + 30 }`; `(4, 15, 1)` → 0.2 → `{ tokens: 0, score: 8 }`.
  - `parseLifeFestivalState({ weekId: "2026-10-05", tokens: 50, deliveries: { a: 3 }, weeklyPurchases: { feed_bundle: 5 }, ownedOnceItemIds: ["title_regular"] }, "2026-10-12")` → tokens 50, deliveries `{}`, weeklyPurchases `{}`, ownedOnceItemIds 유지. 음수·소수·문자열 입력은 0 이상 정수로 정리.
  - `validateDishSelection`: 수량 합 부족/초과, 보유 초과, 등급 미달, 태그 불일치, 품질 미달 각각 `{ ok: false }`; 정확한 선택은 `{ ok: true }`.
  - `buyLifeFestivalShopItem`: 증표 부족 → `not_enough_tokens`; `feed_bundle` 6번째 → `weekly_limit`; `title_regular` 두 번째 → `already_owned`; 성공 시 tokens 차감·weeklyPurchases 증가.
  - `lifeFestivalBonus("farming", new Date("2026-01-05T00:00:00+09:00"))` → `{ themeId: "harvest", chancePct: 10, xpPct: 25 }`; 같은 주 `"mining"` → 0 보너스. 일요일 23:59:59 KST와 월요일 00:00 KST 경계에서 테마가 바뀐다.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/lifeFestival.test.ts` → 모듈 없음으로 FAIL
- [ ] **Step 3: 데이터·규칙·칭호 구현**
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: 커밋** — `feat: 생활 축제 데이터와 주간 규칙`

---

### Task 2: 활동 보너스 연결

**Files:**
- Modify: `src/adventure/v2/farm.ts` — `FarmHarvestOptions`에 `xpBonusPct?: number` 추가, `harvestPlot`에서 `farmingXpGained + lifeFestivalBonusXp(farmingXpGained, xpBonusPct)`를 적용.
- Modify: `src/app/api/v2/farm/harvest/route.ts` — `harvestPlot` 호출 옵션에 `yieldBonusPct += bonus.chancePct`, `xpBonusPct: bonus.xpPct`(`bonus = lifeFestivalBonus("farming", now)`).
- Modify: `src/app/api/v2/woodcutting/start/route.ts`, `woodcutting/auto/route.ts` — `bonusLogChancePct` 합산에 `lifeFestivalBonus("woodcutting", now).chancePct` 추가(자동 채집은 정산 시작 시점 `now`).
- Modify: `src/app/api/v2/woodcutting/chop/route.ts`, `woodcutting/auto/route.ts` — `xpGained` 합에 `lifeFestivalBonusXp(tree.xp, bonus.xpPct)` 추가(자동은 `settlement.xpGained`의 기본분 기준, `diningXp.bonus`와 같은 위치).
- Modify: `src/app/api/v2/mining/start|auto|strike/route.ts` — 벌목과 같은 방식(`bonusOreChancePct`, 광석 xp).
- Modify: `src/app/api/v2/fishing/cast/route.ts` — `specialWeightPct` 합산에 `lifeFestivalBonus("fishing", now).chancePct` 추가.
- Modify: `src/app/api/v2/fishing/reel/route.ts` — `addFishingCatchXp`의 `bonusXp`에 `lifeFestivalBonusXp(fishingXpForCatch(fishId), bonus.xpPct)` 추가.
- Modify: `src/app/api/v2/cooking/route.ts:459` — `masterpieceChancePct`에 `bonus.chancePct`, `:481` 경험치 % 합에 `bonus.xpPct` 추가(`bonus = lifeFestivalBonus("cooking", now)`).
- Test: `src/adventure/v2/farm.test.ts`, 활동별 기존 라우트 테스트 파일(존재하는 것만: `rg -l "woodcutting/chop/route|mining/strike/route|fishing/cast/route|cooking/route" src --glob "*.test.ts"`)

**Interfaces:**
- Consumes: `lifeFestivalBonus`, `lifeFestivalBonusXp` (Task 1)

- [ ] **Step 1: 실패하는 테스트 작성**
  - `farm.test.ts`: `harvestPlot(state, id, now, () => 0, { xpBonusPct: 25 })`의 `farmingXp` 증가분이 옵션 없을 때의 `floor(×1.25)`와 같다.
  - 각 활동 라우트 테스트(있는 파일): `vi.setSystemTime`으로 해당 테마 주와 다른 테마 주를 각각 설정하고, 응답 `xpGained`가 테마 주에만 `floor(base×0.25)` 더 크다. 시작형 라우트는 저장된 세션의 보너스 확률 필드가 테마 주에만 +10(낚시 +2, 요리 걸작은 롤 함수 입력)인지 확인한다.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/farm.test.ts <해당 라우트 테스트들>`
- [ ] **Step 3: 연결 구현**
- [ ] **Step 4: 통과 확인** — 같은 명령 + `npx vitest run src/app/api/v2/{farm,woodcutting,mining,fishing,cooking}` 전체 PASS
- [ ] **Step 5: 커밋** — `feat: 생활 축제 주간 테마 보너스를 활동에 연결`

---

### Task 3: 점수 테이블·정산·우편 수령

**Files:**
- Modify: `src/db/schema.ts` — 테이블 2개 추가(낚시 시즌 테이블 근처)
  - `lifeFestivalScores = pgTable("life_festival_scores", { userId text FK users cascade, weekId text, score integer default 0, deliveries integer default 0, updatedAt timestamp defaultNow })`, PK(userId, weekId), index `life_festival_scores_rank_idx` on (weekId, score DESC).
  - `lifeFestivalWeeks = pgTable("life_festival_weeks", { id text PK, rewardsGrantedAt timestamp, winners integer default 0, totalTokens integer default 0 })`
- Create: `drizzle/NNNN_*.sql` + meta — `npm run db:generate`로 생성(수작업 금지)
- Create: `src/lib/server/lifeFestival/scores.ts`
- Create: `src/lib/server/lifeFestival/settlement.ts`
- Modify: `src/lib/server/inboxPayload.ts:40-41` — `SeasonRewardSeason`과 집합에 `"life_festival"` 추가
- Modify: `src/app/api/marketplace/inbox/claim/route.ts:186,788-` — `coinsBySeason`에 `life_festival: 0`. 지갑 루프는 `["pvp","fishing"]` 그대로 두고, 그 뒤에 `life_festival > 0`이면 `LIFE_FESTIVAL_SAVE_KEY`를 잠가 `grantLifeFestivalTokens(parseLifeFestivalState(raw, kstWeekMondayKey(now)), n)`을 저장한다. 응답 `coinsAdded`에 `{ season: "life_festival", coins: n }`을 넣는다.
- Modify: `src/app/api/cron/fishing-season-rewards/route.ts` — 낚시 정산 뒤 `grantPendingLifeFestivalRewards(now)` 호출, 응답에 `lifeFestival` 필드 추가.
- Modify: `src/app/api/admin/season-ops/route.ts` — op `"life-festival-rewards"` 추가(낚시 케이스와 같은 형태). op 허용 목록이 있으면 함께 추가.
- Test: `src/lib/server/lifeFestival/settlement.test.ts`, `src/lib/server/inboxClaimSeasonReward.test.ts`(기존 파일에 케이스 추가)

**Interfaces:**
- Produces:
  - `addLifeFestivalScore(tx: DbExecutor, args: { userId: string; weekId: string; score: number; deliveries: number }): Promise<void>` — insert … on conflict (userId, weekId) do update `score = score + excluded.score, deliveries = deliveries + excluded.deliveries, updatedAt = now()`.
  - `readLifeFestivalRanking(executor, weekId: string, viewerId: string, now: Date): Promise<{ top: { rank: number; userId: string; name: string; score: number }[]; me: { rank: number; score: number } | null }>` — 상위 30, 정지 계정은 `filterRankingEligibleRows`로 제외, 동점은 `updatedAt` 오름차순. 이름은 기존 순위 화면과 같은 출처(낚시 리더보드 조회 코드의 이름 조인)를 쓴다.
  - `lifeFestivalRankTokens(rank: number): number` (순수, `LIFE_FESTIVAL_RANK_REWARDS` 사용)
  - `grantLifeFestivalWeekRewards(weekId: string, now: Date): Promise<{ kind: "ok"; weekId; winners; total } | { kind: "already"; weekId }>` — `fishing/seasonRewards.ts`의 `grantFishingSeasonRewards`와 같은 구조(행 확보 → FOR UPDATE → 마커 확인 → 우편 `season_reward`·`season: "life_festival"`·`coins: tokens`, 메시지 `생활 축제 주간 순위 보상 (${rank}위 · 증표 ${tokens}개)` → 마킹). 우편은 userId 정렬 순서로 넣는다.
  - `grantPendingLifeFestivalRewards(now: Date): Promise<{ results: ... }>` — 현재 주가 아니고 미정산인 weekId만.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `lifeFestivalRankTokens`: 1→100, 2→60, 3→60, 4→30, 10→30, 11→10, 30→10, 31→0.
  - settlement(낚시 정산 테스트와 같은 db 모킹 방식): 점수 행 35개 → 우편 30건, 총 증표 = 100+60×2+30×7+10×20; 정지 계정은 순위에서 빠지고 다음 사람이 올라감; 이미 `rewardsGrantedAt`이 있으면 `already`이고 우편 0건; 현재 주는 대상에서 빠짐.
  - 우편 수령: `season_reward`/`life_festival`/`coins: 30` 우편 수령 후 `life-festival.v1.tokens`가 30 늘고 낚시·PvP 지갑은 그대로다.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/server/lifeFestival src/lib/server/inboxClaimSeasonReward.test.ts`
- [ ] **Step 3: 스키마·마이그레이션·모듈·연결 구현** — `npm run db:generate` 후 생성 SQL에 테이블 2개와 인덱스만 있는지 확인한다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS + `npx vitest run src/db/migrationJournal.test.ts`
- [ ] **Step 5: 커밋** — `feat: 생활 축제 주간 점수와 순위 정산`

---

### Task 4: 축제 API

**Files:**
- Create: `src/app/api/v2/life-festival/route.ts` — `GET`(현황), `POST { action: "deliver" | "buy" }`
- Create: `src/app/api/v2/life-festival/ranking/route.ts` — `GET ?week=current|previous`
- Create: `src/lib/server/lifeFestival/inventory.ts` — 품목 종류별 보유량 조회·차감(세이브 잠금 포함)
- Test: `src/lib/server/lifeFestivalRoute.test.ts` (`farmEndgameShopRoute.test.ts`의 세이브 Map 모킹 패턴, `scores.ts`는 `vi.mock`)

**Interfaces:**
- Consumes: Task 1 규칙 전부, `addLifeFestivalScore`·`readLifeFestivalRanking`(Task 3), `lockLifeActivityUserForUpdate`, `lockSaveForUpdate`/`readSave`/`upsertSave`, `ensureUser`, `enforceUserAndIpRateLimit`(action `"v2:life-festival"`, user 40/ip 200/60초), `grantTitleIfMissingInTx`, `grantStaminaPotions`.
- Produces (응답 JSON — Task 5가 사용):
  - `GET` → `{ ok: true, weekId, endsAt: string(ISO, 다음 월요일 00:00 KST), theme: { id, name, activity, effectText }, tokens, weeklyScore, myRank: number | null, orders: { id, pool, requirement, label, baseTokens, delivered, nextMultiplier, held: number }[], shop: { id, name, tokenCost, weeklyLimit, purchased, owned }[], dishOptions: Record<orderId, { foodId, name, tier, quality, count }[]> }`
  - `POST deliver { orderId, times, foodIds?: Record<string, number> }` → `{ ok: true, gained: { tokens, score }, view }` (view는 GET과 같은 모양)
  - `POST buy { itemId }` → `{ ok: true, item: { id, name }, view }`
  - 거절 → `{ ok: false, error }` status 409(조건) 또는 400(형식). error 코드는 명세 7절 목록.
- `inventory.ts`:
  - `heldLifeFestivalItems(saves: { character; workshop; farm; inventory }, req): number` (순수)
  - `consumeLifeFestivalRequirement(tx, userId, req, times, foodIds?): Promise<{ ok: true } | { ok: false; error: "not_enough_items" | "invalid_food_selection" }>` — 종류별 세이브를 잠그고 차감·저장한다(processed → `character.v2.materials`, aid → `LIFE_WORKSHOP_SAVE_KEY.crafting.balances`, ranch → `FARM_SAVE_KEY.inventory`, dish → `inventory.v2.cookingFoods`). 0이 된 키는 삭제한다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - GET: 빈 세이브로 주문 6건·테마·상점 10건·tokens 0을 반환한다.
  - deliver 성공: 기초 금속괴 주문, materials 10개 보유, `times: 2` → 재료 0, 축제 세이브 deliveries 2, tokens `+8`(base 4), `addLifeFestivalScore`가 score 80, deliveries 2로 호출된다.
  - 연속 납품: 보유 5개로 `times: 1`을 두 번 → 두 번째는 `not_enough_items`, 세이브 변화 없음.
  - 지난 주 주문 ID → `order_not_active`, `upsertSave` 호출 0회.
  - `times` 0·21·문자열 → 400 `invalid_times`.
  - 요리 주문: 요건에 맞지 않는 foodId 포함 → `invalid_food_selection`; 정확한 선택 → cookingFoods 차감.
  - ranking: `readLifeFestivalRanking`을 모킹하고 `?week=previous`면 지난 월요일 weekId로, 값이 없거나 `current`면 이번 weekId로 호출한다. 잘못된 값은 400 `invalid_week`.
  - buy: `mithril_shard` 성공 시 `character.v2.materials[미스릴 조각 ID]` +1·tokens −80; `title_regular`는 칭호 지급 + `ownedOnceItemIds`; 증표 부족·주간 한도는 409이고 세이브 무변경.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/server/lifeFestivalRoute.test.ts`
- [ ] **Step 3: 라우트·인벤토리 모듈 구현** — 트랜잭션 순서는 사용자 행 잠금 → 축제 세이브 → 품목 세이브(명세 2절 서버 처리).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: 커밋** — `feat: 생활 축제 주문 납품·상점 API`

---

### Task 5: 화면·진입점·축제 표시

**Files:**
- Create: `src/adventure/v2/LifeFestivalView.tsx` — 명세 6절 구성 순서. `PageShell` + `SubViewHeader`(뒤로 `/map`), 표면 토큰만 사용. 요리 주문은 선택 창(기존 `LifeWorkshopView` 모달 패턴: `SURFACE_CARD ui-modal-panel`).
- Create: `src/adventure/v2/LifeFestivalBadge.tsx` — props `{ activity: LifeFestivalActivity; now?: Date }`. 테마 주에만 `SURFACE_INSET` 한 줄 "축제 진행 중 · {name}: {effectText}" + `/town/festival` 링크, 아니면 `null`.
- Create: `src/app/(game)/town/festival/page.tsx`
- Modify: `src/adventure/v2/MainTabNav.tsx:136-147` — `LIFE_MENU_ITEMS`에 `{ label: "생활 축제", href: "/town/festival", Icon: Confetti, color: "text-rose-500" }`(주방 다음)
- Modify: `src/adventure/v2/gameTabForPath.ts:10-17` — `"/town/festival"` 추가
- Modify: 활동 화면 상단에 `LifeFestivalBadge` 삽입 — 농장(`AdventurerFarmPanel.tsx` 또는 농장 뷰 최상위), 벌목(`WoodcuttingView.tsx`), 채광 뷰, 낚시(`FishingView.tsx`), 주방(`CookingPanel.tsx`)
- Test: `src/adventure/v2/LifeFestivalView.test.tsx`, `LifeFestivalBadge.test.tsx`, `gameTabForPath.test.ts`·`MainTabNav.test.ts`(기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: Task 4 응답 JSON, `lifeFestivalBonus`·`LIFE_FESTIVAL_THEMES`(Task 1)

- [ ] **Step 1: 실패하는 테스트 작성**
  - View(`fetch` 모킹): 테마 이름·효과·주문 6건 렌더; 보유 부족 주문의 납품 버튼 disabled; `delivered: 5`인 주문에 "다음 납품 보상 50%" 표시; 상점의 한도 도달 상품 버튼 disabled + "이번 주 구매 완료"; 납품 성공 시 응답 view로 갱신하고 "증표 +N" 표시; 오류 코드 `not_enough_items` → "재료가 부족합니다".
  - 순위 섹션: 처음엔 `ranking?week=current`를 부르고, "지난 주" 버튼을 누르면 `ranking?week=previous`를 불러 상위 목록을 바꾼다. 내 순위가 30위 밖이면 목록 아래 "내 순위 N위"를 표시한다.
  - View 컨테이너와 카드 className에 `SURFACE_CARD`/`SURFACE_INSET` 문자열이 들어 있고 `/40`, `/70` 같은 알파 배경이 없다.
  - Badge: 테마 주 → 문구와 링크, 다른 주 → 렌더 없음.
  - `gameTabForPath("/town/festival") === "life"`; `LIFE_MENU_ITEMS`에 `/town/festival` 포함.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/LifeFestival src/adventure/v2/gameTabForPath.test.ts src/adventure/v2/MainTabNav.test.ts`
- [ ] **Step 3: 화면 구현** — anti-slop-ui 스킬 기준으로 검수(장식 그라데이션·이모지 남용 금지).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS + 수정한 활동 화면들의 기존 테스트 PASS
- [ ] **Step 5: 커밋** — `feat: 생활 축제 화면과 활동별 축제 표시`

---

### Task 6: 매뉴얼과 전체 검증

**Files:**
- Modify: `src/app/manual/content/pastimes.tsx` — "생활 콘텐츠 한눈에 보기" 다음에 `<H2>생활 축제</H2>` 섹션: 주간 테마 표(데이터 상수에서 생성), 축제 주문과 체감 규칙, 주간 순위 보상, 상점 안내. 수치는 상수에서 읽는다.
- Test: `src/app/manual/current-content.test.tsx` 또는 `sections.test.ts`(기존 패턴에 맞춰 "생활 축제" 문구 존재 확인)

- [ ] **Step 1: 매뉴얼 테스트 케이스 추가 후 실패 확인**
- [ ] **Step 2: 매뉴얼 섹션 작성 후 통과 확인**
- [ ] **Step 3: 전체 검증**
  - `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` → 오류 0
  - `npx vitest run` → 실패 0
  - `npm run lint` → 오류 0
  - `npm run check-images` → 실패 0
- [ ] **Step 4: 커밋** — `docs: 매뉴얼에 생활 축제 안내 추가`
