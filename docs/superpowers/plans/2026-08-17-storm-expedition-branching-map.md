# Storm Expedition Branching Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the linear storm-expedition checkpoint list with a fixed branching route map whose connected nodes are previewed and confirmed before movement, while preserving the existing nine-checkpoint, seven-battle balance and all in-progress rewards.

**Architecture:** Define one server-owned directed graph shared by persistence, API validation, and the client map. Upgrade active saves to version 3 with node IDs and explicit visited/completed sets, lazily migrate version 2 saves, and separate node completion from movement. Render the graph through a focused client component using HTML buttons over a non-interactive SVG edge layer; the existing view owns preview/confirm state and API requests.

**Tech Stack:** TypeScript, Next.js App Router route handlers, React client components, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Read the repository's current Next.js server/client component and route-handler guides before editing application code.
- Do not change enemy scaling, reward amounts, loot odds, daily attempts, clear/SP-fruit rules, or the nine-checkpoint/seven-battle run length.
- Do not deploy or change maintenance mode.
- Preserve unrelated dirty-worktree changes; implement in a `/tmp` git worktree and integrate only feature commits.
- Use `SURFACE_CARD`, `SURFACE_INSET`, or another existing opaque surface token for map and preview content.
- Keep legacy `routeId` on start as an accepted compatibility input, but make `targetNodeId` canonical.
- Make graph transitions server-authoritative; client availability is presentation only.

---

## Task 1: Add the fixed graph and version 3 persistence model

**Files:**

- Create: `src/adventure/data/v2/stormExpeditionMap.ts`
- Create: `src/adventure/data/v2/stormExpeditionMap.test.ts`
- Modify: `src/adventure/data/v2/stormExpedition.ts`
- Modify: `src/adventure/data/v2/stormExpedition.test.ts`

- [ ] **Step 1: Write failing graph invariants tests**

Add tests that enumerate all paths from each entrance successor to `storm_heart` and assert:

- all node IDs and edges resolve;
- the graph is acyclic and has no unreachable node;
- every valid run visits exactly nine checkpoints and seven encounters;
- only `supply` fans out to route middle nodes and only `altar` fans out to route guardian nodes;
- route middle nodes connect only to the same route's camp, then elite.

Run:

```bash
npx vitest run src/adventure/data/v2/stormExpeditionMap.test.ts
```

Expected: FAIL because the graph module does not exist.

- [ ] **Step 2: Implement graph data and pure helpers**

In `stormExpeditionMap.ts`, define:

```ts
export type StormExpeditionMapNodeId =
  | `${StormExpeditionRouteId}_outer`
  | "supply"
  | `${StormExpeditionRouteId}_middle`
  | `${StormExpeditionRouteId}_camp`
  | `${StormExpeditionRouteId}_elite`
  | "altar"
  | `${StormExpeditionRouteId}_guardian`
  | "final_prep"
  | "storm_heart";

export type StormExpeditionMapNode = StormExpeditionNode & {
  id: StormExpeditionMapNodeId;
  routeId: StormExpeditionRouteId | null;
  x: number;
  y: number;
  nextNodeIds: readonly StormExpeditionMapNodeId[];
};
```

Export the fixed node list, an ID lookup, entrance successor IDs, `stormExpeditionMapNode(id)`, `stormExpeditionNextNodeIds(id)`, `stormExpeditionAvailableNextNodeIds(active)`, `stormExpeditionNodeRoute(id)`, and route-to-node mapping helpers. Keep the existing encounter kinds/counts and choice kinds on their equivalent map nodes.

- [ ] **Step 3: Write failing version 3 and migration tests**

Extend `stormExpedition.test.ts` to assert all version 2 `nodeIndex` values map to the approved route-specific/shared v3 IDs; preceding nodes become ordered `visitedNodeIds` and `completedNodeIds`; the current node is visited but incomplete. Assert HP, MP, pending loot/equipment, boons, effects, used recovery skills, altar offers, choices, and defeated count survive. Assert legacy risk `nodeIndex` 1/3/5 becomes `triggerCheckpoint` supply/camp/altar and the daily date rollover preserves the graph path.

Run:

```bash
npx vitest run src/adventure/data/v2/stormExpedition.test.ts
```

Expected: FAIL on the new v3 shape.

- [ ] **Step 4: Implement v3 parsing and migration**

Change `StormExpeditionActive` to `version: 3` with `currentNodeId`, ordered `visitedNodeIds`, and `completedNodeIds`; remove `nodeIndex` from canonical state. Change risk offers/definitions to `triggerCheckpoint: "supply" | "camp" | "altar"`. Parse valid v3 arrays defensively, ensure the current node is the final visited node, deduplicate IDs, and clamp encounter index to the current node. For version 2 and older saves, derive the approved single-route path through the current index, preserving every existing gameplay field. Keep `stormExpeditionNode(active)` as the canonical current-node lookup against the graph.

