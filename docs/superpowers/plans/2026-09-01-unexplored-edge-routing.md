# Unexplored Edge Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent every unexplored-tree edge from visually passing through a non-endpoint node while preserving the gameplay graph.

**Architecture:** Add a pure geometry module that owns node radii, detects straight-edge collisions, and generates safe quadratic SVG paths. Attach those paths to the existing tree model and render them with SVG `<path>` elements.

**Tech Stack:** TypeScript, React, SVG, Vitest, Testing Library

## Global Constraints

- Do not change `UNEXPLORED_EDGES`, activation, refund, or shortest-path behavior.
- Keep collision-free edges straight.
- Route only colliding edges away from the tree center.
- A rendered edge must clear every non-endpoint node radius plus a fixed safety margin.
- Do not deploy without a separate explicit deployment request.

---

### Task 1: Pure edge-routing geometry

**Files:**
- Create: `src/adventure/v2/unexploredTreeGeometry.ts`
- Create: `src/adventure/v2/unexploredTreeGeometry.test.ts`

**Interfaces:**
- Consumes: `UnexploredNode` endpoints and the complete `UNEXPLORED_NODES` collection.
- Produces: `unexploredNodeRadius(node)`, `buildUnexploredEdgeRoute(left, right, nodes)`, and route-clearance helpers used by tests.

- [ ] **Step 1: Write failing geometry tests**

Add literal assertions that the known `deep-tracking → deep-boss` straight segment collides with `sector-medium-4`, that the chosen route is curved, and that every generated route clears every non-endpoint node.

- [ ] **Step 2: Run the geometry test and verify RED**

Run: `npx vitest run src/adventure/v2/unexploredTreeGeometry.test.ts`

Expected: FAIL because `unexploredTreeGeometry.ts` and its routing API do not exist.

- [ ] **Step 3: Implement minimal deterministic routing**

Define the shared radius map, point-to-segment clearance, quadratic sampling, outward control-point search, and SVG path serialization. Return a straight `M … L …` path when no collision exists and a safe `M … Q …` path otherwise.

- [ ] **Step 4: Run the geometry test and verify GREEN**

Run: `npx vitest run src/adventure/v2/unexploredTreeGeometry.test.ts`

Expected: PASS with all generated routes clearing the full node set.

### Task 2: Model and SVG integration

**Files:**
- Modify: `src/adventure/v2/unexploredTreeModel.ts`
- Modify: `src/adventure/v2/unexploredTreeModel.test.ts`
- Modify: `src/adventure/v2/V2UnexploredTreeView.tsx`
- Modify: `src/adventure/v2/V2UnexploredTreeView.test.tsx`

**Interfaces:**
- Consumes: `buildUnexploredEdgeRoute` and `unexploredNodeRadius` from Task 1.
- Produces: an edge model with `path: string`; rendered SVG paths whose colors and widths still follow edge state.

- [ ] **Step 1: Write failing model and view tests**

Assert that the representative edge model contains a quadratic path, a normal edge contains a straight path, and the rendered graph contains path elements without graph line elements.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run src/adventure/v2/unexploredTreeModel.test.ts src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: FAIL because edge models have no `path` and the view still renders `<line>`.

- [ ] **Step 3: Integrate routing into the model and view**

Build each edge route once in `buildUnexploredTreeModel`, use the shared node radius in the view, and replace line coordinates with `<path d={edge.path} fill="none">` while preserving stroke state.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/adventure/v2/unexploredTreeGeometry.test.ts src/adventure/v2/unexploredTreeModel.test.ts src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: PASS.

### Task 3: Full verification and commit

**Files:**
- Verify all modified files from Tasks 1–2.

**Interfaces:**
- Consumes: completed geometry and rendering integration.
- Produces: a verified local bug-fix commit.

- [ ] **Step 1: Run related tests**

Run: `npx vitest run src/adventure/data/v2/unexploredTree.test.ts src/adventure/v2/unexploredTreeGeometry.test.ts src/adventure/v2/unexploredTreeModel.test.ts src/adventure/v2/V2UnexploredTreeView.test.tsx`

- [ ] **Step 2: Run static verification**

Run: `npx eslint src/adventure/v2/unexploredTreeGeometry.ts src/adventure/v2/unexploredTreeGeometry.test.ts src/adventure/v2/unexploredTreeModel.ts src/adventure/v2/unexploredTreeModel.test.ts src/adventure/v2/V2UnexploredTreeView.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx`

Run: `npx tsc --noEmit`

- [ ] **Step 3: Run production build**

Run: `npm run build`

- [ ] **Step 4: Review diff and commit**

Run: `git diff --check` and `git status --short`, then commit the scoped fix and tests.

