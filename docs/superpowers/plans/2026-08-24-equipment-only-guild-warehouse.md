# Equipment-Only Guild Warehouse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict new guild warehouse deposits to equipment while preserving withdrawal of materials already stored.

**Architecture:** Keep the existing warehouse state schema and legacy material withdrawal transaction. Add a server-authoritative rejection for material deposits, then make the client equipment-first and reveal material recovery only for withdrawals when legacy stock exists.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Vitest, Testing Library

## Global Constraints

- Do not deploy.
- Preserve unrelated worktree changes.
- Existing stored materials must remain recoverable.
- Cards and panels continue to use the shared opaque surface constants.

---

### Task 1: Enforce equipment-only deposits at the API boundary

**Files:**
- Modify: `src/app/api/v2/guild/warehouse/route.test.ts`
- Modify: `src/app/api/v2/guild/warehouse/route.ts`

**Interfaces:**
- Consumes: existing `POST` body `{ action, kind, materialId, quantity, iid }`
- Produces: HTTP 409 `{ ok: false, error: "warehouse_equipment_only" }` for authorized material deposits

- [ ] **Step 1: Change the existing material-deposit test into a failing equipment-only policy test**

Assert that an authorized `deposit + material` request returns 409 with `warehouse_equipment_only` and does not call `lockSaveForUpdate`, `lockGuildWarehouse`, `upsertSave`, or `upsertGuildWarehouse`.

- [ ] **Step 2: Run the route test and verify the policy test fails**

Run: `npm test -- src/app/api/v2/guild/warehouse/route.test.ts`

Expected: FAIL because material deposits currently return 200.

- [ ] **Step 3: Add the minimal server rejection**

After guild membership, facility, and transfer-permission validation, return the new 409 error before locking either inventory when `kind === "material" && action === "deposit"`.

- [ ] **Step 4: Keep legacy material withdrawal tests and equipment tests green**

Update obsolete material capacity and non-tradable-deposit assertions to the new policy without weakening the existing withdrawal coverage.

### Task 2: Make the warehouse UI equipment-first

**Files:**
- Modify: `src/adventure/v2/guild/GuildWarehousePanel.test.ts`
- Modify: `src/adventure/v2/guild/GuildWarehousePanel.tsx`

**Interfaces:**
- Consumes: `WarehouseResponse.warehouse` legacy material stock and equipment lists
- Produces: equipment-only deposit UI plus conditional `기존 재료 회수` withdrawal UI

- [ ] **Step 1: Add failing client behavior tests**

Render the real `GuildWarehousePanel` with a mocked GET response. Assert the deposit screen has no material kind tab, and assert a warehouse with legacy material reveals `기존 재료 회수` only after switching to withdrawal.

- [ ] **Step 2: Run the panel test and verify both assertions fail for the expected UI behavior**

Run: `npm test -- src/adventure/v2/guild/GuildWarehousePanel.test.ts`

- [ ] **Step 3: Implement the minimal equipment-first state and conditional recovery tab**

Initialize `kind` to `equipment`, force deposit transitions back to equipment, use warehouse materials only as withdrawal candidates, and conditionally render the recovery tab.

- [ ] **Step 4: Update policy copy and error mapping**

Describe one equipment per slot, label stored materials as withdrawal-only, and map `warehouse_equipment_only` to a clear Korean message.

### Task 3: Verify and commit

**Files:**
- Verify all files changed by Tasks 1 and 2

**Interfaces:**
- Produces: a tested local commit; no deployment

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/app/api/v2/guild/warehouse/route.test.ts src/adventure/v2/guild/GuildWarehousePanel.test.ts`

- [ ] **Step 2: Run static verification**

Run: `npx eslint src/app/api/v2/guild/warehouse/route.ts src/app/api/v2/guild/warehouse/route.test.ts src/adventure/v2/guild/GuildWarehousePanel.tsx src/adventure/v2/guild/GuildWarehousePanel.test.ts`

Run: `npx tsc --noEmit`

- [ ] **Step 3: Inspect the final diff and commit only in-scope files**

Commit message: `feat: make guild warehouse equipment-only`