- [ ] **Step 5: Verify and commit the data-model slice**

Run:

```bash
npx vitest run src/adventure/data/v2/stormExpeditionMap.test.ts src/adventure/data/v2/stormExpedition.test.ts src/adventure/data/v2/stormExpeditionRewards.test.ts
npx tsc --noEmit
```

Expected: graph/data tests PASS; TypeScript may still identify route/view call sites to update in Tasks 2–3, but no errors may remain inside the completed data files.

Commit:

```bash
git add src/adventure/data/v2/stormExpeditionMap.ts src/adventure/data/v2/stormExpeditionMap.test.ts src/adventure/data/v2/stormExpedition.ts src/adventure/data/v2/stormExpedition.test.ts
git commit -m "feat: model branching storm expedition routes"
```

## Task 2: Make completion and movement server-authoritative

**Files:**

- Modify: `src/app/api/v2/storm-expedition/route.ts`
- Modify: `src/lib/server/stormExpeditionRoute.test.ts`
- Modify: `src/app/api/v2/storm-expedition/route.test.ts`

- [ ] **Step 1: Add failing start and movement API tests**

Cover canonical start with an entrance `targetNodeId`, legacy `routeId` compatibility, invalid start nodes, and normal-attempt decrement only after a valid start. Add `move` tests for a completed connected unvisited node and rejection codes for invalid node, incomplete current node, unreachable target, previously visited target, and stale current/encounter state. Assert every response includes the graph and `availableNextNodeIds` derived by the server.

- [ ] **Step 2: Add failing completion-semantics tests**

Assert the first fight in a two-encounter node increments only `encounterIndex`; the final encounter marks the current node complete without moving; supply/camp/altar/final-prep choices mark the node complete without moving; the golden-compass camp event completes camp and opens only the same-route elite; the final boss still claims and closes immediately.

- [ ] **Step 3: Add failing route-switch reward tests**

Build saves that switch at supply and altar, then fight the newly selected route node. Assert enemy identity, route material, normal equipment pool, and route-unique rolls use the current route-specific node, while pending loot, HP/MP, boons, curses/effects, attempts, and clear records remain intact. Include practice-mode movement/fights that produce no persistent rewards or clear/SP-fruit progress.

Run:

```bash
npx vitest run src/lib/server/stormExpeditionRoute.test.ts src/app/api/v2/storm-expedition/route.test.ts
```

Expected: FAIL because the API still auto-advances by `nodeIndex`.

- [ ] **Step 4: Implement canonical start and `move`**

Extend POST input with `targetNodeId` and `expectedCurrentNodeId`. On start, resolve the canonical entrance successor, accepting legacy `routeId` only as a fallback, then create a v3 active state with the first node visited and none completed. Add an action branch for `move` that, within the existing transaction, checks stale state, node existence, current completion, direct graph edge, and visit history before updating current/visited IDs, resetting `encounterIndex`, and updating `routeId` only for route-specific nodes.

- [ ] **Step 5: Split completion from advancement**

Replace `advanceAfterBattle`/index increments with an idempotent helper that adds the current node to `completedNodeIds`. Keep only multi-encounter increment and final-boss claim as special cases. Make choices and golden compass complete the current node instead of moving. Match risk events with `triggerCheckpoint`, and use `currentNode.routeId ?? active.routeId` for enemy/reward route calculation.

- [ ] **Step 6: Return map state and structured errors**

Update `statusBody` to expose fixed map nodes/edges, `entranceNodeIds`, and server-derived `availableNextNodeIds`. Ensure `invalid_node`, `node_not_reachable`, `node_not_completed`, `node_already_visited`, and `stale_state` error responses include the latest status body.

- [ ] **Step 7: Verify and commit the API slice**

Run:

```bash
npx vitest run src/lib/server/stormExpeditionRoute.test.ts src/app/api/v2/storm-expedition/route.test.ts src/adventure/data/v2/stormExpeditionMap.test.ts src/adventure/data/v2/stormExpedition.test.ts
npx tsc --noEmit
```

Expected: all listed tests PASS and remaining TypeScript errors, if any, are limited to the not-yet-updated view.

Commit:

```bash
git add src/app/api/v2/storm-expedition/route.ts src/lib/server/stormExpeditionRoute.test.ts src/app/api/v2/storm-expedition/route.test.ts
git commit -m "feat: validate storm expedition node movement"
```

## Task 3: Build the accessible two-stage route map UI

**Files:**

