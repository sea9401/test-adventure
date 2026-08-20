# Codex Huntground Equipment Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모험의 서 사냥터 카드에서 지역별 장비 도감 진행률과 각 드랍 장비의 등록 여부를 즉시 확인할 수 있게 한다.

**Architecture:** `GameStateProvider`의 장비 도감 전용 컨텍스트를 `V2CodexView`가 구독한다. 순수 집계 함수가 사냥터의 일반·세트·유니크 장비 ID를 중복 제거해 진행률을 계산하고, 기존 `DropChip`과 장비 드랍 제목 영역이 그 결과를 표시한다. 컨텍스트가 준비되지 않았으면 기존 UI를 그대로 유지해 미등록 오표시를 막는다.

**Tech Stack:** Next.js 16 App Router client component, React 19, TypeScript, Tailwind CSS, Phosphor Icons, Vitest, React DOM server renderer

## Global Constraints

- API와 DB 스키마를 변경하지 않는다.
- 사냥터 목록 필터, 미등록 장비만 보기, 도감 등록 행동은 추가하지 않는다.
- 일반·세트·유니크의 기존 색상과 장비 상세 열기 동작을 유지한다.
- 상태는 색상만으로 구분하지 않고 아이콘과 `등록`·`미등록` 문구로 함께 표시한다.
- 장비 도감 컨텍스트가 준비되지 않았으면 상태와 진행률을 숨기고 기존 목록만 표시한다.
- 같은 사냥터에 중복된 장비 ID는 진행률에서 한 번만 계산한다.
- 기존 `Card`와 `SURFACE_INSET`을 유지하고 카드 전체에 투명도를 적용하지 않는다.

---

### Task 1: 사냥터 장비 도감 진행률과 상태 UI

**Files:**
- Modify: `src/adventure/v2/V2CodexView.tsx:1-275,431-555,850-1080`
- Test: `src/adventure/v2/V2CodexView.test.ts`
- Reference: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`

**Interfaces:**
- Consumes: `useEquipmentCodexContext(): { registeredIds: ReadonlySet<V2EquipmentId>; loaded: boolean; replaceRegisteredIds(ids): void } | null`
- Produces: `codexEquipmentProgress(ids, registeredIds): { registeredCount: number; totalCount: number; complete: boolean }`
- Produces: `DropChip`의 선택 속성 `registered?: boolean`; `undefined`는 도감 상태를 알 수 없음을 뜻한다.

- [ ] **Step 1: Next.js 클라이언트 컴포넌트 가이드 확인**

Run:

```bash
sed -n '1,240p' node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
```

Expected: `"use client"` 경계 안에서 상태와 컨텍스트 훅을 사용하는 현재 구조가 허용됨을 확인한다.

- [ ] **Step 2: 진행률과 칩 상태의 실패 테스트 작성**

`src/adventure/v2/V2CodexView.test.ts`에 React 정적 렌더러 import와 다음 회귀를 추가한다.

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DropChip,
  classifyCodexEquipmentIds,
  codexEquipmentProgress,
  codexTabFromParam,
  codexThemeDeepDepth,
  codexUniqueDropSummary,
  SKY_RIFT_CODEX_DROP_SUMMARY,
  shouldShowCodexTutorial,
  spCollectionSpRange,
  spEligibleJobProgress,
  spFruitCodexSource,
} from "./V2CodexView";

describe("모험의 서 사냥터 장비 도감 상태", () => {
  it("중복 드랍을 한 번만 세어 지역 진행률과 완료 여부를 계산한다", () => {
    expect(
      codexEquipmentProgress(
        [
          "v2_canyon_greatsword",
          "v2_canyon_set_armor",
          "v2_canyon_greatsword",
        ],
        new Set(["v2_canyon_greatsword"]),
      ),
    ).toEqual({ registeredCount: 1, totalCount: 2, complete: false });

    expect(
      codexEquipmentProgress(
        ["v2_canyon_greatsword", "v2_canyon_set_armor"],
        new Set(["v2_canyon_greatsword", "v2_canyon_set_armor"]),
      ),
    ).toEqual({ registeredCount: 2, totalCount: 2, complete: true });
  });

  it("장비 칩에 등록과 미등록을 글자로 표시한다", () => {
    const registered = renderToStaticMarkup(
      createElement(DropChip, {
        id: "v2_canyon_greatsword",
        kind: "common",
        registered: true,
        onOpen: () => undefined,
      }),
    );
    const missing = renderToStaticMarkup(
      createElement(DropChip, {
        id: "v2_canyon_set_armor",
        kind: "set",
        registered: false,
        onOpen: () => undefined,
      }),
    );

    expect(registered).toContain("장비 도감 등록");
    expect(registered).toContain("등록");
    expect(missing).toContain("장비 도감 미등록");
    expect(missing).toContain("미등록");
  });

  it("도감 상태를 알 수 없으면 미등록으로 단정하지 않는다", () => {
    const html = renderToStaticMarkup(
      createElement(DropChip, {
        id: "v2_canyon_greatsword",
        kind: "common",
        onOpen: () => undefined,
      }),
    );

    expect(html).not.toContain("장비 도감 미등록");
    expect(html).not.toContain(">미등록<");
  });
});
```

