# Cooking Codex Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모험의 서 요리 목록에서 발견한 레시피는 실제 요리 이미지를, 미발견 레시피는 내용을 유추할 수 없는 검정 칸을 표시한다.

**Architecture:** 기존 `CookingRecipePublic.imageSrc`와 `/images/items/cooking/{id}.webp` 자산을 그대로 사용한다. `CookingCodexPanel`이 발견 여부를 기준으로 `next/image` 또는 검정 플레이스홀더를 서로 배타적으로 렌더링하여 미발견 이미지 URL이 DOM에 노출되지 않게 한다.

**Tech Stack:** React, Next.js `Image`, TypeScript, Vitest, Testing Library

## Global Constraints

- 미발견 레시피의 이름·설명·효과와 이미지 URL을 노출하지 않는다.
- 발견 레시피 이미지는 레시피 ID와 자동 매핑된 기존 WebP 자산을 사용한다.
- 라이트·다크 모드 모두에서 미발견 칸은 완전한 검정색을 유지한다.

---

### Task 1: 모험의 서 요리 썸네일 분기

**Files:**
- Modify: `src/adventure/v2/CookingCodexPanel.tsx`
- Test: `src/adventure/v2/CookingCodexPanel.test.tsx`

**Interfaces:**
- Consumes: `CookingRecipePublic.imageSrc`, `discoveredIds`
- Produces: 발견 시 실제 이미지, 미발견 시 이미지 URL 없는 검정 플레이스홀더

- [x] **Step 1: Write the failing tests**

```tsx
it("발견한 레시피는 실제 요리 이미지를 보여준다", () => {
  render(<CookingCodexPanel discoveredIds={["rustic_bread"]} />);
  expect(screen.getByRole("img", { name: "투박한 밀빵 이미지" })).toHaveAttribute(
    "src",
    expect.stringContaining("rustic_bread.webp"),
  );
});

it("미발견 레시피는 이미지를 불러오지 않고 검정 칸으로 완전히 가린다", () => {
  const { container } = render(<CookingCodexPanel discoveredIds={[]} />);
  expect(container.querySelector('[data-cooking-codex-hidden-image="true"]')).toHaveClass("bg-black");
  expect(container.innerHTML).not.toContain("rustic_bread.webp");
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/v2/CookingCodexPanel.test.tsx`

Expected: 새 이미지 역할과 검정 플레이스홀더를 아직 렌더링하지 않아 실패한다.

- [x] **Step 3: Implement the minimal display branch**

```tsx
import Image from "next/image";

{found ? (
  <Image
    src={recipe.imageSrc}
    alt={`${recipe.name} 이미지`}
    width={48}
    height={48}
    className="h-12 w-12 shrink-0 rounded-md object-contain"
  />
) : (
  <span
    aria-hidden
    data-cooking-codex-hidden-image="true"
    className="h-12 w-12 shrink-0 rounded-md bg-black"
  />
)}
```

- [x] **Step 4: Run focused and related verification**

Run: `npm test -- src/adventure/v2/CookingCodexPanel.test.tsx src/adventure/v2/cooking/CookingCodexPanel.test.tsx`

Expected: 두 테스트 파일이 모두 통과한다.

- [x] **Step 5: Run static and asset checks**

Run: `npx tsc --noEmit`

Run: `npm run check-images`

Expected: 타입 오류와 누락 이미지 오류가 없다.

- [x] **Step 6: Commit the implementation**

```bash
git add docs/superpowers/plans/2026-08-24-cooking-codex-images.md src/adventure/v2/CookingCodexPanel.tsx src/adventure/v2/CookingCodexPanel.test.tsx
git commit -m "feat: show cooking images in adventure codex"
```
