# Treatment Wallet-First Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make treatment-center HP/MP charge purchases spend wallet gold first and use bank gold only for any remainder.

**Architecture:** Add a pure wallet-first allocation function and a feature-flag-aware wrapper beside the existing bank-first gold helpers. Wire only `POST /api/v2/shop/charge` to the new wrapper, preserving all other gold sinks and the existing transactional API contract.

**Tech Stack:** TypeScript, Next.js 16.2.11 Route Handlers, Vitest 4

## Global Constraints

- Treatment payment order is wallet first, then bank for the remainder; it is not wallet-only.
- Other gold sinks remain bank-first when `V2_CORE_LOOP_V2` is enabled.
- With `V2_CORE_LOOP_V2` disabled, treatment payment remains wallet-only for backward compatibility.
- Insufficient combined funds must leave gold, banked gold, and charge inventory unchanged.
- Do not deploy.

---

### Task 1: Wallet-first treatment payment

**Files:**
- Modify: `src/adventure/data/v2/coreLoopConfig.ts`
- Modify: `src/adventure/data/v2/coreLoopConfig.test.ts`
- Create: `src/app/api/v2/shop/charge/route.test.ts`
- Modify: `src/app/api/v2/shop/charge/route.ts`

**Interfaces:**
- Consumes: wallet gold, banked gold, integer charge cost, and `V2_CORE_LOOP_V2`.
- Produces: `spendGoldWalletFirstWithBank(gold, bankedGold, cost)` and `spendTreatmentGold(gold, bankedGold, cost)`, both returning `{ ok, gold, bankedGold }`.

- [x] **Step 1: Write failing pure allocation tests**

Import `spendGoldWalletFirstWithBank` and `spendTreatmentGold` in `coreLoopConfig.test.ts` and add:

```ts
describe("spendGoldWalletFirstWithBank — 치료소 지갑 우선", () => {
  it("지갑으로 전액 충당하면 은행을 보존한다", () => {
    expect(spendGoldWalletFirstWithBank(100, 500, 30)).toEqual({
      ok: true,
      gold: 70,
      bankedGold: 500,
    });
  });

  it("지갑이 부족하면 지갑을 먼저 소진하고 부족분만 은행에서 차감한다", () => {
    expect(spendGoldWalletFirstWithBank(20, 500, 30)).toEqual({
      ok: true,
      gold: 0,
      bankedGold: 490,
    });
  });

  it("총합이 부족하면 두 잔액을 보존한다", () => {
    expect(spendGoldWalletFirstWithBank(20, 5, 30)).toEqual({
      ok: false,
      gold: 20,
      bankedGold: 5,
    });
  });
});

describe("spendTreatmentGold — 코어루프 플래그 호환", () => {
  it("플래그가 꺼져 있으면 은행을 쓰지 않는 기존 동작을 유지한다", () => {
    expect(spendTreatmentGold(20, 500, 30)).toEqual({
      ok: false,
      gold: 20,
      bankedGold: 500,
    });
  });
});
```

- [x] **Step 2: Verify the pure tests fail for the missing export**

Run: `npm test -- src/adventure/data/v2/coreLoopConfig.test.ts`

Expected: FAIL because `spendGoldWalletFirstWithBank` is not exported.

- [x] **Step 3: Implement the minimal pure allocation and flag-aware wrapper**

Add to `coreLoopConfig.ts`:

```ts
export function spendGoldWalletFirstWithBank(
  gold: number,
  bankedGold: number,
  cost: number,
): { ok: boolean; gold: number; bankedGold: number } {
  const g = Math.max(0, Math.floor(Number(gold) || 0));
  const b = Math.max(0, Math.floor(Number(bankedGold) || 0));
  const c = Math.max(0, Math.floor(Number(cost) || 0));
  if (g + b < c) return { ok: false, gold: g, bankedGold: b };
  const fromWallet = Math.min(g, c);
  return {
    ok: true,
    gold: g - fromWallet,
    bankedGold: b - (c - fromWallet),
  };
}

export function spendTreatmentGold(
  gold: number,
  bankedGold: number,
  cost: number,
): { ok: boolean; gold: number; bankedGold: number } {
  return V2_CORE_LOOP_V2
    ? spendGoldWalletFirstWithBank(gold, bankedGold, cost)
    : spendGoldWith(gold, bankedGold, cost, false);
}
```