- [ ] **Step 3: 실패를 확인**

Run:

```bash
npx vitest run src/adventure/v2/V2CodexView.test.ts
```

Expected: `DropChip`과 `codexEquipmentProgress`가 아직 export되지 않아 FAIL한다.

- [ ] **Step 4: 순수 진행률 집계 구현**

`src/adventure/v2/V2CodexView.tsx`에 다음 함수를 export한다.

```ts
export function codexEquipmentProgress(
  ids: Iterable<V2EquipmentId>,
  registeredIds: ReadonlySet<string>,
): {
  registeredCount: number;
  totalCount: number;
  complete: boolean;
} {
  const uniqueIds = new Set(ids);
  let registeredCount = 0;
  for (const id of uniqueIds) {
    if (registeredIds.has(id)) registeredCount += 1;
  }
  const totalCount = uniqueIds.size;
  return {
    registeredCount,
    totalCount,
    complete: totalCount > 0 && registeredCount === totalCount,
  };
}
```

- [ ] **Step 5: 장비 칩 상태 구현**

`CheckCircle`을 Phosphor import에 추가하고 `DropChip`을 export한다. `registered?: boolean`을
받아 상태가 있을 때만 다음 형태의 보조 라벨과 접근 가능한 이름을 렌더링한다.

```tsx
function EquipmentRegistrationMark({
  registered,
}: {
  registered: boolean | undefined;
}) {
  if (registered === undefined) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-white px-1 py-px text-[9px] font-semibold text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
      {registered && <CheckCircle size={10} weight="fill" aria-hidden />}
      {registered ? "등록" : "미등록"}
    </span>
  );
}
```

카탈로그 장비 버튼에는 상태를 `aria-label={`${item.name} · 장비 도감 등록`}` 또는
`aria-label={`${item.name} · 장비 도감 미등록`}`으로 포함하고, 장비명 뒤에
`<EquipmentRegistrationMark registered={registered} />`를 둔다. `item`이 없는 방어
라벨에도 같은 보조 라벨을 붙인다. `registered === undefined`이면 현재 마크업과 문구를
유지한다.

- [ ] **Step 6: 장비 도감 컨텍스트와 사냥터 진행률 배선**

`useEquipmentCodexContext`를 import하고 `V2CodexView`에서 한 번 구독한다.

```ts
const equipmentCodexContext = useEquipmentCodexContext();
const registeredEquipmentIds =
  equipmentCodexContext?.loaded === true
    ? equipmentCodexContext.registeredIds
    : null;
```

각 사냥터의 `regularIds`와 `uniqueIds`가 계산된 뒤 다음 진행률을 만든다.

```ts
const huntgroundCodexProgress = registeredEquipmentIds
  ? codexEquipmentProgress(
      [...regularIds, ...uniqueIds],
      registeredEquipmentIds,
    )
  : null;
```

장비 드랍 제목 오른쪽에 `totalCount > 0`일 때만 불투명 배지를 렌더링한다. 완료 전에는
`도감 등록 N/M`, 완료 후에는 체크 아이콘과 `도감 완료 N/M`을 표시한다. 기존
`일반 · 세트 · 유니크` 설명도 유지한다.

세 종류의 `DropChip` 호출 모두에 다음 속성을 전달한다.

```tsx
registered={
  registeredEquipmentIds
    ? registeredEquipmentIds.has(id)
    : undefined
}
```

- [ ] **Step 7: 대상 테스트를 통과시킴**

Run:

```bash
npx vitest run src/adventure/v2/V2CodexView.test.ts
```

Expected: 모험의 서 테스트 전체 PASS.

- [ ] **Step 8: 영향 범위 검증**

Run:

```bash
npx vitest run src/adventure/v2/V2CodexView.test.ts src/adventure/v2/EquipmentCodexBadge.test.tsx src/adventure/v2/EquipmentCodexBulkDialog.test.tsx
npx tsc --noEmit
npx eslint src/adventure/v2/V2CodexView.tsx src/adventure/v2/V2CodexView.test.ts
npm run build
git diff --check
```

Expected: 모든 명령이 exit 0이고 프로덕션 빌드에서 이미지 검사와 정적 페이지 생성이
완료된다.

- [ ] **Step 9: 구현 커밋**

```bash
git add src/adventure/v2/V2CodexView.tsx src/adventure/v2/V2CodexView.test.ts
git commit -m "feat: show huntground equipment codex status"
```
