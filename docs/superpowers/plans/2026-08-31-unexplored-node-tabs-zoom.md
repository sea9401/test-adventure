# 개척 노드 탭·탐사망 확대 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캐릭터 메뉴의 미개척지 진입 이름을 개척 노드로 바꾸고, 화면을 네 탭으로 분리하며 160노드 탐사망에 마우스·터치 확대와 이동을 추가한다.

**Architecture:** 기존 `V2UnexploredTreeView`가 서버 스냅샷과 탭 상태를 계속 소유한다. 확대 계산은 순수 모델로 분리하고, 전용 `UnexploredTreeViewport`가 SVG와 포인터 입력만 담당해 게임 데이터와 제스처 로직을 분리한다.

**Tech Stack:** Next.js App Router Client Components, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- 탭 이름은 `탐사망`, `탐사 업적`, `흔적 보관함`, `우두머리 핵 제작소`로 고정한다.
- 캐릭터 상단 드롭다운과 캐릭터 메뉴 카드만 `개척 노드`로 바꾸고 미개척지 세계관·사냥터 명칭은 유지한다.
- 확대 범위는 50~250%, 버튼 단위는 25%, 기본 배율은 100%다.
- 마우스 휠, 한 포인터 드래그, 두 터치 포인터 확대·이동, 화면 맞춤을 지원한다.
- 탭 전환은 API를 다시 호출하지 않으며 탐사 노드 선택과 지도 뷰포트 상태를 보존한다.
- 기존 불투명 표면 상수를 사용하고 반투명 카드나 컨테이너 전체 opacity를 추가하지 않는다.
- 서버 API, 탐사 규칙, 제작 비용과 보상은 변경하지 않는다.
- 별도 요청 전에는 테스트 서버와 본서버 모두 배포하지 않는다.

---

### Task 1: 개척 노드 메뉴 명칭

**Files:**
- Modify: `src/adventure/v2/V2CharacterMenu.test.tsx`
- Modify: `src/adventure/v2/MainTabNav.test.tsx`
- Modify: `src/adventure/v2/V2CharacterMenu.tsx`
- Modify: `src/adventure/v2/MainTabNav.tsx`

**Interfaces:**
- Consumes: 기존 `open-unexplored` 액션과 `/character/unexplored` 경로
- Produces: 두 캐릭터 진입점에서 보이는 `개척 노드` 레이블

- [ ] **Step 1: 실패하는 메뉴 테스트 작성**

`V2CharacterMenu.test.tsx`의 플래그 테스트가 활성 메뉴에서 `개척 노드`를 찾고 `미개척지`를 찾지 않도록 바꾼다. `MainTabNav.test.tsx`에서는 `개척 노드` 메뉴 항목을 클릭한 뒤 기존 경로로 이동하는지 검증한다.

```tsx
expect(hidden).not.toContain("개척 노드");
expect(visible).toContain("개척 노드");
expect(visible).not.toContain(">미개척지<");

fireEvent.click(screen.getByRole("menuitem", { name: "개척 노드" }));
expect(onNavigate).toHaveBeenCalledWith("/character/unexplored");
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/adventure/v2/V2CharacterMenu.test.tsx src/adventure/v2/MainTabNav.test.tsx`

Expected: 기존 레이블이 `미개척지`여서 `개척 노드` 조회가 실패한다.

- [ ] **Step 3: 두 메뉴 레이블만 최소 변경**

