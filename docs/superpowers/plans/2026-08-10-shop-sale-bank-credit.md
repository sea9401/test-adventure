# Shop Sale Bank Credit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Credit NPC shop sale proceeds to banked gold for single equipment, bulk equipment, and material sales.

**Architecture:** Keep each existing transaction and sale calculation intact. Replace the wallet credit with a bank credit, return both authoritative balances, and let the two existing client views apply those balances immediately.

**Tech Stack:** Next.js 16.2.11 Route Handlers, React 19, TypeScript, Vitest.

## Global Constraints

- Do not deploy.
- Preserve all pre-existing dirty files, including the pending migration files.
- Do not change marketplace proceeds or refund routing.
- Do not change sale prices, sellability, item removal, locks, or economy logs.

---

### Task 1: Server sale proceeds

**Files:**
- Create: `src/app/api/v2/shop/equipment/sell/route.test.ts`
- Modify: `src/app/api/v2/shop/equipment/sell/route.ts`
- Modify: `src/app/api/v2/shop/equipment/sell-bulk/route.test.ts`
- Modify: `src/app/api/v2/shop/equipment/sell-bulk/route.ts`
- Create: `src/app/api/v2/shop/material/sell/route.test.ts`
- Modify: `src/app/api/v2/shop/material/sell/route.ts`

**Interfaces:**
- Each successful response produces `{ gold: number, bankedGold: number }`.

- [ ] Write route tests with literal starting wallet and bank balances; assert wallet is unchanged and bank increases by the exact sale amount.
- [ ] Run the three route tests and confirm they fail on wallet credit or missing `bankedGold`.
- [ ] Change only the character balance update and response fields in each route.
- [ ] Run the three route tests and confirm they pass with existing sale selection assertions intact.
- [ ] Commit the server behavior.

### Task 2: Client balance synchronization

**Files:**
- Modify: `src/adventure/v2/V2ShopView.tsx`
- Modify: `src/adventure/v2/V2InventoryView.tsx`
- Modify only existing component tests if a behavior seam already exists.

**Interfaces:**
- Consumes the route response `gold` and `bankedGold` fields.

- [ ] Extend the three response types to include `bankedGold`.
- [ ] Apply both balances to local/global state after successful sales.
- [ ] Change success copy to `은행 +N골드`.
- [ ] Run the related component tests and TypeScript.
- [ ] Commit the client behavior.

### Task 3: Verification

**Files:**
- Modify only feature files required by a verified failure.

- [ ] Run the focused route and component tests.
- [ ] Run `npx tsc --noEmit` and `npm run lint`.
- [ ] Run `npm test` and `npm run build`.
- [ ] Run `git diff --check` and confirm only the pre-existing dirty files remain outside committed work.
