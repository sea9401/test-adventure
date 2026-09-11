# Unexplored Reset Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the full unexplored-tree reset cost in an in-game confirmation modal before any gold is charged.

**Architecture:** Keep the server-authoritative reset mutation unchanged. Derive the preview from the current server snapshot in the existing client component, then gate the existing mutation behind the shared `confirmGameAction` dialog.

**Tech Stack:** Next.js 16 Client Components, React 19, TypeScript, Vitest, React Testing Library

## Global Constraints

- Calculate the refundable node count exactly as the server does: exclude the `start` node from `selectedNodeIds`.
- Reuse the shared game dialog; do not add a second modal implementation.
- Preserve the existing opaque surface and accessibility behavior.
- Do not change the server price or deduction rules.

---

### Task 1: Gate full reset behind a priced confirmation

**Files:**
- Modify: `src/adventure/v2/V2UnexploredTreeView.tsx`
- Test: `src/adventure/v2/V2UnexploredTreeView.test.tsx`

**Interfaces:**
- Consumes: `confirmGameAction(options: GameConfirmOptions): Promise<boolean>` and `UnexploredClientSnapshot.refundGoldCost`.
- Produces: a reset-button handler that calls `mutate({ action: "reset" })` only after confirmation.

- [ ] **Step 1: Write the failing test**

Add a component test using a snapshot with two refundable nodes, `gold: 1_000_000`, and `bankedGold: 500_000`. Click `초기화`, assert that `confirmGameAction` receives a danger confirmation containing `2개`, `1,000,000G`, and `1,500,000G`, resolve the confirmation as false, and assert that `fetch` is not called.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: FAIL because the current button sends the reset request directly and never calls `confirmGameAction`.

- [ ] **Step 3: Write minimal implementation**

Add an async reset handler that derives:

```ts
const refundableCount = snapshot.selectedNodeIds.filter(
  (nodeId) => nodeId !== "start",
).length;
const resetGoldCost = refundableCount * snapshot.refundGoldCost;
```

Call `confirmGameAction` with the reset title, formatted counts and balances, a cost-bearing confirm label, and `tone: "danger"`. Return on cancellation; otherwise call the existing reset mutation. Wire the header button to this handler.

- [ ] **Step 4: Run focused tests and type/lint checks**

Run:

```bash
npm test -- src/adventure/v2/V2UnexploredTreeView.test.tsx src/components/ui/GameDialogHost.test.tsx
npx tsc --noEmit --pretty false
npx eslint src/adventure/v2/V2UnexploredTreeView.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx
```

Expected: all commands exit 0 with no test failures or lint/type errors.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-11-unexplored-reset-confirm-design.md docs/superpowers/plans/2026-09-11-unexplored-reset-confirm.md src/adventure/v2/V2UnexploredTreeView.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx
git commit -m "fix: confirm unexplored tree reset cost"
```
