# Hunt Status and Inventory Set Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사냥터 접이식 상태 카드의 숙련도·전환 문구·물약 줄을 안정화하고 인벤토리 도감 문구와 장착 장비 세트 표기를 바로잡는다.

**Architecture:** 기존 컴포넌트 경계를 유지한다. `V2DungeonFloorView`가 이미 계산하는 최신 숙련도를 `CompactBattlePlayerStatus`에 전달하고, 인벤토리 세트 표기는 `EquippedItemSummaryGrid` 내부에서 기존 장비 카탈로그의 정규·태그 세트 이름을 해석한다.

**Tech Stack:** Next.js 16 Client Components, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- 상단 헤더, 알림 띠, 메뉴 및 모험 탭은 수정하지 않는다.
- 회색 `도감` 분류 문구는 유지하고 버튼의 중복 `도감`만 제거한다.
- 정규 세트와 태그 세트를 모두 표시하며 비세트 장비도 동일한 카드 높이를 유지한다.
- 배포 및 점검 모드 변경은 수행하지 않는다.
- 사용자 또는 다른 세션의 기존 변경을 덮어쓰지 않는다.

---

### Task 1: 사냥터 접이식 캐릭터 상태 보완

**Files:**
- Modify: `src/adventure/v2/CompactBattlePlayerStatus.test.tsx`
- Modify: `src/adventure/v2/CompactBattlePlayerStatus.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.tsx`

**Interfaces:**
- Consumes: `V2DungeonFloorView`의 `statusProficiency: number | null`
- Produces: `CompactBattlePlayerStatus`의 선택적 `proficiency?: number | null` prop과 고정된 `data-recovery-charge` 두 줄

- [ ] **Step 1: 숙련도·전환 문구·물약 줄에 대한 실패 테스트 작성**

`CompactBattlePlayerStatus.test.tsx`의 렌더 헬퍼에 `proficiency={7_562}`를 전달하고 다음 검증을 추가한다.

```tsx
expect(summary.textContent).toContain("직업 숙련도 7,562");
expect(summary.textContent).toContain("간략히 보기");
expect(
  summary.querySelectorAll("[data-recovery-charge]"),
).toHaveLength(2);
expect(summary.querySelector('[data-recovery-charge="hp"]')?.textContent)
  .toContain("HP 충전약 17");
expect(summary.querySelector('[data-recovery-charge="mp"]')?.textContent)
  .toContain("MP 충전약 9");
```

접은 뒤에는 `상세 보기`가 표시되는 기존 검증을 유지한다. MP가 없는 렌더에서는 HP 줄만 표시되는 테스트도 추가한다.

- [ ] **Step 2: 테스트를 실행해 RED 확인**

Run: `npx vitest run src/adventure/v2/CompactBattlePlayerStatus.test.tsx`

Expected: `proficiency` prop 또는 `간략히 보기`, `data-recovery-charge` 검증 실패.

- [ ] **Step 3: 최소 구현**

`CompactBattlePlayerStatus`에 다음 prop을 추가한다.

```tsx
proficiency?: number | null;
```

요약의 이름과 부제에 상세 카드와 동일한 `text-[15px]`, `text-[12px]`를 적용한다. 숙련도가 있으면 별도 블록으로 `직업 숙련도 {proficiency.toLocaleString()}`를 표시한다. 물약은 다음처럼 분리한다.

```tsx
<span className="block" data-recovery-charge="hp">
  HP 충전약 {hpCharges.toLocaleString()}
</span>
{mp && mp.maxMp > 0 ? (
  <span className="block" data-recovery-charge="mp">
    MP 충전약 {mpCharges.toLocaleString()}
  </span>
) : null}
```

펼친 상태 문구는 `간략히 보기`, 접힌 상태 문구는 `상세 보기`로 렌더링한다. `V2DungeonFloorView`에서 `proficiency={statusProficiency}`를 전달한다.

- [ ] **Step 4: 테스트를 실행해 GREEN 확인**

Run: `npx vitest run src/adventure/v2/CompactBattlePlayerStatus.test.tsx src/adventure/v2/PlayerStatusCard.test.tsx`

