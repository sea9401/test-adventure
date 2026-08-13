# 6티어 핵심 기믹 툴팁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 합일의 망토 툴팁에서 핵심 기믹 7종과 합일 강화 수치를 모바일 친화적인 인라인 펼침으로 설명한다.

**Architecture:** 아이템 카드의 기존 시그니처 한 줄은 유지하고, 합일 기믹일 때만 전용 설명 컴포넌트를 바로 아래에 렌더링한다. 전용 컴포넌트는 React 상태를 추가하지 않고 네이티브 `details`/`summary`를 사용하며, 불투명 인셋 표면 토큰 안에 판정 목록과 보상 수치를 표시한다.

**Tech Stack:** Next.js 16 Client Component, React 19, TypeScript, Tailwind CSS, Vitest, React server renderer

## Global Constraints

- 상세 설명은 `mechanic_unity` 시그니처에만 표시한다.
- 핵심 기믹은 중력 반발·상처 파열·추적 사격·그림자 잔상·맹독 폭발·과부하 낙뢰·성역 소비의 7종이다.
- 조건은 한 전투에서 서로 다른 3종 발동이다.
- 합일 강화는 공격·회복 +18%이며 3행동 지속한다.
- 중첩 팝업을 만들지 않고 현재 툴팁 안에서 펼친다.
- 펼침 영역은 `SURFACE_INSET`으로 불투명하게 표시한다.
- 배포하지 않는다.

---

### Task 1: 합일 핵심 기믹 인라인 설명

**Files:**
- Create: `src/adventure/v2/item-card/Tier6CoreMechanicDisclosure.tsx`
- Modify: `src/adventure/v2/item-card/V2ItemCardPopover.tsx`
- Test: `src/adventure/v2/item-card/V2ItemCardPopover.test.tsx`

**Interfaces:**
- Consumes: `item.signature.mechanic: Tier6UniqueMechanic | undefined`, `SURFACE_INSET: string`
- Produces: `Tier6CoreMechanicDisclosure(): JSX.Element`

- [ ] **Step 1: Write the failing integration test**

Add a test that renders `V2_EQUIPMENT.v2_sky_sig_unity_cloak` through `V2ItemCard` and asserts literal user-visible behavior:

```tsx
it("합일의 망토에서 핵심 기믹 판정과 강화 수치를 펼쳐 볼 수 있다", () => {
  const html = renderToStaticMarkup(
    <V2ItemCard
      item={V2_EQUIPMENT.v2_sky_sig_unity_cloak}
      anchor={{ top: 20, bottom: 60, left: 20 }}
      onClose={() => undefined}
    />,
  );

  expect(html).toContain("<details");
  expect(html).toContain("<summary");
  expect(html).toContain("핵심 기믹이란?");
  for (const label of [
    "중력 반발",
    "상처 파열",
    "추적 사격",
    "그림자 잔상",
    "맹독 폭발",
    "과부하 낙뢰",
    "성역 소비",
  ]) {
    expect(html).toContain(label);
  }
  expect(html).toContain("서로 다른 3종");
  expect(html).toContain("공격·회복 +18% (3행동)");
});
```

Add a boundary test that renders another 6티어 unique and asserts it does not contain `핵심 기믹이란?`, catching an accidental disclosure on every signature item.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/v2/item-card/V2ItemCardPopover.test.tsx`

Expected: FAIL because the 합일의 망토 markup does not yet contain `details`, `summary`, or the seven mechanic labels.

- [ ] **Step 3: Implement the minimal disclosure component**

Create `Tier6CoreMechanicDisclosure.tsx` with a native disclosure and literal list:

```tsx
import { SURFACE_INSET } from "@/components/ui/surfaces";

const CORE_MECHANIC_LABELS = [
  "중력 반발",
  "상처 파열",
  "추적 사격",
  "그림자 잔상",
  "맹독 폭발",
  "과부하 낙뢰",
  "성역 소비",
] as const;

export function Tier6CoreMechanicDisclosure() {
  return (
    <details className="mt-1 text-[11px]">
      <summary className="cursor-pointer select-none font-medium text-zinc-600 dark:text-zinc-300">
        핵심 기믹이란?
      </summary>
      <div className={`${SURFACE_INSET} mt-1.5 p-2.5 text-zinc-600 dark:text-zinc-300`}>
        <p>6티어 유니크의 다음 발동 효과를 뜻합니다.</p>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {CORE_MECHANIC_LABELS.map((label) => <li key={label}>· {label}</li>)}
        </ul>
        <p className="mt-2">한 전투에서 서로 다른 3종이 발동하면 조건을 충족합니다.</p>
        <p className="mt-1 font-medium text-amber-600 dark:text-amber-400">
          합일 강화: 공격·회복 +18% (3행동)
        </p>
      </div>
    </details>
  );
}
```

Import it into `V2ItemCardPopover.tsx` and render it immediately after the signature line only when `item.signature.mechanic === "mechanic_unity"`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/adventure/v2/item-card/V2ItemCardPopover.test.tsx`

Expected: all tests in the file PASS with no warnings.

- [ ] **Step 5: Run static verification**

Run: `npx eslint src/adventure/v2/item-card/Tier6CoreMechanicDisclosure.tsx src/adventure/v2/item-card/V2ItemCardPopover.tsx src/adventure/v2/item-card/V2ItemCardPopover.test.tsx`

Run: `npx tsc --noEmit`

Expected: both commands exit 0.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/adventure/v2/item-card/Tier6CoreMechanicDisclosure.tsx src/adventure/v2/item-card/V2ItemCardPopover.tsx src/adventure/v2/item-card/V2ItemCardPopover.test.tsx docs/superpowers/specs/2026-08-13-tier6-core-mechanic-tooltip-design.md
git commit -m "feat: explain tier 6 core mechanics in item tooltip"
```
