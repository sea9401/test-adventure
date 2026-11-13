# 농장 품종 개량 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 작물 11종마다 품종 단계를 두고, 일반·희귀 작물을 써서 그 작물의 희귀 수확 확률을 올리는 농장 내부 성장 장치를 만든다.

**Architecture:** 단계별 상수는 의존성 없는 `farmBreedingRules.ts`에, 개량 판정과 적용은 `farmBreeding.ts`에 둔다. 단계는 `farm.v2` 세이브의 선택 필드에 저장하고 `harvestPlot`이 읽어 희귀 확률에 더한다. 개량 요청은 새 API 하나로 받고, 농장 화면에 "품종" 탭을 추가한다.

**Tech Stack:** Next.js App Router(이 저장소의 변경된 판, 라우트는 기존 `src/app/api/v2/farm/*` 형식을 그대로 따른다), TypeScript, vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-13-farm-breeding-design.md`

## Global Constraints

- 단계는 0~6. 1~5단계는 누구나, 6단계는 `lifeMajorCanCraft(state, "farming")`(농사 주전공 명장 3단계 이상)일 때만.
- 희귀 수확 확률 보너스: 1~5단계는 단계당 +2%p, 6단계는 총 +13%p. 기존 상한 0.75와 20회 보장은 그대로.
- 비용: 수확 횟수분 10·25·60·120·200·300, 희귀 작물 2·5·10·18·30·40, 6단계만 명장 작물(`v2_master_crop`) 3. 일반 작물 수량은 `Math.round(횟수분 × (yieldMin + yieldMax) / 2 / 5) × 5`.
- 골드·농장 증표 비용 없음. 작물 심기 스킬 검사 없음.
- 마이그레이션 없음. `FarmState.breeding`은 선택 필드이고 없으면 전부 0단계.
- 잠금 순서: `character.v2` → `farm.v2`. `life-major.v1`은 잠그지 않고 읽는다.
- 화면 표면은 `src/components/ui/surfaces.ts`의 `SURFACE_CARD`·`SURFACE_INSET`만 쓴다. 카드 전체 `opacity-*` 금지, 버튼의 `disabled:opacity-*`는 허용.
- 플레이어 노출 문구는 "농장 증표", "희귀 수확"처럼 기존 용어를 쓰고 마크다운·대시를 쓰지 않는다.
- 클라이언트 컴포넌트에서 `@/adventure/v2/lifeMajor`를 값으로 import하지 않는다(서버 전용 요리 카탈로그를 끌고 온다).

## Review Focus

- 품종 필드가 없는 기존 세이브로 수확하면 결과가 이전과 완전히 같아야 한다 → Task 1 테스트.
- 세이브의 `breeding`에 모르는 작물 id, 음수, 7 이상, 소수가 들어 있어도 파서가 0~6 정수로 정리해야 한다 → Task 1 테스트.
- 5단계에서 주전공이 아닌 사람이 개량을 누르면 작물이 차감되지 않고 `breeding_master_locked`가 나와야 한다 → Task 2·3 테스트.
- 6단계 개량에서 명장 작물이 모자라면 `farm.v2`와 `character.v2` 어느 쪽도 저장되지 않아야 한다 → Task 3 테스트.
- 이미 가진 칭호 조건을 다시 채워도 결과에 칭호가 다시 실리지 않아야 한다 → Task 3 테스트.

---

### Task 1: 규칙 모듈, 세이브 필드, 수확 반영

**Files:**
- Create: `src/adventure/v2/farmBreedingRules.ts`
- Create: `src/adventure/v2/farmBreedingRules.test.ts`
- Modify: `src/adventure/v2/farm.ts` (`FarmState`, 파서, `harvestPlot`의 `rareChance`)
- Test: `src/adventure/v2/farm.test.ts`

**Interfaces:**
- Produces:
  - `FARM_BREEDING_BASE_MAX_STAGE = 5`, `FARM_BREEDING_MASTER_STAGE = 6`
  - `type FarmBreedingStageCost = { harvests: number; rare: number; masterCrop: number }`
  - `FARM_BREEDING_STAGE_COSTS: readonly FarmBreedingStageCost[]` (인덱스 = 목표 단계 − 1, 길이 6)
  - `normalizeFarmBreedingStage(raw: unknown): number` (0~6 정수, 그 밖은 0 또는 6으로 자름, 숫자가 아니면 0)
  - `farmBreedingRareChancePct(stage: number): number`
  - `FarmState.breeding?: Partial<Record<FarmCropId, number>>`

- [ ] **Step 1: 규칙 테스트 작성**

```ts
it("단계별 희귀 수확 보너스", () => {
  expect([0, 1, 2, 3, 4, 5, 6].map(farmBreedingRareChancePct)).toEqual([0, 2, 4, 6, 8, 10, 13]);
});
it("범위 밖 단계를 정리한다", () => {
  expect(normalizeFarmBreedingStage(-1)).toBe(0);
  expect(normalizeFarmBreedingStage(2.9)).toBe(2);
  expect(normalizeFarmBreedingStage(9)).toBe(6);
  expect(normalizeFarmBreedingStage("3")).toBe(0);
  expect(farmBreedingRareChancePct(99)).toBe(13);
});
it("단계별 비용 표", () => {
  expect(FARM_BREEDING_STAGE_COSTS).toEqual([
    { harvests: 10, rare: 2, masterCrop: 0 },
    { harvests: 25, rare: 5, masterCrop: 0 },
    { harvests: 60, rare: 10, masterCrop: 0 },
    { harvests: 120, rare: 18, masterCrop: 0 },
    { harvests: 200, rare: 30, masterCrop: 0 },
    { harvests: 300, rare: 40, masterCrop: 3 },
  ]);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/farmBreedingRules.test.ts` → 모듈 없음으로 FAIL.
- [ ] **Step 3: `farmBreedingRules.ts` 구현** — import 없는 순수 모듈.
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: `farm.test.ts`에 세이브·수확 테스트 추가**

```ts
it("품종 단계를 파싱하고 잘못된 값을 버린다", () => {
  const parsed = parseFarmState({ ...emptyFarmState(NOW), breeding: { wheat: 3, herb: 9, corn: -2, tomato: 1.7, dragonfruit: 4 } }, NOW);
  expect(parsed.breeding).toEqual({ wheat: 3, herb: 6, tomato: 1 });
});
it("품종 필드가 없으면 수확 결과가 이전과 같다", () => {
  // 같은 난수열로 breeding 없는 상태와 breeding: {} 상태를 수확해 state·result 가 같은지 본다.
});
it("품종 단계만큼 희귀 수확 확률이 오른다", () => {
  // 밀(rareChance 0.05), 레벨 1, 보장 없음. 희귀 판정 난수 0.10.
  // breeding 없음 → rareItemId null, breeding { wheat: 3 }(0.05 + 0.06) → "golden_wheat".
});
```

난수 순서는 `harvestPlot` 본문 그대로다: 첫 호출이 수확량, 두 번째가 희귀 판정(보장이 아니면), 세 번째가 씨앗 반환.

- [ ] **Step 6: 실패 확인** — `npx vitest run src/adventure/v2/farm.test.ts`
- [ ] **Step 7: `farm.ts` 수정** — `FarmState`에 `breeding?` 추가. 파서가 `isFarmCropId`인 키만 `normalizeFarmBreedingStage`로 정리해 0보다 큰 값만 남기고, 남은 것이 없으면 필드를 넣지 않는다. `harvestPlot`의 `rareChance` 합에 `farmBreedingRareChancePct(state.breeding?.[crop.id] ?? 0)`를 더한다.
- [ ] **Step 8: 통과 확인** — 위 두 파일과 `src/lib/server/farmHarvestRoute.test.ts`.
- [ ] **Step 9: 커밋** — `feat: 농장 품종 단계 저장과 희귀 수확 반영`

### Task 2: 개량 판정과 적용, 칭호

**Files:**
- Create: `src/adventure/v2/farmBreeding.ts`
- Create: `src/adventure/v2/farmBreeding.test.ts`
- Modify: `src/adventure/data/titles.ts`
- Modify: `src/adventure/v2/lifeMajorProducts.ts` (명장 작물 설명)

**Interfaces:**
- Consumes: Task 1의 규칙 모듈, `farm.ts`의 `FARM_CROPS`, `FARM_CROP_LIST`, `FarmError`, `FarmState`, `FarmCropId`, `FarmItemId`.
- Produces:
  - `titles.ts`: `FARM_BREEDER_TITLE_ID = "farm_breeder"`(육종가), `FARM_BREED_MASTER_TITLE_ID = "farm_breed_master"`(품종의 대가). 둘 다 `category: "collection"`.
  - `FARM_BREEDING_TITLE_TOTAL_STAGE = 22`
  - `type FarmBreedingCost = { cropItemId: FarmItemId; crops: number; rareItemId: FarmItemId; rare: number; masterCrop: number }`
  - `type FarmBreedingContext = { masterUnlocked: boolean; masterCropHeld: number }`
  - `type FarmBreedingBlockReason = "breeding_max" | "breeding_master_locked" | "not_enough_crops" | "not_enough_rare_crops" | "not_enough_master_crop"`
  - `type FarmBreedingResult = { cropId: FarmCropId; cropName: string; stage: number; rareChancePct: number; cost: FarmBreedingCost; grantedTitleIds: string[] }`
  - `farmBreedingStage(state: FarmState, cropId: FarmCropId): number`
  - `farmBreedingCost(cropId: FarmCropId, targetStage: number): FarmBreedingCost | null` (1~6 밖이면 null)
  - `farmBreedingBlockReason(state: FarmState, cropId: FarmCropId, context: FarmBreedingContext): FarmBreedingBlockReason | null` — 판정 순서: 최고 단계 → 명장 잠금 → 일반 작물 → 희귀 작물 → 명장 작물
  - `breedFarmCrop(state: FarmState, cropId: FarmCropId, context: FarmBreedingContext): { state: FarmState; result: FarmBreedingResult }` — 막히면 `new FarmError(사유)`를 던진다. `grantedTitleIds`는 빈 배열로 두고 라우트가 채운다. 명장 작물 차감은 하지 않는다(라우트가 `character.v2`에서 한다).
  - `farmBreedingTotalStage(state: FarmState): number`
  - `farmBreedingEarnedTitleIds(state: FarmState): string[]` — 합계 22 이상이면 육종가, 11종 모두 5단계 이상이면 품종의 대가.

- [ ] **Step 1: 테스트 작성**

```ts
it("작물별 일반 작물 비용", () => {
  const crops = (id: FarmCropId) => [1, 2, 3, 4, 5, 6].map((stage) => farmBreedingCost(id, stage)!.crops);
  expect(crops("wheat")).toEqual([40, 100, 240, 480, 800, 1200]);
  expect(crops("herb")).toEqual([30, 75, 180, 360, 600, 900]);
  expect(crops("corn")).toEqual([65, 165, 390, 780, 1300, 1950]);
  expect(crops("potato")).toEqual([55, 140, 330, 660, 1100, 1650]);
  expect(crops("onion")).toEqual([45, 115, 270, 540, 900, 1350]);
  expect(crops("sugarcane")).toEqual([50, 125, 300, 600, 1000, 1500]);
  expect(farmBreedingCost("wheat", 6)).toMatchObject({ rare: 40, masterCrop: 3, rareItemId: "golden_wheat" });
  expect(farmBreedingCost("wheat", 7)).toBeNull();
});
```

그리고 다음 경우를 각각 테스트한다: 막힘 사유 5종(판정 순서 포함: 5단계·비전공·작물 0개이면 `breeding_master_locked`), 개량 성공 시 일반·희귀 작물 차감과 단계 +1과 `rareChancePct`, 재고가 딱 0이 되면 인벤토리 키 제거 여부는 기존 `spendFarmItems` 동작을 따른다, 막혔을 때 `FarmError.code`, 합계 계산, 칭호 조건(합계 21 → 없음, 22 → 육종가, 11종 5단계 → 둘 다, 10종 6단계 + 1종 4단계 → 육종가만).

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/farmBreeding.test.ts`
- [ ] **Step 3: 구현** — 차감은 `farm.ts`의 `spendFarmItems`를 쓴다. 칭호 설명: 육종가 "여러 작물의 품종을 꾸준히 가려 뽑은 농부." / 조건 "품종 단계 합계 22 달성", 품종의 대가 "밭의 모든 작물을 가장 좋은 품종으로 길러 낸 농부." / 조건 "모든 작물 품종 5단계 달성". 명장 작물 설명은 "농사 명장만 거둘 수 있는 최상급 작물. 명장 요리와 명장 품종 개량의 재료가 된다."
- [ ] **Step 4: 통과 확인** — 위 테스트와 `npx vitest run src/adventure/data` (칭호 개수를 고정한 테스트가 있으면 날짜 주석과 함께 갱신).
- [ ] **Step 5: 커밋** — `feat: 농장 품종 개량 판정과 칭호`

### Task 3: 개량 API

**Files:**
- Create: `src/app/api/v2/farm/breed/route.ts`
- Create: `src/lib/server/farmBreedRoute.test.ts`
- Modify: `src/app/api/v2/farm/route.ts`

**Interfaces:**
- Consumes: Task 2의 `breedFarmCrop`, `farmBreedingEarnedTitleIds`, `FarmBreedingResult`; `lifeMajorCanCraft`, `parseLifeMajorState`, `LIFE_MAJOR_SAVE_KEY`, `LIFE_MAJOR_PRODUCT_ID.farming`; `grantTitleIfMissingInTx`.
- Produces:
  - `POST /api/v2/farm/breed` `{ cropId }` → 200 `{ ok, now, farm, crops, deliveries, specialDeliveries, weeklyDeliveries, shopItems, breeding: { masterUnlocked, masterCropHeld }, breedResult: FarmBreedingResult }`. 잘못된 `cropId`는 400 `bad_request`, 막힘 사유는 409.
  - `GET /api/v2/farm` 응답에 `breeding: { masterUnlocked: boolean; masterCropHeld: number }` 추가.

- [ ] **Step 1: 라우트 테스트 작성** — `src/lib/server/farmEndgameShopRoute.test.ts`의 mock 구성(`ensureUser`, `farmingRateLimit`, `db`, `savesKv`, `grantTitle`)을 그대로 따른다. 경우:
  - 밀 0 → 1단계 성공: 응답 `breedResult.stage === 1`, 저장된 `farm.v2`의 `inventory.wheat`·`golden_wheat` 차감, `breeding.wheat === 1`.
  - 일반 작물 부족 → 409 `not_enough_crops`, `upsertSave` 호출 없음.
  - 5단계·비전공 → 409 `breeding_master_locked`, `upsertSave` 호출 없음.
  - 5단계·농사 주전공 명장 3단계·명장 작물 2개 → 409 `not_enough_master_crop`, `upsertSave` 호출 없음.
  - 같은 조건에 명장 작물 3개 → 200, `character.v2.materials.v2_master_crop` 키가 사라지고 `breeding.wheat === 6`.
  - 합계 21에서 22가 되는 개량 → `breedResult.grantedTitleIds`가 `["farm_breeder"]`. 이미 가진 상태로 한 번 더 올리면 `[]`.
  - `cropId: "dragonfruit"` → 400.
  - GET: 명장 작물 5개·농사 주전공 명장 3단계면 `breeding`이 `{ masterUnlocked: true, masterCropHeld: 5 }`, 세이브가 없으면 `{ masterUnlocked: false, masterCropHeld: 0 }`.

  명장 3단계 세이브는 `{ major: "farming", masteryXp: { farming: lifeMajorStageXp("farming", 3) } }`로 만든다.

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/server/farmBreedRoute.test.ts`
- [ ] **Step 3: 라우트 구현** — `plot-upgrade/route.ts`의 형식(인증, `enforceFarmingRateLimit`, 트랜잭션, `FarmError` → 409)을 따른다. 트랜잭션 안에서 `character.v2` 잠금 → `farm.v2` 잠금·정규화 → `life-major.v1` 읽기 → `breedFarmCrop` → 6단계면 명장 작물 차감 후 `character.v2` 저장 → `farm.v2` 저장 → 칭호 지급. `character.v2`는 6단계일 때만 저장한다.
- [ ] **Step 4: GET 수정** — `character.v2`와 `life-major.v1`을 함께 읽어 `breeding`을 싣는다.
- [ ] **Step 5: 통과 확인** — 위 테스트와 `src/lib/server/farmEndgameShopRoute.test.ts`.
- [ ] **Step 6: 커밋** — `feat: 농장 품종 개량 API`

### Task 4: 화면

**Files:**
- Create: `src/adventure/v2/FarmBreedingPanel.tsx`
- Create: `src/adventure/v2/FarmBreedingPanel.test.tsx`
- Modify: `src/adventure/v2/useFarm.ts`
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx`

**Interfaces:**
- Consumes: Task 2의 `farmBreedingStage`, `farmBreedingCost`, `farmBreedingBlockReason`, `farmBreedingTotalStage`, `FarmBreedingResult`; Task 3의 응답 필드.
- Produces:
  - `useFarm` 반환값에 `breedingInfo: { masterUnlocked: boolean; masterCropHeld: number }`, `busyBreedCropId: FarmCropId | null`, `breedCrop(cropId: FarmCropId): Promise<void>` 추가. `FarmNotice`에 `{ id; kind: "breed"; result: FarmBreedingResult }` 추가. 오류 문구 5종 추가.
  - `FarmBreedingPanel({ farm, crops, info, busyCropId, onBreed })`.
  - `FarmSectionKey`에 `"breeding"` 추가, 탭 라벨 "품종", 순서는 납품과 상점 사이.

- [ ] **Step 1: 패널 테스트 작성** — `FarmEndgameShopPanel.test.tsx`의 렌더 방식을 따른다. 경우:
  - 밀 40·황금 밀 2 보유, 0단계 → 밀 카드에 "0단계", "밀 40 / 40", 개량 버튼 활성. 누르면 `onBreed("wheat")`.
  - 밀 10 보유 → 버튼 비활성.
  - 밀 5단계, `masterUnlocked: false` → "농사 주전공 명장 3단계부터 올릴 수 있습니다." 문구와 비활성 버튼.
  - 밀 6단계 → 버튼 없이 "최고 단계".
  - 위쪽에 "품종 단계 합계" 값이 보인다.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/FarmBreedingPanel.test.tsx`
- [ ] **Step 3: 패널 구현** — 카드 격자 `grid gap-3 sm:grid-cols-2 xl:grid-cols-3`. 카드마다 `FarmItemIcon`, 작물 이름, "N단계", "희귀 수확 +N%p", 다음 단계 비용 줄(보유 / 필요, 모자라면 붉은 글자), 버튼. 설명 한 줄: "작물을 모아 품종을 개량하면 그 작물의 희귀 수확 확률이 오릅니다."
- [ ] **Step 4: `useFarm` 수정** — `breedCrop`은 `buyPlotUpgrade`와 같은 형식으로 `/api/v2/farm/breed`에 `{ cropId }`를 보낸다. `apply`에서 `breeding`이 있으면 `breedingInfo` 갱신, `breedResult`가 있으면 알림 설정.
  오류 문구: `breeding_max` "이미 최고 단계입니다.", `breeding_master_locked` "명장 품종은 농사 주전공 명장 3단계부터 올릴 수 있습니다.", `not_enough_crops` "작물이 부족합니다.", `not_enough_rare_crops` "희귀 작물이 부족합니다.", `not_enough_master_crop` "명장 작물이 부족합니다."
- [ ] **Step 5: `AdventurerFarmPanel` 수정** — 탭과 구역 추가, 알림 문구 "{작물} 품종을 {N}단계로 개량했습니다. 희귀 수확 확률 +{N}%p." 칭호를 받았으면 뒤에 " 칭호 ‘{이름}’을 얻었습니다."
- [ ] **Step 6: 통과 확인** — 패널 테스트와 `npx vitest run src/adventure/v2/AdventurerFarmPanel`.
- [ ] **Step 7: 커밋** — `feat: 농장 품종 개량 화면`

### Task 5: 매뉴얼, 기록, 전체 검증

**Files:**
- Modify: `src/app/manual/content/pastimes.tsx` (농장 항목)
- Create: `docs/content-modification-records/2026-11-13-farm-breeding.md`

- [ ] **Step 1: 매뉴얼에 품종 개량 단락 추가** — 규칙(11종, 5단계, 단계당 +2%p, 명장 품종 +13%p와 조건), 비용 표(수확 횟수분·희귀 작물·명장 작물), 칭호 2종. 수치는 `farmBreedingRules`의 상수에서 읽는다.
- [ ] **Step 2: 기록 문서 작성** — 기존 `2026-11-13-life-battle-prep.md` 형식을 따른다.
- [ ] **Step 3: 전체 검증**
  - `npx tsc --noEmit` → 오류 0
  - `npx eslint` (바뀐 파일) → 오류 0
  - `npx vitest run src/adventure/v2 src/lib/server src/app/manual src/adventure/data` → 전부 통과
  - `npm run check-module-budgets` → PASS
  - dev 서버로 농장 화면 컴파일과 라이트·다크 모드 표시 확인(서버 전용 모듈이 클라이언트로 끌려오지 않는지 포함)
- [ ] **Step 4: 커밋** — `docs: 농장 품종 개량 매뉴얼과 수정 기록`
