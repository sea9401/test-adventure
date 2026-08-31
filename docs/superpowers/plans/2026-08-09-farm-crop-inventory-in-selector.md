# Farm Crop Inventory in Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 농장 재배 탭의 씨앗 선택 카드에서 씨앗 수와 해당 일반 수확 작물 수를 함께 표시한다.

**Architecture:** 기존 `FarmState`의 `seeds`와 `inventory`를 그대로 사용한다. `AdventurerFarmPanel`이 두 재고를 `CropSelector`에 전달하고, 선택기는 `crop.id`와 `crop.itemId`로 각 수량을 조회해 카드에 렌더링한다.

**Tech Stack:** Next.js, React, TypeScript, Vitest, React DOM server rendering

## Global Constraints

- 서버 API, 농장 저장 형식, 데이터베이스는 변경하지 않는다.
- 희귀 수확물은 이번 카드 표시 범위에 포함하지 않는다.
- 누락된 씨앗·작물 재고 키는 0개로 표시한다.
- 기존 카드의 불투명 표면과 선택·잠김 스타일을 유지한다.
- 어떤 환경에도 배포하지 않는다.

---

### Task 1: 씨앗 선택 카드에 작물 보유량 표시

**Files:**
- Modify: `src/adventure/v2/AdventurerFarmPanel.test.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx:305-315`
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx:1046-1100`

**Interfaces:**
- Consumes: `FarmState.seeds: FarmSeedInventory`, `FarmState.inventory: FarmItemInventory`, `FarmCrop.id`, `FarmCrop.itemId`
- Produces: `CropSelector`의 신규 `inventory: FarmItemInventory` prop과 `씨앗 N개 · 작물 M개` 사용자 표시

- [ ] **Step 1: 실제 농장 상태 형태를 유지한 실패 회귀 테스트 작성**

`useFarm` 테스트 응답의 `farm`을 다음처럼 알려진 재고로 구성한다.

```tsx
farm: {
  ...farmModule.emptyFarmState(0),
  seeds: { wheat: 1_234 },
  inventory: { wheat: 5_678 },
},
```

그리고 실제 `AdventurerFarmPanel` 정적 HTML에서 보유량을 검증한다.

```tsx
describe("재배 작물 보유량", () => {
  it("씨앗 선택 카드에 씨앗과 일반 수확 작물 수를 함께 표시한다", () => {
    const html = renderToStaticMarkup(
      <AdventurerFarmPanel onBack={vi.fn()} onOpenKitchen={vi.fn()} />,
    );

    expect(html).toContain("씨앗 1,234개");
    expect(html).toContain("작물 5,678개");
    expect(html).toContain("씨앗 0개");
    expect(html).toContain("작물 0개");
  });
});
```

이 테스트는 `inventory` 전달이 빠지거나, `crop.itemId` 대신 잘못된 키를 사용하거나, 누락 재고를 0으로 처리하지 않는 변경을 잡는다.

- [ ] **Step 2: 회귀 테스트가 기능 부재로 실패하는지 확인**

Run: `npm test -- src/adventure/v2/AdventurerFarmPanel.test.tsx`

Expected: 기존 구현에는 `씨앗 1,234개`와 `작물 5,678개` 문구가 없어 새 테스트가 assertion failure로 실패한다.

- [ ] **Step 3: 작물 재고를 선택기에 전달하고 최소 표시 구현**

`AdventurerFarmPanel` 호출부에 `inventory={farm.inventory}`를 추가하고, `CropSelector`의 구조 분해와 prop 타입에 `inventory: FarmItemInventory`를 추가한다.

각 카드의 기존 `보유` 배지를 두 재고 표시로 교체한다.

```tsx
<span className="mt-1 inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-zinc-900 dark:text-emerald-300">
  씨앗 {(seeds[crop.id] ?? 0).toLocaleString("ko-KR")}개 · 작물{" "}
  {(inventory[crop.itemId] ?? 0).toLocaleString("ko-KR")}개
</span>
```

- [ ] **Step 4: 대상 테스트와 정적 검증 실행**

Run: `npm test -- src/adventure/v2/AdventurerFarmPanel.test.tsx`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npm run lint -- src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx`

Expected: exit code 0.

- [ ] **Step 5: 전체 회귀와 프로덕션 빌드 확인**

Run: `npm test`

Expected: 모든 Vitest 테스트가 통과한다.

Run: `npm run build`

Expected: 이미지 검사, Next.js 컴파일, 타입 검사와 정적 생성까지 exit code 0으로 완료된다.

- [ ] **Step 6: 기능 변경 커밋**

```bash
git add src/adventure/v2/AdventurerFarmPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.tsx docs/superpowers/plans/2026-08-09-farm-crop-inventory-in-selector.md
git commit -m "feat: show farm crop inventory in seed selector"
```
