# Treatment Affordable Full Charge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the treatment-center `가득` action buy the smaller of remaining charge capacity and the player's currently spendable gold.

**Architecture:** Add one pure affordability calculation beside `MAX_CHARGE`, then use its single result for the treatment UI's label, disabled state, and POST amount. Keep the existing charge API unchanged because it remains the transactional authority for balance and capacity.

**Tech Stack:** TypeScript, React 19 client components, Next.js 16.2.11, Vitest 4

## Global Constraints

- A charge costs exactly 1 G and each HP/MP charge store is capped by `MAX_CHARGE` (10,000,000).
- Spendable gold remains wallet-only with the core loop disabled and wallet plus bank with it enabled.
- Direct-input charging and the `POST /api/v2/shop/charge` contract remain unchanged.
- Do not deploy.

---

### Task 1: Affordable full-charge calculation and treatment UI wiring

**Files:**
- Modify: `src/lib/v2-charge-config.ts`
- Create: `src/lib/v2-charge-config.test.ts`
- Modify: `src/adventure/v2/V2HealingView.tsx`
- Create: `src/adventure/v2/V2HealingView.test.tsx`

**Interfaces:**
- Consumes: `MAX_CHARGE`, current HP/MP charge count, and the already-derived `spendable` gold value.
- Produces: `affordableFullCharge(current: number, spendableGold: number): number` and a testable `FullChargeButton` that submits that amount.

- [x] **Step 1: Write the failing calculation tests**

```ts
import { describe, expect, it } from "vitest";
import { affordableFullCharge } from "./v2-charge-config";

describe("affordableFullCharge", () => {
  it("uses all spendable gold when it is less than the remaining capacity", () => {
    expect(affordableFullCharge(400_000, 140_764)).toBe(140_764);
  });

  it("does not exceed the remaining capacity when gold is sufficient", () => {
    expect(affordableFullCharge(9_900_000, 500_000)).toBe(100_000);
  });

  it.each([
    [10_000_000, 50_000],
    [400_000, 0],
  ])("returns zero when no purchase is possible", (current, gold) => {
    expect(affordableFullCharge(current, gold)).toBe(0);
  });

  it("normalizes fractional, negative, and non-finite values", () => {
    expect(affordableFullCharge(9_999_998.9, 10.8)).toBe(2);
    expect(affordableFullCharge(-50, Number.NaN)).toBe(0);
    expect(affordableFullCharge(Number.POSITIVE_INFINITY, 100)).toBe(100);
    expect(affordableFullCharge(0, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/lib/v2-charge-config.test.ts`

Expected: FAIL because `affordableFullCharge` is not exported.

- [x] **Step 3: Implement the minimal pure calculation**

```ts
export function affordableFullCharge(
  current: number,
  spendableGold: number,
): number {
  const safeCurrent = Number.isFinite(current)
    ? Math.max(0, Math.min(MAX_CHARGE, Math.floor(current)))
    : 0;
  const safeGold = Number.isFinite(spendableGold)
    ? Math.max(0, Math.floor(spendableGold))
    : 0;
  return Math.min(MAX_CHARGE - safeCurrent, safeGold);
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/lib/v2-charge-config.test.ts`

Expected: all tests pass.

- [x] **Step 5: Write a failing button contract test and wire the calculation into the button**

Create `FullChargeButton` and verify RED because the export does not exist. Then render it from `ChargeRow`; derive `fullChargeAmount = affordableFullCharge(current, gold)` and use it for the `onBuy` amount, button price, and zero-affordability disabled state while preserving `full` for the existing maximum-capacity message.

- [x] **Step 6: Run focused and static verification**

Run: `npm test -- src/lib/v2-charge-config.test.ts`

Run: `npx tsc --noEmit`

Run: `npx eslint src/lib/v2-charge-config.ts src/lib/v2-charge-config.test.ts src/adventure/v2/V2HealingView.tsx src/adventure/v2/V2HealingView.test.tsx`

Expected: every command exits 0 without errors.

- [x] **Step 7: Commit the implementation**

```bash
git add docs/superpowers/plans/2026-08-17-treatment-affordable-full-charge.md src/lib/v2-charge-config.ts src/lib/v2-charge-config.test.ts src/adventure/v2/V2HealingView.tsx src/adventure/v2/V2HealingView.test.tsx
git commit -m "fix: cap treatment full charge by spendable gold"
```