- [x] **Step 4: Verify the pure tests pass**

Run: `npm test -- src/adventure/data/v2/coreLoopConfig.test.ts`

Expected: PASS with zero failed tests.

- [x] **Step 5: Write failing route-level regression tests**

Create `route.test.ts` with a real `POST` invocation and only database/auth/rate-limit boundaries mocked:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  originalCoreLoopEnv: process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2,
  saves: new Map<string, unknown>(),
}));

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2 = "true";
});

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-treatment-charge"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: object, _userId: string, key: string, value: unknown) => {
      mocks.saves.set(key, value);
    },
  ),
}));

import { POST } from "./route";

afterAll(() => {
  if (mocks.originalCoreLoopEnv === undefined) {
    delete process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2;
  } else {
    process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2 = mocks.originalCoreLoopEnv;
  }
});

function request(kind: "hp" | "mp", amount: number) {
  return new Request("http://localhost/api/v2/shop/charge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, amount }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set("inventory.v2", { hpCharges: 10, mpCharges: 20 });
});

describe("POST /api/v2/shop/charge", () => {
  it("지갑이 충분하면 지갑만 차감한다", async () => {
    mocks.saves.set("character.v2", { gold: 100, bankedGold: 500 });
    const response = await POST(request("hp", 30));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ gold: 70, bankedGold: 500, hpCharges: 40 });
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 70,
      bankedGold: 500,
    });
  });

  it("지갑이 부족하면 지갑을 먼저 쓰고 부족분만 은행에서 차감한다", async () => {
    mocks.saves.set("character.v2", { gold: 20, bankedGold: 500 });
    const response = await POST(request("mp", 30));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ gold: 0, bankedGold: 490, mpCharges: 50 });
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 0,
      bankedGold: 490,
    });
  });

  it("지갑과 은행 합계가 부족하면 잔액과 충전약을 모두 보존한다", async () => {
    const character = { gold: 20, bankedGold: 5 };
    const inventory = { hpCharges: 10, mpCharges: 20 };
    mocks.saves.set("character.v2", character);
    mocks.saves.set("inventory.v2", inventory);

    const response = await POST(request("hp", 30));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("not_enough_gold");
    expect(mocks.saves.get("character.v2")).toEqual(character);
    expect(mocks.saves.get("inventory.v2")).toEqual(inventory);
  });
});
```

- [x] **Step 6: Verify the route tests fail with bank-first balances**

Run: `npm test -- src/app/api/v2/shop/charge/route.test.ts`

Expected: FAIL because the current route preserves wallet gold and spends bank gold first.

- [x] **Step 7: Wire the charge route to the treatment-specific wrapper**

Replace the route import and payment call while keeping the surrounding transaction unchanged:

```ts
import {
  V2_CORE_LOOP_V2,
  spendTreatmentGold,
} from "@/adventure/data/v2/coreLoopConfig";

const spend = spendTreatmentGold(gold, bankedGold, charge);
```

- [x] **Step 8: Run focused and static verification**

Run: `npm test -- src/adventure/data/v2/coreLoopConfig.test.ts`

Run: `npm test -- src/app/api/v2/shop/charge/route.test.ts`

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/coreLoopConfig.ts src/adventure/data/v2/coreLoopConfig.test.ts src/app/api/v2/shop/charge/route.ts src/app/api/v2/shop/charge/route.test.ts`

Expected: every command exits 0 without errors.

- [x] **Step 9: Commit the implementation**

```bash
git add docs/superpowers/specs/2026-08-18-treatment-wallet-first-payment-design.md docs/superpowers/plans/2026-08-18-treatment-wallet-first-payment.md src/adventure/data/v2/coreLoopConfig.ts src/adventure/data/v2/coreLoopConfig.test.ts src/app/api/v2/shop/charge/route.ts src/app/api/v2/shop/charge/route.test.ts
git commit -m "fix: spend wallet gold first on treatment charges"
```