`V2CharacterMenu.tsx`의 카드 `title`과 `MainTabNav.tsx`의 항목 `label`을 `개척 노드`로 바꾼다. 설명, 액션, 경로, 기능 플래그는 유지한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/V2CharacterMenu.test.tsx src/adventure/v2/MainTabNav.test.tsx`

Expected: 2 files pass, 메뉴 이동 경로는 `/character/unexplored`로 유지된다.

- [ ] **Step 5: 커밋**

```bash
git add src/adventure/v2/V2CharacterMenu.test.tsx src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/V2CharacterMenu.tsx src/adventure/v2/MainTabNav.tsx
git commit -m "feat: rename unexplored character entry"
```

### Task 2: 미개척지 콘텐츠를 네 탭으로 분리

**Files:**
- Modify: `src/adventure/v2/V2UnexploredTreeView.test.tsx`
- Modify: `src/adventure/v2/V2UnexploredTreeView.tsx`

**Interfaces:**
- Consumes: 한 번 조회한 `UnexploredClientSnapshot`, 기존 노드·제작 이벤트 처리기
- Produces: `UnexploredTab = "tree" | "achievements" | "traces" | "forge"`와 네 개 접근 가능한 탭 패널

- [ ] **Step 1: 실패하는 탭 테스트 작성**

기존 실제 컴포넌트를 렌더링해 초기 활성 탭과 전환 동작을 검증한다. 활성 탭 패널만 `hidden === false`이고 나머지는 `hidden === true`여야 한다.

```tsx
it("탐사망·탐사 업적·흔적 보관함·우두머리 핵 제작소를 독립 탭으로 표시한다", () => {
  render(<V2UnexploredTreeView initialSnapshot={SNAPSHOT} onBack={vi.fn()} />);

  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "탐사망",
    "탐사 업적",
    "흔적 보관함",
    "우두머리 핵 제작소",
  ]);
  expect(screen.getByRole("tabpanel", { name: "탐사망" }).hidden).toBe(false);

  fireEvent.click(screen.getByRole("tab", { name: "탐사 업적" }));
  expect(screen.getByRole("tabpanel", { name: "탐사 업적" }).hidden).toBe(false);
  expect(screen.getByRole("tabpanel", { name: "탐사망", hidden: true }).hidden).toBe(true);
});
```

별도 테스트에서 탭 전환 전후 `fetch` 호출 수가 증가하지 않는지, 탐사망 탭을 떠나면 상단 `초기화` 버튼이 숨겨지는지 확인한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: `tab`과 `tabpanel`이 아직 없어 실패한다.

- [ ] **Step 3: 탭 상태와 탭 목록 구현**

`V2UnexploredTreeView`에 아래 타입과 상태를 추가한다.

```tsx
type UnexploredTab = "tree" | "achievements" | "traces" | "forge";

const UNEXPLORED_TABS: ReadonlyArray<{
  id: UnexploredTab;
  label: string;
}> = [
  { id: "tree", label: "탐사망" },
  { id: "achievements", label: "탐사 업적" },
  { id: "traces", label: "흔적 보관함" },
  { id: "forge", label: "우두머리 핵 제작소" },
];

const [activeTab, setActiveTab] = useState<UnexploredTab>("tree");
```

요약 카드 아래에 `role="tablist"`를 추가하고 각 버튼에 `role="tab"`, `aria-selected`, `aria-controls`를 연결한다. 버튼은 `SURFACE_CARD`와 불투명한 선택 색을 사용한다.

- [ ] **Step 4: 기존 네 영역을 탭 패널로 배치**

탐사 그래프·상세·보정 영역, 업적, 흔적 보관함, 핵 제작소를 각각 `id="unexplored-panel-${tab.id}"`, `role="tabpanel"`, `aria-labelledby="unexplored-tab-${tab.id}"`, `aria-label={tab.label}`, `hidden={activeTab !== tab.id}` 속성을 가진 패널로 감싼다. 패널은 모두 마운트된 채 `hidden`으로 가시성만 바꾼다.

`SubViewHeader`의 초기화 버튼은 `activeTab === "tree"`일 때만 전달한다.

- [ ] **Step 5: 탭 테스트와 기존 상호작용 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: 탭 테스트와 기존 노드·소환석·핵 제작 테스트가 모두 통과한다.

- [ ] **Step 6: 커밋**

```bash
git add src/adventure/v2/V2UnexploredTreeView.test.tsx src/adventure/v2/V2UnexploredTreeView.tsx
git commit -m "feat: split unexplored content into tabs"
```

### Task 3: 탐사망 확대 계산과 포인터 뷰포트

**Files:**
- Create: `src/adventure/v2/unexploredViewportModel.ts`
- Create: `src/adventure/v2/unexploredViewportModel.test.ts`
- Create: `src/adventure/v2/UnexploredTreeViewport.tsx`
- Create: `src/adventure/v2/UnexploredTreeViewport.test.tsx`
- Modify: `src/adventure/v2/V2UnexploredTreeView.tsx`
- Modify: `src/adventure/v2/V2UnexploredTreeView.test.tsx`

**Interfaces:**
- Produces: `ViewportTransform { scale: number; x: number; y: number }`
- Produces: `clampUnexploredScale(scale: number): number`
- Produces: `zoomUnexploredAt(transform, nextScale, anchor): ViewportTransform`
- Produces: `panUnexploredBy(transform, delta): ViewportTransform`
- Produces: `UnexploredTreeViewport({ children, ariaLabel })`
- Consumes: 탐사망의 기존 SVG edge/node React elements

- [ ] **Step 1: 실패하는 순수 확대 모델 테스트 작성**

```ts
it("배율을 50~250%로 제한한다", () => {
  expect(clampUnexploredScale(0.25)).toBe(0.5);
  expect(clampUnexploredScale(1.75)).toBe(1.75);
  expect(clampUnexploredScale(3)).toBe(2.5);
});

