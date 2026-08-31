# Dangerous Fishing Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 낚시의 시각 언어를 유지하면서 위험 해역을 이미지 중심의 `출항`·`거대어` 화면으로 개편하고 전용 장비·미끼 구매를 낚시 상점으로 통합한다.

**Architecture:** 위험 해역 정적 카탈로그가 모든 이미지 경로를 소유하고, 화면 컴포넌트는 카탈로그만 읽는다. 위험 해역 플레이 화면은 로컬 탭과 상태별 패널을 조합하고, 낚시 상점은 일반 상점 상태와 경량 위험 해역 상점 상태를 별도 엔드포인트에서 병렬로 읽어 한 화면에서 표시한다. 서버 판정·가격·저장 형식과 기존 구매 함수는 변경하지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19 Client Components, TypeScript, Tailwind CSS, Vitest, `next/image`, built-in image generation, Sharp image optimization

## Global Constraints

- 기존 낚시의 밝고 정돈된 판타지 게임 일러스트와 카드 UI를 유지한다.
- 어종 출현율, 장력 판정, 위험도, 사고 확률, 보상과 가격은 변경하지 않는다.
- 공용 낚시 상단 탭은 `낚시`, `위험 해역`, `의뢰`, `주간 순위`, `명예의 전당`, `상점`을 유지한다.
- 위험 해역 로컬 탭은 `출항`, `거대어` 두 개만 추가하고 도감은 추가하지 않는다.
- 배경 이미지 위 본문과 조작은 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`의 불투명 표면 안에 둔다.
- 잠긴 카드 전체에 `opacity-*`를 적용하지 않는다.
- 이미지 파일명은 카탈로그 ID와 일치시키고 최종 WebP만 코드에서 참조한다.
- 사용자 미추적 파일 `NUL`, `_workspace/`를 수정·삭제·커밋하지 않는다.
- 배포, 푸시와 점검 모드 변경은 수행하지 않는다.

---

### Task 1: 이미지 카탈로그 계약과 신규 자산

**Files:**
- Modify: `src/adventure/data/v2/dangerousFishing.ts`
- Modify: `src/adventure/data/v2/dangerousFishing.test.ts`
- Create: `public/images/ui/dangerous-fishing-shattered-reef.webp`
- Create: `public/images/ui/dangerous-fishing-storm-trench.webp`
- Create: `public/images/ui/dangerous-fishing-abyssal-rift.webp`
- Create: `public/images/fish/{razor_sardine,ironjaw_tuna,reef_maw_grouper,storm_mackerel,thunder_ray,tempest_swordfish,lantern_eel,voidfin_coelacanth,abyssal_crownfish,tidal_colossus,abyss_kraken}.webp`
- Create: `public/images/items/fishing/dangerous/{starter_rod,breaker_rod,leviathan_rod,starter_reel,current_reel,maelstrom_reel,starter_line,braided_line,abyss_chain_line,basic_bait,reef_bait,blood_bait,luminous_bait,abyss_bait}.webp`

**Interfaces:**
- Consumes: 기존 `DangerousZone`, `DangerousFish`, `DangerousBoss`, `DangerousRod`, `DangerousReel`, `DangerousLine`, `DangerousBait` 카탈로그.
- Produces: 각 타입의 `imageSrc: string`; UI가 경로를 조합하지 않고 사용할 완전한 카탈로그.

- [ ] **Step 1: 이미지 경로 계약을 검증하는 실패 테스트 작성**

```ts
it("모든 위험 해역 카탈로그 항목에 ID 기반 이미지 경로가 있다", () => {
  expect(DANGEROUS_ZONES.shattered_reef.imageSrc).toBe(
    "/images/ui/dangerous-fishing-shattered-reef.webp",
  );
  expect(DANGEROUS_FISH.ironjaw_tuna.imageSrc).toBe(
    "/images/fish/ironjaw_tuna.webp",
  );
  expect(DANGEROUS_BOSSES.abyss_kraken.imageSrc).toBe(
    "/images/fish/abyss_kraken.webp",
  );
  expect(DANGEROUS_REELS.current_reel.imageSrc).toBe(
    "/images/items/fishing/dangerous/current_reel.webp",
  );
  expect(DANGEROUS_BAITS.luminous_bait.imageSrc).toBe(
    "/images/items/fishing/dangerous/luminous_bait.webp",
  );
});
```

- [ ] **Step 2: 테스트가 누락된 `imageSrc` 때문에 실패하는지 확인**

Run: `npm test -- src/adventure/data/v2/dangerousFishing.test.ts`

Expected: FAIL because catalog entries do not expose `imageSrc`.

- [ ] **Step 3: 타입과 모든 카탈로그 항목에 명시적 이미지 경로 추가**

```ts
export type DangerousFish = {
  id: DangerousFishId;
  imageSrc: string;
  // existing fields
};
```

같은 필드를 해역, 거대어, 장비와 미끼 타입에 추가하고 각 데이터 ID와 일치하는 절대 public 경로를 입력한다.

- [ ] **Step 4: 기존 낚시 자산을 기준 이미지로 삼아 28개 자산 생성·검수**

해역은 가로형 환경 일러스트, 어종·거대어는 옆모습 컷아웃, 장비·미끼는 중앙 배치 아이템 아이콘으로 각각 생성한다. 투명 자산은 단색 크로마키를 제거하고 PNG로 검수한 뒤 `npm run optimize-images`로 WebP 변환한다. 모든 자산에 글자·로고·워터마크가 없어야 한다.

- [ ] **Step 5: 카탈로그와 이미지 검증 실행**

Run: `npm test -- src/adventure/data/v2/dangerousFishing.test.ts && npm run check-images`

Expected: PASS; referenced images missing count 0.

- [ ] **Step 6: 커밋**

```bash
git add src/adventure/data/v2/dangerousFishing.ts src/adventure/data/v2/dangerousFishing.test.ts public/images/ui/dangerous-fishing-*.webp public/images/fish/*.webp public/images/items/fishing/dangerous
git commit -m "feat: add dangerous fishing artwork"
```

### Task 2: 위험 해역 로컬 탭과 이미지형 출항 준비

**Files:**
- Modify: `src/adventure/v2/DangerousFishingView.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.test.tsx`
- Create: `src/adventure/v2/DangerousFishingPreparationPanel.tsx`

**Interfaces:**
- Consumes: `DangerousFishingViewModel`, 카탈로그 `imageSrc`, 기존 출항·조우 콜백.
- Produces: `DangerousFishingLocalTab = "voyage" | "boss"`; 이미지형 해역·수심·장착 요약·미끼 UI; `onOpenShop?: () => void`.

- [ ] **Step 1: 탭과 출항 카드 동작을 검증하는 실패 테스트 작성**

`DangerousFishingView.test.tsx`에서 정적 렌더 결과가 `출항`, `거대어`, 세 해역 이미지 경로, `표층`·`중층`·`심층`, `낚시 상점에서 변경`을 포함하고 장비 가격·구매 버튼을 포함하지 않는지 검증한다. 잠긴 해역 모델에서는 `aria-disabled="true"`와 해금 레벨을 검증한다.

- [ ] **Step 2: 기존 화면에서 새 구조가 없어 실패하는지 확인**

Run: `npm test -- src/adventure/v2/DangerousFishingView.test.tsx`

Expected: FAIL on missing local tabs, image paths, and shop link.

- [ ] **Step 3: 준비 패널과 로컬 탭 최소 구현**

`DangerousFishingPreparationPanel`은 다음 계약을 사용한다.

```ts
export function DangerousFishingPreparationPanel(props: {
  model: DangerousFishingViewModel;
  zoneId: DangerousZoneId;
  depthId: DangerousDepthId;
  baitId: DangerousBaitId;
  busy: boolean;
  onZoneChange: (id: DangerousZoneId) => void;
  onDepthChange: (id: DangerousDepthId) => void;
  onBaitChange: (id: DangerousBaitId) => void;
  onStartVoyage: () => void;
  onStartEncounter: () => void;
  onOpenShop?: () => void;
}): React.ReactNode;
```

해역은 `button` 카드, 수심은 `aria-pressed` 분할 버튼, 장비는 48px 아이콘 요약, 미끼는 이미지 선택 카드로 렌더한다. 구매·장착 로직과 `DangerousFishingLoadoutPanel`은 플레이 화면에서 제거한다.

- [ ] **Step 4: 탭·준비 화면 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/DangerousFishingView.test.tsx`

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingPreparationPanel.tsx
git commit -m "feat: redesign dangerous fishing departure"
```

### Task 3: 조우·화물·거대어 시각화

**Files:**
- Modify: `src/adventure/v2/DangerousFishingEncounterPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingCargoPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingBossPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingBossPanel.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.test.tsx`

**Interfaces:**
- Consumes: `DangerousEncounterView.targetId`, 해역·어종·거대어 `imageSrc`.
- Produces: 공용 조우 무대 props `sceneImageSrc`, `targetImageSrc`, `targetName`; 이미지형 화물과 거대어 이벤트 카드.

- [ ] **Step 1: 대상·배경·화물 이미지를 검증하는 실패 테스트 작성**

개인 조우 렌더가 `/images/ui/dangerous-fishing-shattered-reef.webp`, `/images/fish/ironjaw_tuna.webp`, `철턱 참치`를 포함하는지 검증한다. 화물은 어종 이미지와 위험도 3 이상 `최대 손실` 경고를 검증한다. 거대어 테스트는 빈 상태의 시각 영역과 활성 이벤트의 `/images/fish/abyss_kraken.webp`를 검증한다.

- [ ] **Step 2: 기존 텍스트형 화면에서 실패 확인**

Run: `npm test -- src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx`

Expected: FAIL on missing scene and target images.

- [ ] **Step 3: 공용 조우 무대와 이미지형 화물·거대어 구현**

```ts
export function DangerousFishingEncounterPanel(props: {
  encounter: DangerousEncounterView;
  busy: boolean;
  sceneImageSrc: string;
  targetImageSrc: string;
  targetName: string;
  onAction: (action: DangerousFishingAction) => void;
}): React.ReactNode;
```

무대는 `next/image`의 `fill`과 `sizes`를 사용하고, 배경과 컷아웃 위에 텍스트를 직접 배치하지 않는다. 행동 정보와 세 게이지는 별도 불투명 패널, 세 조작은 기존 sticky 버튼을 유지한다. 거대어 패널은 동일 조우 컴포넌트를 사용한다.

- [ ] **Step 4: 관련 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/adventure/v2/DangerousFishingEncounterPanel.tsx src/adventure/v2/DangerousFishingCargoPanel.tsx src/adventure/v2/DangerousFishingBossPanel.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/DangerousFishingView.test.tsx
git commit -m "feat: visualize dangerous fishing encounters"
```

### Task 4: 위험 해역 장비를 낚시 상점으로 이동

**Files:**
- Create: `src/adventure/v2/useDangerousFishingShop.ts`
- Create: `src/adventure/v2/DangerousFishingShopSection.tsx`
- Create: `src/adventure/v2/DangerousFishingShopSection.test.tsx`
- Modify: `src/adventure/v2/FishingShopPanel.tsx`
- Modify: `src/adventure/v2/FishingShopView.tsx`
- Create: `src/adventure/v2/FishingShopView.test.tsx`

**Interfaces:**
- Consumes: GET `/api/v2/dangerous-fishing/status`, POST `/api/v2/dangerous-fishing/shop`, 기존 `FishingShopState`.
- Produces: `DangerousFishingShopState`, `buyOrEquip(kind, id, action)`, 상점 로컬 탭 `regular | dangerous`.

- [ ] **Step 1: 위험 해역 상점 섹션 실패 테스트 작성**

실제 카탈로그와 상태 fixture로 렌더해 낚싯대·릴·낚싯줄 이미지, 보유·장착 배지, 효과 태그, 특수 미끼 수량과 가격을 검증한다. `FishingShopView`는 `일반 낚시`, `위험 해역` 탭을 렌더하고 기본값이 일반 낚시인지 검증한다.

- [ ] **Step 2: 새 상점 컴포넌트가 없어 실패 확인**

Run: `npm test -- src/adventure/v2/DangerousFishingShopSection.test.tsx src/adventure/v2/FishingShopView.test.tsx`

Expected: FAIL because the components and local tabs do not exist.

- [ ] **Step 3: 경량 상점 훅과 위험 해역 상품 목록 구현**

```ts
export type DangerousFishingShopState = Pick<
  DangerousFishingViewModel,
  "fishingCoins" | "state" | "heritage" | "catalogs"
>;

export function useDangerousFishingShop(): {
  state: DangerousFishingShopState | null;
  loading: boolean;
  error: string | null;
  buying: string | null;
  buyOrEquip: (
    kind: DangerousGearKind | "bait",
    id: string,
    action: "buy" | "equip",
  ) => Promise<BuyResult>;
};
```

훅은 boss endpoint와 폴링을 사용하지 않는다. 성공 응답 뒤 status를 다시 읽어 장비·미끼·코인 상태를 갱신한다. 상품 목록은 기존 상점 카드의 48px 이미지와 버튼 형식을 따른다.

- [ ] **Step 4: 낚시 상점 로컬 탭에 섹션 연결**

`FishingShopPanel`이 두 훅을 병렬 마운트하고 `FishingShopView`에 위험 해역 상태와 콜백을 전달한다. `FishingShopView` 내부 탭은 선택된 섹션만 표시하되 두 상태는 유지한다. 위험 해역 구매 성공 후 일반 상점 상태의 `refresh`도 호출해 공용 코인 잔액을 동기화한다.

- [ ] **Step 5: 상점 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/DangerousFishingShopSection.test.tsx src/adventure/v2/FishingShopView.test.tsx src/adventure/v2/dangerousFishingShop.test.ts src/lib/server/dangerousFishingRoute.test.ts`

Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/adventure/v2/useDangerousFishingShop.ts src/adventure/v2/DangerousFishingShopSection.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx src/adventure/v2/FishingShopPanel.tsx src/adventure/v2/FishingShopView.tsx src/adventure/v2/FishingShopView.test.tsx
git commit -m "feat: integrate dangerous gear into fishing shop"
```

### Task 5: 공용 낚시 탭 경로와 회귀 검증

**Files:**
- Modify: `src/app/(game)/town/fishing/dangerous/page.tsx`
- Modify: `src/app/(game)/town/fishing/dangerous/page.test.tsx`
- Modify: `src/app/(game)/town/fishing/shop/page.tsx`
- Create or Modify: `src/app/(game)/town/fishing/shop/page.test.tsx`
- Modify as needed: `src/app/(game)/town/fishing/{challenges,leaderboard,hall-of-fame}/page.tsx`

**Interfaces:**
- Consumes: 기존 `FishingSubTabs` 콜백 계약.
- Produces: 위험 해역과 상점에서 여섯 공용 낚시 경로로 일관되게 이동하는 핸들러.

- [ ] **Step 1: 누락된 경로 이동 실패 테스트 작성**

위험 해역 페이지에서 상점·의뢰·순위·명예의 전당 이동, 상점 페이지에서 위험 해역 이동 콜백을 실행해 각각 정확한 `/town/fishing/...` 경로로 `router.push`하는지 검증한다.

- [ ] **Step 2: 누락된 콜백 때문에 실패 확인**

Run: `npm test -- 'src/app/(game)/town/fishing/dangerous/page.test.tsx' 'src/app/(game)/town/fishing/shop/page.test.tsx'`

Expected: FAIL on missing callbacks or missing test target.

- [ ] **Step 3: 모든 낚시 페이지 콜백 연결**

정적 내부 경로만 `router.push`에 전달한다. 위험 해역의 `onOpenShop`은 `/town/fishing/shop`, 상점의 `onOpenDangerous`는 `/town/fishing/dangerous`를 사용한다.

- [ ] **Step 4: 집중 회귀 검사**

Run: `npm test -- src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx src/adventure/v2/FishingShopView.test.tsx src/adventure/v2/dangerousFishingShop.test.ts src/lib/server/dangerousFishingRoute.test.ts 'src/app/(game)/town/fishing/dangerous/page.test.tsx' 'src/app/(game)/town/fishing/shop/page.test.tsx'`

Expected: PASS with 0 failures.

- [ ] **Step 5: 전체 정적·빌드 검증**

Run: `npm run check-images && npx tsc --noEmit && npm run lint && npm test && npm run build`

Expected: all commands exit 0; image checker reports no referenced missing file; Vitest reports 0 failed tests; Next build completes.

- [ ] **Step 6: 변경 범위와 사용자 파일 보존 확인 후 커밋**

```bash
git status --short
git diff --check
git add src/app/'(game)'/town/fishing
git commit -m "feat: connect dangerous fishing navigation"
```

`NUL`, `_workspace/`가 미추적 상태로 남고 커밋에 포함되지 않았는지 확인한다.