- Create: `src/adventure/v2/StormExpeditionRouteMap.tsx`
- Create: `src/adventure/v2/StormExpeditionRouteMap.test.tsx`
- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`
- Modify: `src/adventure/v2/V2StormExpeditionView.test.tsx`
- Modify: `src/adventure/v2/stormExpeditionViewModel.ts`
- Modify: `src/adventure/v2/stormExpeditionViewModel.test.ts`

- [ ] **Step 1: Write failing focused map tests**

Render the map in start and active states. Assert graph nodes are real buttons with accessible name/type/status; completed/current/available/selected/locked labels are not color-only; locked nodes cannot be selected; clicking an available node calls preview selection only; SVG edges use `pointer-events: none`; the container provides mobile horizontal overflow and a fixed minimum map width. Mock `scrollIntoView` and assert it runs when `currentNodeId` changes, not when only the selected preview changes.

Run:

```bash
npx vitest run src/adventure/v2/StormExpeditionRouteMap.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 2: Implement `StormExpeditionRouteMap`**

Render one full-width opaque map card with a relatively positioned fixed-size canvas. Draw SVG lines beneath HTML circular buttons using graph coordinates. Style gale/thunder/wreckage with sky/violet/amber accents and shared nodes neutrally. Preserve opaque button/card backgrounds, use text/icons for all states, expose disabled semantics, and center the current button on node-ID changes only.

- [ ] **Step 3: Write failing view interaction tests**

Mock GET/POST and assert:

- mode is selected separately from the start node;
- first node click shows route threat/material/equipment preview and sends no request;
- `이 항로로 원정 시작` sends `targetNodeId` only after confirmation;
- active available-node click shows a preview and sends no request;
- the move button is disabled before current completion and sends `move`, target ID, expected current ID, and encounter index after completion;
- fight/choice/risk/withdraw send `expectedCurrentNodeId`;
- successful movement clears selection;
- an error response replaces status from the server and clears stale selection.

- [ ] **Step 4: Integrate the map and two-stage confirmation**

Replace the route-card start screen and vertical `ExpeditionMap`. Track selected mode and preview node locally. Resolve current node by `currentNodeId`. Put the full map first, then an opaque selected-node preview/confirm panel and the existing current-node/loot sections. Use server-provided availability for action state, but keep all confirmation-side checks defensive. Update replay subtitles to node IDs instead of array indexes and adjust helper copy so choices say they complete the checkpoint rather than auto-moving.

- [ ] **Step 5: Update view-model helpers and verify the UI slice**

Move any pure state-label, preview, or availability formatting into `stormExpeditionViewModel.ts` with focused tests rather than embedding branching rules in JSX.

Run:

```bash
npx vitest run src/adventure/v2/StormExpeditionRouteMap.test.tsx src/adventure/v2/V2StormExpeditionView.test.tsx src/adventure/v2/stormExpeditionViewModel.test.ts
npx tsc --noEmit
```

Expected: all listed tests and TypeScript PASS.

Commit:

```bash
git add src/adventure/v2/StormExpeditionRouteMap.tsx src/adventure/v2/StormExpeditionRouteMap.test.tsx src/adventure/v2/V2StormExpeditionView.tsx src/adventure/v2/V2StormExpeditionView.test.tsx src/adventure/v2/stormExpeditionViewModel.ts src/adventure/v2/stormExpeditionViewModel.test.ts
git commit -m "feat: render interactive storm expedition map"
```

## Task 4: Update player guidance and run full regression verification

**Files:**

- Modify: `src/app/manual/content/hunting.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

- [ ] **Step 1: Add a failing manual-content assertion**

Assert the storm-expedition guide mentions connected-node preview/confirmation, route reselection after shared supply and altar, no backtracking, and the preserved nine checkpoints/seven battles.

- [ ] **Step 2: Update the manual copy**

Describe the fixed map and two-stage movement plainly without implying changed rewards or difficulty.

- [ ] **Step 3: Run focused and broad verification**

Run:

```bash
npx vitest run src/app/manual/current-content.test.tsx
npx vitest run src/adventure/data/v2/stormExpeditionMap.test.ts src/adventure/data/v2/stormExpedition.test.ts src/adventure/data/v2/stormExpeditionRewards.test.ts src/lib/server/stormExpeditionRoute.test.ts src/app/api/v2/storm-expedition/route.test.ts src/adventure/v2/StormExpeditionRouteMap.test.tsx src/adventure/v2/V2StormExpeditionView.test.tsx src/adventure/v2/stormExpeditionViewModel.test.ts src/app/manual/current-content.test.tsx
npm run check-images
npx tsc --noEmit
npm run build
```

Expected: every command exits 0. Inspect the rendered map in both light and dark themes at desktop and a narrow mobile viewport if the repository's existing browser harness is available; confirm no scene background leaks through cards, horizontal map scrolling works, and current-node centering does not fight manual scrolling.

- [ ] **Step 4: Commit documentation and final verification fixes**

```bash
git add src/app/manual/content/hunting.tsx src/app/manual/current-content.test.tsx
git commit -m "docs: explain storm expedition route map"
```

- [ ] **Step 5: Review the final diff and integrate only feature commits**

Run:

```bash
git status --short
git diff --check
git log --oneline --decorate -6
```

Verify no unrelated files are staged or committed. Integrate the plan and feature commits into the original branch without deploying or changing maintenance mode.