Expected: 모든 테스트 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/adventure/v2/CompactBattlePlayerStatus.tsx src/adventure/v2/CompactBattlePlayerStatus.test.tsx src/adventure/v2/V2DungeonFloorView.tsx
git commit -m "fix: refine collapsed hunt character status"
```

### Task 2: 도감 일괄등록 중복 문구 제거

**Files:**
- Modify: `src/adventure/v2/inventory/EquipmentTab.test.tsx`
- Modify: `src/adventure/v2/inventory/EquipmentTab.tsx`

**Interfaces:**
- Consumes: 기존 `codexBulk.registerableCount`
- Produces: 화면상 회색 `도감` + 초록색 `일괄등록 (N)` 조합

- [ ] **Step 1: 실패 테스트 작성**

기존 테스트를 다음 기대값으로 바꾼다.

```tsx
expect(html).toContain(">도감<");
expect(html).toContain("일괄등록 (1)");
expect(html).not.toContain("도감 일괄등록 (1)");
```

- [ ] **Step 2: 테스트를 실행해 RED 확인**

Run: `npx vitest run src/adventure/v2/inventory/EquipmentTab.test.tsx`

Expected: 기존 버튼 문구 `도감 일괄등록 (1)` 때문에 실패.

- [ ] **Step 3: 최소 구현**

`EquipmentTab.tsx`의 초록색 버튼 문구만 다음과 같이 변경한다.

```tsx
일괄등록 ({codexBulk.registerableCount})
```

- [ ] **Step 4: 테스트를 실행해 GREEN 확인**

Run: `npx vitest run src/adventure/v2/inventory/EquipmentTab.test.tsx`

Expected: 모든 테스트 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/adventure/v2/inventory/EquipmentTab.tsx src/adventure/v2/inventory/EquipmentTab.test.tsx
git commit -m "fix: remove duplicate codex bulk label"
```

### Task 3: 장착 장비 요약의 세트 표기 복구

**Files:**
- Modify: `src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx`
- Modify: `src/adventure/v2/inventory/EquippedItemSummaryGrid.tsx`

**Interfaces:**
- Consumes: `V2Equipment.setId`, `V2Equipment.setTags`, `V2_EQUIP_SETS`, `V2_EQUIP_TAG_SETS`
- Produces: 각 장착 카드의 `세트 · {이름}` 또는 `세트 없음` 보조 줄

- [ ] **Step 1: 정규·태그·비세트 표기에 대한 실패 테스트 작성**

테스트 장비에 `v2_iron_sword` 비세트, `v2_boss_void_bastion` 정규 세트, `v2_crafted_guard_gauntlets` 태그 세트 장비를 각각 배치하고 다음을 검증한다.

```tsx
expect(screen.getByText("세트 없음")).toBeTruthy();
expect(screen.getByText(/세트 · .+/)).toBeTruthy();
expect(screen.getAllByTestId("equipped-set-label")).toHaveLength(3);
```

세 fixture 모두 실제 카탈로그 ID를 사용하므로 가짜 세트 데이터를 만들지 않는다.

- [ ] **Step 2: 테스트를 실행해 RED 확인**

Run: `npx vitest run src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx`

Expected: 세트 라벨이 렌더링되지 않아 실패.

- [ ] **Step 3: 최소 구현**

`EquippedItemSummaryGrid.tsx`에서 `V2_EQUIP_SETS`, `V2_EQUIP_TAG_SETS`를 가져온다. 장착 아이템별로 정규 세트 이름과 태그 세트 이름을 모아 중복을 제거하고 다음 줄을 장비명 아래에 추가한다.

```tsx
<span
  data-testid="equipped-set-label"
  className={setNames.length
    ? "w-full truncate text-[0.625rem] font-medium text-violet-600 dark:text-violet-400"
    : "w-full truncate text-[0.625rem] text-zinc-400 dark:text-zinc-500"}
  title={setLabel}
>
  {setLabel}
</span>
```

세트 라벨은 `세트 · ${setNames.join(", ")}` 또는 `세트 없음`이다. 빈 슬롯은 같은 높이를 위한 `—` 자리 표시를 렌더링한다.

- [ ] **Step 4: 테스트를 실행해 GREEN 확인**

Run: `npx vitest run src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx src/adventure/v2/inventory/EquipmentTab.test.tsx`

Expected: 모든 테스트 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/adventure/v2/inventory/EquippedItemSummaryGrid.tsx src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx
git commit -m "fix: restore equipped item set labels"
```

### Task 4: 통합 검증

**Files:**
- Verify only: all files changed by Tasks 1-3

**Interfaces:**
- Consumes: Tasks 1-3의 완성된 UI 동작
- Produces: 병합 가능한 검증 결과

- [ ] **Step 1: 관련 회귀 테스트 실행**

Run:

```bash
npx vitest run src/adventure/v2/CompactBattlePlayerStatus.test.tsx src/adventure/v2/PlayerStatusCard.test.tsx src/adventure/v2/inventory/EquipmentTab.test.tsx src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx
```

Expected: 모든 테스트 통과.

- [ ] **Step 2: 정적 검사 실행**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npx eslint src/adventure/v2/CompactBattlePlayerStatus.tsx src/adventure/v2/CompactBattlePlayerStatus.test.tsx src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/inventory/EquipmentTab.tsx src/adventure/v2/inventory/EquipmentTab.test.tsx src/adventure/v2/inventory/EquippedItemSummaryGrid.tsx src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx
```

Expected: 종료 코드 0.

- [ ] **Step 3: 프로덕션 빌드 실행**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npm run build`

Expected: Next.js 프로덕션 빌드 및 이미지 검사 성공.

- [ ] **Step 4: 작업 트리와 커밋 확인**

Run: `git diff --check && git status --short && git log -4 --oneline`

Expected: 구현 파일이 모두 커밋되어 작업 트리가 깨끗하고 Task 1-3 커밋이 존재한다.
