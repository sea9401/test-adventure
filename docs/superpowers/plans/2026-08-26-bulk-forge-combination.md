# Bulk Forge Combination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players choose and atomically craft multiple copies of any recipe in the forge combination tab.

**Architecture:** A shared pure helper validates quantities and computes client-side maxima. Each existing route accepts an optional `quantity`, validates total costs before mutation, and applies the whole batch inside its current transaction. `V2EnhanceView` owns per-recipe quantities and renders a compact mobile-friendly quantity control.

**Tech Stack:** Next.js 16.2 Route Handlers, React 19 client components, TypeScript, Vitest, Tailwind CSS.

## Global Constraints

- Omitted `quantity` remains equivalent to 1 for backward compatibility.
- Invalid, unaffordable, or capacity-exceeding batches are rejected without partial mutation.
- Existing material and gold unit costs do not change.
- Rare maps in one batch use the same selected depth and independent kind rolls.
- Do not enable the disabled reforge feature flag.
- Keep all content panels opaque and use existing surface constants for new nested controls.
- Do not deploy.

---

### Task 1: Shared quantity rules

**Files:**
- Create: `src/adventure/data/v2/forgeCombination.ts`
- Create: `src/adventure/data/v2/forgeCombination.test.ts`

**Interfaces:**
- Produces: `parseForgeCombinationQuantity(value: unknown): number | null`
- Produces: `forgeCombinationTotal(unit: number, quantity: number): number | null`
- Produces: `maxForgeCombinationQuantity(input: { materialHave: number; materialCost: number; spendableGold: number; goldCost: number; capacity?: number }): number`

- [ ] **Step 1: Write failing tests for default/invalid quantities, safe totals, and material/gold/capacity maxima**

```ts
expect(parseForgeCombinationQuantity(undefined)).toBe(1);
expect(parseForgeCombinationQuantity(3)).toBe(3);
expect(parseForgeCombinationQuantity(0)).toBeNull();
expect(parseForgeCombinationQuantity(1.5)).toBeNull();
expect(forgeCombinationTotal(300_000, 3)).toBe(900_000);
expect(maxForgeCombinationQuantity({ materialHave: 40, materialCost: 8, spendableGold: 900_000, goldCost: 300_000 })).toBe(3);
expect(maxForgeCombinationQuantity({ materialHave: 40, materialCost: 8, spendableGold: 9_000_000, goldCost: 300_000, capacity: 2 })).toBe(2);
```

- [ ] **Step 2: Run `npm test -- src/adventure/data/v2/forgeCombination.test.ts` and confirm the missing module failure**

- [ ] **Step 3: Implement strict positive-safe-integer parsing, overflow-safe multiplication, and non-negative floor-based maxima**

- [ ] **Step 4: Re-run the focused test and confirm all cases pass**

### Task 2: Atomic batch route behavior

**Files:**
- Modify: `src/lib/server/staminaPotionCombineRoute.test.ts`
- Modify: `src/lib/server/scavengedCraftingRoute.test.ts`
- Modify: `src/app/api/v2/me/stamina-potion-combine/route.ts`
- Modify: `src/app/api/v2/me/scavenged-crafting/route.ts`
- Modify: `src/app/api/v2/me/reforge-stone-combine/route.ts`

**Interfaces:**
- Consumes: quantity helpers from Task 1.
- Produces: optional JSON body field `quantity`; successful responses include `quantity` and batch `goldCost`.

- [ ] **Step 1: Add failing route tests for two-or-more outputs, multiplied costs, invalid quantity, and rare-map capacity overflow with unchanged saves**

```ts
const response = await POST(request(3));
expect(await response.json()).toMatchObject({ ok: true, quantity: 3, goldCost: COMBINE_GOLD_COST * 3 });
expect(savedPotionCount).toBe(previousPotionCount + 3);
```

- [ ] **Step 2: Run both focused route test files and confirm failures are caused by ignored or unsupported quantities**

- [ ] **Step 3: Parse the optional body before each transaction and reject `invalid_quantity` with status 400**

- [ ] **Step 4: Multiply material and gold requirements before any save mutation, then grant the full requested quantity**

- [ ] **Step 5: For rare maps, reject when `activeCount + quantity > RARE_MAP_CAP`; otherwise create `quantity` independent map instances and return the first map fields for single-call compatibility**

- [ ] **Step 6: Update the disabled reforge route to the same request contract without changing its feature flag**

- [ ] **Step 7: Re-run the focused route tests and confirm they pass**

### Task 3: Forge quantity controls

**Files:**
- Modify: `src/adventure/v2/V2EnhanceView.tsx`

**Interfaces:**
- Consumes: `maxForgeCombinationQuantity` from Task 1 and existing `/api/v2/me/rare-maps` response.
- Produces: per-card `−`, numeric input, `+`, and `최대` controls; all combination requests send `quantity`.

- [ ] **Step 1: Fetch active rare-map count alongside inventory data so the map recipe maximum includes remaining capacity**

- [ ] **Step 2: Store quantities by recipe key, normalize direct input to positive integers, and clamp the effective value to the current maximum**

- [ ] **Step 3: Change all three combination callbacks to accept `quantity`, send it as JSON, and show multiplied success/error totals**

- [ ] **Step 4: Render selected-quantity material requirements and total gold cost, followed by the compact opaque quantity control and a `${quantity}개 조합` action**

- [ ] **Step 5: Disable decrement at 1, increment at the current maximum, and the action when no batch is affordable**

### Task 4: Verification and delivery

**Files:**
- Review all files changed by Tasks 1–3.

**Interfaces:**
- Consumes: completed behavior from previous tasks.
- Produces: verified local commit; no deployment.

- [ ] **Step 1: Run focused Vitest files for quantity helpers and both active routes**

- [ ] **Step 2: Run `npx eslint` on all changed TypeScript and TSX files**

- [ ] **Step 3: Run `npx tsc --noEmit` and `npm run build`**

- [ ] **Step 4: Run `git diff --check`, inspect the complete diff, and confirm no unrelated user changes are included**

- [ ] **Step 5: Commit implementation and tests with `feat: support bulk forge combinations`**
