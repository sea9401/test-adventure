# Storm Expedition Mobile Segments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile expedition map's 1120px horizontal canvas with an automatically selected three-segment map while preserving the existing desktop map and two-step node confirmation flow.

**Architecture:** Add a pure mobile segment model that maps the current node to one of three layouts and supplies responsive coordinates. Render that model below `sm`, render the existing full graph from `sm` upward, and share node status and accessibility logic between both surfaces.

**Tech Stack:** TypeScript, React 19, Tailwind CSS, SVG, Vitest, React server rendering tests

## Global Constraints

- Mobile uses three segments: entrance, middle route, and storm heart.
- Mobile node buttons remain 76px with the existing text sizes.
- Mobile has no horizontal scrolling or 1120px minimum width.
- Desktop preserves the existing full 1120px graph.
- Selection remains preview first and explicit confirmation second.
- Expedition graph, API, rewards, and persisted state do not change.
- Do not modify unrelated dirty worktree files.

---

### Task 1: Mobile Segment Model

**Files:**
- Create: `src/adventure/v2/stormExpeditionMobileMap.ts`
- Create: `src/adventure/v2/stormExpeditionMobileMap.test.ts`

**Interfaces:**
- Consumes: `StormExpeditionMapNodeId` from `@/adventure/data/v2/stormExpeditionMap`.
- Produces: `StormExpeditionMobileSegmentId`, `StormExpeditionMobileNodeLayout`, `StormExpeditionMobileSegment`, `STORM_EXPEDITION_MOBILE_SEGMENTS`, and `stormExpeditionMobileSegment(currentNodeId)`.

- [ ] **Step 1: Write the failing segment-selection tests**

```ts
expect(stormExpeditionMobileSegment(null).id).toBe(1);
expect(stormExpeditionMobileSegment("gale_outer").id).toBe(1);
expect(stormExpeditionMobileSegment("supply").id).toBe(2);
expect(stormExpeditionMobileSegment("wreckage_elite").id).toBe(2);
expect(stormExpeditionMobileSegment("altar").id).toBe(3);
expect(stormExpeditionMobileSegment("storm_heart").id).toBe(3);
```

Also assert that each segment contains its shared boundary node, every layout node ID exists in `STORM_EXPEDITION_MAP_NODES`, x coordinates stay between 0 and 360, and the three layouts use heights 300, 550, and 430.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --run src/adventure/v2/stormExpeditionMobileMap.test.ts`

Expected: FAIL because `stormExpeditionMobileMap.ts` does not exist.

- [ ] **Step 3: Implement the pure segment model**

```ts
export type StormExpeditionMobileSegmentId = 1 | 2 | 3;
export type StormExpeditionMobileNodeLayout = {
  id: StormExpeditionMapNodeId;
  x: number;
  y: number;
};
export type StormExpeditionMobileSegment = {
  id: StormExpeditionMobileSegmentId;
  label: "항로 입구" | "중층 항로" | "폭풍 심장";
  height: 300 | 550 | 430;
  nodes: readonly StormExpeditionMobileNodeLayout[];
};
```

Use x positions `60`, `180`, and `300`. Segment 1 places the three outer nodes at y `80` and supply at y `220`. Segment 2 places supply at y `55`, middle/camp/elite rows at y `165`, `275`, and `385`, then altar at y `495`. Segment 3 places altar at y `50`, the guardians at y `155`, final preparation at y `270`, and the heart at y `375`.

Return segment 1 for `null` and outer nodes, segment 2 for supply/middle/camp/elite nodes, and segment 3 for altar/guardian/final preparation/heart nodes.

- [ ] **Step 4: Run the model test and verify GREEN**

Run: `npm test -- --run src/adventure/v2/stormExpeditionMobileMap.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the model**

```bash
git add src/adventure/v2/stormExpeditionMobileMap.ts src/adventure/v2/stormExpeditionMobileMap.test.ts
git commit -m "feat: model mobile expedition segments"
```

### Task 2: Responsive Segment Rendering

**Files:**
- Modify: `src/adventure/v2/StormExpeditionRouteMap.tsx`
- Modify: `src/adventure/v2/StormExpeditionRouteMap.test.tsx`

**Interfaces:**
- Consumes: `stormExpeditionMobileSegment(currentNodeId)` and each segment's responsive node coordinates.
- Produces: a `sm:hidden` mobile segment surface and a `hidden sm:block` desktop full-map surface, both using the existing `Props` contract.

- [ ] **Step 1: Write failing responsive rendering tests**

Render the map at `currentNodeId="supply"` and assert:

```ts
expect(html).toContain('data-testid="storm-expedition-mobile-map"');
expect(html).toContain("2/3 중층 항로");
expect(html).toContain('data-testid="storm-expedition-desktop-map"');
expect(html).toContain("hidden sm:block");
expect(mobileMarkup).not.toContain("overflow-x-auto");
expect(mobileMarkup).not.toContain("min-w-[1120px]");
```

Add cases for segment 1 before entry and segment 3 at the altar. Preserve assertions for `이동 가능`, `다음 경로`, `선택됨`, `잠김`, SVG edges, and disabled buttons.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- --run src/adventure/v2/StormExpeditionRouteMap.test.tsx`

Expected: FAIL because the mobile segment surface and test IDs do not exist.

- [ ] **Step 3: Render the mobile segment and preserve desktop behavior**

In `StormExpeditionRouteMap`:

1. Calculate `const mobileSegment = stormExpeditionMobileSegment(currentNodeId)`.
2. Render a mobile wrapper with `data-testid="storm-expedition-mobile-map"` and `className="sm:hidden"`.
3. Show `${mobileSegment.id}/3 ${mobileSegment.label}` above a width-full, non-scrolling canvas.
4. Draw only edges whose source and target both occur in the selected segment.
5. Position mobile buttons with `left: ${x / 360 * 100}%`, `top: y`, fixed `h-[76px] w-[76px]`, and the shared node state styles and labels.
6. Put the existing full graph in `data-testid="storm-expedition-desktop-map"` with `className="hidden overflow-x-auto pb-2 sm:block"` and retain `min-w-[1120px]`.
7. Keep desktop `scrollIntoView` scoped to the desktop scroll container.

Extract small internal render helpers only where they remove duplicated status, accessibility label, edge, or button code. Do not change `Props` or the parent view.

- [ ] **Step 4: Run focused component and expedition tests**

Run: `npm test -- --run src/adventure/v2/stormExpeditionMobileMap.test.ts src/adventure/v2/StormExpeditionRouteMap.test.tsx src/adventure/v2/V2StormExpeditionView.test.tsx src/adventure/data/v2/stormExpeditionMap.test.ts src/lib/server/stormExpeditionRoute.test.ts`

Expected: PASS.

- [ ] **Step 5: Run static verification**

Run: `npm run lint -- src/adventure/v2/stormExpeditionMobileMap.ts src/adventure/v2/stormExpeditionMobileMap.test.ts src/adventure/v2/StormExpeditionRouteMap.tsx src/adventure/v2/StormExpeditionRouteMap.test.tsx`

Run: `npx tsc --noEmit`

Expected: both commands exit 0.

- [ ] **Step 6: Run production build and full test suite**

Run: `npm run build`

Run: `npm test`

Expected: both commands exit 0.

- [ ] **Step 7: Commit the responsive map**

```bash
git add src/adventure/v2/StormExpeditionRouteMap.tsx src/adventure/v2/StormExpeditionRouteMap.test.tsx
git commit -m "feat: add mobile expedition segment map"
```