it("포인터 기준점을 고정한 채 확대한다", () => {
  expect(zoomUnexploredAt(
    { scale: 1, x: 0, y: 0 },
    2,
    { x: 500, y: 400 },
  )).toEqual({ scale: 2, x: -500, y: -400 });
});

it("SVG 좌표 델타만큼 이동한다", () => {
  expect(panUnexploredBy(
    { scale: 1.5, x: -100, y: 20 },
    { x: 30, y: -40 },
  )).toEqual({ scale: 1.5, x: -70, y: -20 });
});
```

- [ ] **Step 2: 모델 테스트 실패 확인**

Run: `npm test -- src/adventure/v2/unexploredViewportModel.test.ts`

Expected: 모듈이 없어 실패한다.

- [ ] **Step 3: 최소 순수 모델 구현**

상수 `UNEXPLORED_MIN_SCALE = 0.5`, `UNEXPLORED_MAX_SCALE = 2.5`, `UNEXPLORED_SCALE_STEP = 0.25`를 정의한다. `zoomUnexploredAt`은 `nextX = anchor.x - ((anchor.x - x) / scale) * clampedScale` 공식을 사용한다.

- [ ] **Step 4: 모델 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/unexploredViewportModel.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: 실패하는 뷰포트 상호작용 테스트 작성**

실제 `UnexploredTreeViewport`에 작은 SVG 자식을 넣고 다음 사용자 동작을 검증한다.

```tsx
expect(screen.getByText("100%")).toBeTruthy();
fireEvent.click(screen.getByRole("button", { name: "탐사망 확대" }));
expect(screen.getByText("125%")).toBeTruthy();
fireEvent.click(screen.getByRole("button", { name: "탐사망 화면 맞춤" }));
expect(screen.getByText("100%")).toBeTruthy();
```

추가 테스트는 `getBoundingClientRect`를 1000×1000으로 고정하고 휠 확대 후 배율이 125%, 포인터 드래그 후 내부 `<g>`의 transform이 바뀌는지 확인한다. 두 개의 touch pointer를 100px 간격으로 누른 뒤 200px로 벌려 배율이 증가하는지도 확인한다.

- [ ] **Step 6: 뷰포트 테스트 실패 확인**

Run: `npm test -- src/adventure/v2/UnexploredTreeViewport.test.tsx`

Expected: 컴포넌트가 없어 실패한다.

- [ ] **Step 7: 확대·이동 뷰포트 구현**

`UnexploredTreeViewport`는 `useState<ViewportTransform>`, 활성 포인터 `Map`, 드래그 임계값 ref를 소유한다. 뷰포트 크기를 SVG viewBox 좌표로 변환해 순수 모델 함수를 호출한다.

```tsx
export function UnexploredTreeViewport({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  const [transform, setTransform] = useState<ViewportTransform>({
    scale: 1,
    x: 0,
    y: 0,
  });
  return (
    <div className="space-y-2">
      <div aria-label="탐사망 배율 조절">
        <button aria-label="탐사망 축소" onClick={() => zoomBy(-0.25)}>−</button>
        <output>{Math.round(transform.scale * 100)}%</output>
        <button aria-label="탐사망 확대" onClick={() => zoomBy(0.25)}>+</button>
        <button aria-label="탐사망 화면 맞춤" onClick={resetViewport}>화면 맞춤</button>
      </div>
      <div
        aria-label="탐사망 지도 조작 영역"
        className={`${SURFACE_INSET} aspect-square touch-none overflow-hidden`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onClickCapture={suppressClickAfterDrag}
      >
        <svg viewBox="-80 -80 1960 1960" aria-label={ariaLabel}>
          <g data-testid="unexplored-tree-transform" transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
            {children}
          </g>
        </svg>
      </div>
    </div>
  );
}
```

단일 포인터는 이동량이 4px을 넘은 뒤에만 드래그로 간주하고, 해당 제스처 직후 `onClickCapture`에서 노드 클릭을 취소한다. 두 포인터는 직전 거리 대비 비율과 중심 이동량을 함께 반영한다. `pointerup`, `pointercancel`, `lostpointercapture`에서 포인터를 제거한다.

- [ ] **Step 8: 뷰포트 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/unexploredViewportModel.test.ts src/adventure/v2/UnexploredTreeViewport.test.tsx`

Expected: 모델과 버튼·휠·드래그·핀치 테스트가 모두 통과한다.

- [ ] **Step 9: 기존 탐사망 SVG에 뷰포트 연결**

`V2UnexploredTreeView.tsx`의 기존 `SURFACE_INSET` div와 svg 껍질을 `UnexploredTreeViewport`로 교체하고 edge/node 요소를 children으로 전달한다. 기존 `aria-label="미개척지 160노드 탐사망"`, 노드 클릭, Enter·Space 선택은 그대로 유지한다.

- [ ] **Step 10: 통합 회귀 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/V2UnexploredTreeView.test.tsx src/adventure/v2/UnexploredTreeViewport.test.tsx src/adventure/v2/unexploredViewportModel.test.ts`

Expected: 160개 노드, 탭, 노드 선택, 제작, 확대 입력 테스트가 모두 통과한다.

- [ ] **Step 11: 커밋**

```bash
git add src/adventure/v2/unexploredViewportModel.ts src/adventure/v2/unexploredViewportModel.test.ts src/adventure/v2/UnexploredTreeViewport.tsx src/adventure/v2/UnexploredTreeViewport.test.tsx src/adventure/v2/V2UnexploredTreeView.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx
git commit -m "feat: add zoomable unexplored node map"
```

### Task 4: 전체 검증과 마무리

**Files:**
- Verify: `src/adventure/v2/*Unexplored*`
- Verify: `src/adventure/v2/V2CharacterMenu*`
- Verify: `src/adventure/v2/MainTabNav*`

**Interfaces:**
- Consumes: Tasks 1~3의 메뉴, 탭, 뷰포트 결과
- Produces: 타입·스타일·production build까지 검증된 브랜치

- [ ] **Step 1: 관련 테스트 전체 실행**

Run: `npm test -- src/adventure/v2/V2UnexploredTreeView.test.tsx src/adventure/v2/UnexploredTreeViewport.test.tsx src/adventure/v2/unexploredViewportModel.test.ts src/adventure/v2/V2CharacterMenu.test.tsx src/adventure/v2/MainTabNav.test.tsx`

Expected: 모든 파일과 테스트가 통과한다.

- [ ] **Step 2: 변경 파일 ESLint 실행**

Run: `npx eslint src/adventure/v2/V2UnexploredTreeView.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx src/adventure/v2/UnexploredTreeViewport.tsx src/adventure/v2/UnexploredTreeViewport.test.tsx src/adventure/v2/unexploredViewportModel.ts src/adventure/v2/unexploredViewportModel.test.ts src/adventure/v2/V2CharacterMenu.tsx src/adventure/v2/V2CharacterMenu.test.tsx src/adventure/v2/MainTabNav.tsx src/adventure/v2/MainTabNav.test.tsx`

Expected: exit 0, lint errors 0.

- [ ] **Step 3: TypeScript 검사**

Run: `npx tsc --noEmit`

Expected: exit 0, type errors 0.

- [ ] **Step 4: production build 검사**

Run: `npm run build`

Expected: Next.js build와 postbuild 검사가 exit 0으로 끝난다.

- [ ] **Step 5: 변경 범위와 작업 트리 확인**

Run: `git diff --check origin/staging...HEAD`

Expected: whitespace errors 0.

Run: `git status --short`

Expected: 추적되지 않거나 커밋되지 않은 구현 파일이 없다.
