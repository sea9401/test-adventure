# Unexplored Mobile Gesture Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mobile pan and pinch gestures on the unexplored node map update continuously without breaking node taps.

**Architecture:** Capture each pointer immediately on its original event target and retain that target for release and cleanup. Keep the existing viewport math and click-suppression threshold so only pointer ownership changes.

**Tech Stack:** Next.js 16.2.11 Client Components, React 19 Pointer Events, TypeScript, Vitest, Testing Library, jsdom

## Global Constraints

- Preserve node click targeting for a tap with no drag.
- Preserve the 50% to 250% zoom range and 25% toolbar button step.
- Do not add a parallel Touch Events implementation.
- Do not deploy without a separate explicit deployment request.

---

### Task 1: Preserve continuous mobile pointer streams

**Files:**
- Modify: `src/adventure/v2/UnexploredTreeViewport.tsx`
- Test: `src/adventure/v2/UnexploredTreeViewport.test.tsx`

**Interfaces:**
- Consumes: React `PointerEvent`, `Element.setPointerCapture`, `Element.hasPointerCapture`, and `Element.releasePointerCapture`.
- Produces: pointer-down capture on the original `event.target`, continuous pan/pinch updates, and cleanup through the existing pointer finish/lost-capture handlers.

- [x] **Step 1: Write failing continuous gesture tests**

Add a pointer-capture harness that records which element owns each pointer. Add tests that begin on a child node, route repeated moves through that captured node, and assert the transform changes after every move. Add the same repeated-move assertion for a two-touch pinch while retaining the existing node-tap assertion.

- [x] **Step 2: Run tests and confirm the expected failure**

Run: `npm test -- src/adventure/v2/UnexploredTreeViewport.test.tsx`

Expected: FAIL because the current component does not capture during `pointerdown`, leaving the harness without an owner for the continued mobile gesture.

- [x] **Step 3: Implement original-target pointer capture**

Store capture owners in `useRef(new Map<number, Element>())`. During `handlePointerDown`, choose `event.target` when it is an `Element`, fall back to `event.currentTarget`, save it, and call `setPointerCapture` immediately. Remove delayed capture from `handlePointerMove`. During pointer finish and lost capture, delete both position and owner state and release from the stored owner when still captured.

- [x] **Step 4: Run focused tests and confirm green**

Run: `npm test -- src/adventure/v2/UnexploredTreeViewport.test.tsx src/adventure/v2/unexploredViewportModel.test.ts`

Expected: both test files pass with continuous pan, continuous pinch, and node tap coverage.

- [x] **Step 5: Run static and related regression checks**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/UnexploredTreeViewport.tsx src/adventure/v2/UnexploredTreeViewport.test.tsx`

Run: `npm test -- src/adventure/v2/V2UnexploredTreeView.test.tsx src/adventure/v2/UnexploredTreeViewport.test.tsx src/adventure/v2/unexploredViewportModel.test.ts`

Expected: all commands exit 0 without new warnings.

- [x] **Step 6: Commit the verified fix**

```bash
git add docs/superpowers/specs/2026-09-02-unexplored-mobile-gesture-continuity-design.md docs/superpowers/plans/2026-09-02-unexplored-mobile-gesture-continuity.md src/adventure/v2/UnexploredTreeViewport.tsx src/adventure/v2/UnexploredTreeViewport.test.tsx
git commit -m "fix: keep unexplored mobile gestures continuous"
```
