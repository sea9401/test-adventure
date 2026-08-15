# Life Field Focus Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep life-field content stable while focus, activity-event, and scheduled refreshes run so PC clicks are not lost to layout movement.

**Architecture:** Add a pure presentation-state function that gives existing data priority over background loading or errors. Use it in both life-field consumers without changing fetch timing, API behavior, or human-verification logic.

**Tech Stack:** TypeScript, React 19, Next.js 16 client components, Vitest

## Global Constraints

- Preserve the existing initial loading and no-data error messages.
- Keep focus, `life-field:refresh`, and environment-expiry refresh triggers unchanged.
- Do not modify activity verification, server APIs, deployment, or maintenance mode.
- Preserve unrelated untracked files `NUL` and `_workspace/`.

---

### Task 1: Stable life-field presentation state

**Files:**
- Create: `src/adventure/v2/lifeFieldStatusPresentation.ts`
- Create: `src/adventure/v2/lifeFieldStatusPresentation.test.ts`
- Modify: `src/adventure/v2/LifeFieldPanels.tsx`

**Interfaces:**
- Produces: `lifeFieldStatusPresentation({ hasData, loading, error }): "loading" | "error" | "ready"`
- Consumes: existing `data`, `loading`, and `error` values from `useLifeFieldStatus`

- [ ] **Step 1: Write the failing presentation-state test**

```ts
import { describe, expect, it } from "vitest";
import { lifeFieldStatusPresentation } from "./lifeFieldStatusPresentation";

describe("lifeFieldStatusPresentation", () => {
  it.each([
    [{ hasData: false, loading: true, error: false }, "loading"],
    [{ hasData: false, loading: false, error: true }, "error"],
    [{ hasData: true, loading: true, error: false }, "ready"],
    [{ hasData: true, loading: false, error: true }, "ready"],
  ] as const)("returns %s for %o", (input, expected) => {
    expect(lifeFieldStatusPresentation(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- src/adventure/v2/lifeFieldStatusPresentation.test.ts`

Expected: FAIL because `lifeFieldStatusPresentation` does not exist yet.

- [ ] **Step 3: Implement the minimal pure state function**

```ts
export type LifeFieldStatusPresentation = "loading" | "error" | "ready";

export function lifeFieldStatusPresentation({
  hasData,
  loading,
  error,
}: {
  hasData: boolean;
  loading: boolean;
  error: boolean;
}): LifeFieldStatusPresentation {
  if (hasData) return "ready";
  if (loading) return "loading";
  if (error) return "error";
  return "error";
}
```

- [ ] **Step 4: Apply the state to both consumers**

In `LifeFieldEnvironmentCard` and `LifeFieldCodexPanel`, compute the presentation state from `data !== null`, `loading`, and `error`. Render loading/error placeholders only for those states; when the state is `ready`, keep rendering the existing data even during refresh or refresh failure.

- [ ] **Step 5: Run focused and related tests**

Run:

```bash
npm test -- src/adventure/v2/lifeFieldStatusPresentation.test.ts src/adventure/v2/lifeFieldRefresh.test.ts src/adventure/v2/useActivityVerification.test.ts src/adventure/v2/activityVerificationGateState.test.ts
```

Expected: 4 test files pass with 0 failures.

- [ ] **Step 6: Run static verification**

Run:

```bash
npx tsc --noEmit
npx eslint src/adventure/v2/LifeFieldPanels.tsx src/adventure/v2/lifeFieldStatusPresentation.ts src/adventure/v2/lifeFieldStatusPresentation.test.ts
git diff --check
```

Expected: all commands exit 0 without errors.

- [ ] **Step 7: Review and commit**

Review `git diff` to confirm that only the planned life-field files and documentation changed, then commit the implementation and test without adding `NUL` or `_workspace/`.
