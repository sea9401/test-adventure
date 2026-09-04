# Marketplace Server Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a fast client device clock from making an active six-hour marketplace auction appear to enter settlement early.

**Architecture:** The browse route returns a millisecond `serverNow` snapshot when it builds the response. The marketplace client derives a server clock offset from that snapshot and uses the corrected clock for every existing countdown and bidding-phase comparison, including deadlines extended by later bids.

**Tech Stack:** Next.js App Router Route Handlers, React client state/effects, TypeScript, Vitest, Testing Library

## Global Constraints

- Preserve the six-hour auction duration, ten-minute anti-sniping extension, and five-minute settlement cadence.
- Fall back to the local clock when `serverNow` is absent or invalid so development previews remain compatible.
- Do not deploy.

---

### Task 1: Align Marketplace UI With Server Time

**Files:**
- Modify: `src/app/api/v2/marketplace/browse/route.ts`
- Modify: `src/app/api/v2/marketplace/browse/route.test.ts`
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.requests.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v2/marketplace/browse` and existing ISO `bidEndsAt` values.
- Produces: browse payload field `serverNow: number` and a corrected `clockMs` used by existing marketplace child components.

- [ ] **Step 1: Write the failing route contract test**

Freeze the test clock at `2026-09-03T09:00:00.000Z`, call `GET`, and assert the JSON payload contains `serverNow: 1788426000000`.

- [ ] **Step 2: Write the failing client regression test**

Render a listing whose server deadline is `2026-09-03T09:00:00.000Z`, return `serverNow` as `2026-09-03T08:58:00.000Z`, and stub the client clock to `2026-09-03T09:00:00.000Z`. Assert the material listing displays `2분 남음` and keeps its named bid button instead of showing `입찰 종료 · 정산 중`.

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npm test -- src/app/api/v2/marketplace/browse/route.test.ts src/adventure/v2/V2MarketplaceView.requests.test.tsx`

Expected: FAIL because the route omits `serverNow` and the client trusts the fast local clock.

- [ ] **Step 4: Return the response-time server clock**

Add `serverNow: Date.now()` to the browse route JSON object immediately before the policy fields and listing payload.

- [ ] **Step 5: Apply the clock offset in the client**

Add a `serverClockOffsetMs` state initialized to zero. Parse `serverNow?: number` from browse responses; when finite, calculate `serverNow - Date.now()`, update the offset, and immediately set `clockMs` to `serverNow`. Update the 30-second clock effect to set `clockMs` to `Date.now() + serverClockOffsetMs` and recreate the interval when the offset changes.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- src/app/api/v2/marketplace/browse/route.test.ts src/adventure/v2/V2MarketplaceView.requests.test.tsx`

Expected: PASS.

- [ ] **Step 7: Run broader verification**

Run: `npm test -- src/lib/server/marketplaceV2.test.ts src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx src/adventure/v2/marketplace/MarketplaceMyBids.test.tsx`

Run: `npx tsc --noEmit`

Expected: all commands exit successfully with no new warnings.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-09-03-marketplace-server-clock-design.md docs/superpowers/plans/2026-09-03-marketplace-server-clock.md src/app/api/v2/marketplace/browse/route.ts src/app/api/v2/marketplace/browse/route.test.ts src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/V2MarketplaceView.requests.test.tsx
git commit -m "fix: align marketplace countdown with server clock"
```
