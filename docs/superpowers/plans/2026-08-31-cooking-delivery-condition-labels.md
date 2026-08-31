# Cooking Delivery Condition Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every daily and weekly cooking delivery requirement, including minimum quality, directly on its request card.

**Architecture:** Add one pure formatter beside the existing delivery rules so UI copy is derived from the same typed condition object used for eligibility. Render its output in every `RequestCard`; leave request generation, scoring, API data, and rewards unchanged.

**Tech Stack:** Next.js 16.2.11 Client Components, React 19, TypeScript, Vitest, React server rendering.

## Global Constraints

- Do not deploy or change production data.
- Preserve unrelated working-tree changes in dangerous-fishing and manual files.
- Keep all content inside the existing opaque `SURFACE_INSET` request card.
- Reuse existing cooking field, method, effect, and quality names.

---

### Task 1: Format and render complete delivery conditions

**Files:**
- Modify: `src/adventure/v2/cooking/delivery.ts`
- Modify: `src/adventure/v2/cooking/delivery.test.ts`
- Modify: `src/adventure/v2/cooking/CookingDeliveryPanel.tsx`
- Modify: `src/adventure/v2/CookingPanel.test.tsx`

**Interfaces:**
- Consumes: `CookingDeliveryCondition`, `COOKING_FIELD_NAMES`, `COOKING_METHOD_NAMES`, `COOKING_EFFECT_TAG_NAMES`, and `cookingQualityName`.
- Produces: `cookingDeliveryConditionText(condition: CookingDeliveryCondition): string`, rendered as `조건: ${text}` in every request card.

- [x] **Step 1: Write failing formatter and rendered-card tests**

Add a table-driven unit test to `delivery.test.ts` with literal expectations:

```ts
it.each([
  [{ field: "hearth", minimumQuality: "normal" }, "화덕 분야 · 일반 이상"],
  [{ method: "grill", minimumQuality: "normal" }, "굽기 조리 · 일반 이상"],
  [{ effectTag: "offense", minimumQuality: "careful" }, "공격 효과 · 정성작 이상"],
  [{ field: "hearth", method: "grill", effectTag: "offense", minimumQuality: "masterpiece" }, "화덕 분야 · 굽기 조리 · 공격 효과 · 걸작 이상"],
] as const)("납품 조건 %j를 %s로 표시한다", (condition, expected) => {
  expect(cookingDeliveryConditionText(condition)).toBe(expected);
});
```

In `CookingPanel.test.tsx`, set the fixture's weekly request explicitly to a hearth-field careful-quality request. Replace the effect-title-only assertion with assertions that the rendered delivery section contains these user-visible lines:

```ts
expect(html).toContain("조건: 화덕 분야 · 일반 이상");
expect(html).toContain("조건: 공격 효과 · 정성작 이상");
expect(html).toContain("조건: 화덕 분야 · 정성작 이상");
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/adventure/v2/cooking/delivery.test.ts src/adventure/v2/CookingPanel.test.tsx`

Expected: FAIL because `cookingDeliveryConditionText` is not exported and request cards do not render `조건:` rows.

- [x] **Step 3: Implement the pure condition formatter**

In `delivery.ts`, import `cookingQualityName` and `COOKING_EFFECT_TAG_NAMES`, then add:

```ts
export function cookingDeliveryConditionText(condition: CookingDeliveryCondition): string {
  const parts: string[] = [];
  if (condition.field) parts.push(`${COOKING_FIELD_NAMES[condition.field]} 분야`);
  if (condition.method) parts.push(`${COOKING_METHOD_NAMES[condition.method]} 조리`);
  if (condition.effectTag) parts.push(`${COOKING_EFFECT_TAG_NAMES[condition.effectTag]} 효과`);
  parts.push(`${cookingQualityName(condition.minimumQuality)} 이상`);
  return parts.join(" · ");
}
```

- [x] **Step 4: Render the formatter output in every request card**

In `CookingDeliveryPanel.tsx`, remove the effect-only `requestTitle` construction and its direct `COOKING_EFFECT_TAG_NAMES` import. Render the original `request.title`, then add the condition line immediately below the title/progress header:

```tsx
<div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
  조건: {cookingDeliveryConditionText(request.condition)}
</div>
```

Keep the existing reward row after this new line.

- [x] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking/delivery.test.ts src/adventure/v2/CookingPanel.test.tsx`

Expected: PASS, with daily normal and weekly careful requirements both visible.

- [x] **Step 6: Run static and scoped regression verification**

Run: `npm test -- src/adventure/v2/cooking src/adventure/v2/CookingPanel.test.tsx src/app/api/v2/cooking/route.test.ts`

Run: `npx eslint src/adventure/v2/cooking/delivery.ts src/adventure/v2/cooking/delivery.test.ts src/adventure/v2/cooking/CookingDeliveryPanel.tsx src/adventure/v2/CookingPanel.test.tsx`

Run: `npx tsc --noEmit`

Expected: all commands exit successfully without new errors.

- [x] **Step 7: Review and commit only scoped files**

Run `git diff --check`, inspect the four cooking file diffs, and confirm unrelated dangerous-fishing/manual changes remain unstaged. Commit the four cooking files and this plan with message:

```bash
git add docs/superpowers/plans/2026-08-31-cooking-delivery-condition-labels.md src/adventure/v2/cooking/delivery.ts src/adventure/v2/cooking/delivery.test.ts src/adventure/v2/cooking/CookingDeliveryPanel.tsx src/adventure/v2/CookingPanel.test.tsx
git commit -m "fix: show cooking delivery conditions"
```
