# Dungeon Visibility Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this repository.

**Goal:** Persist hidden hunting-ground themes to the signed-in account while retaining immediate local behavior and offline fallback.

**Architecture:** A pure policy module owns the versioned save key and normalization. A dedicated authenticated route reads and writes the preference, while a focused client hook reconciles local cache and server state without allowing a late GET to overwrite an in-flight local edit.

**Tech Stack:** Next.js 16.2 App Router route handlers, React 19 hooks, Drizzle-backed `savesKv`, Vitest, Testing Library.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before writing code.
- Keep the current `adventure.v2.dungeonThemeHiddenStarts` local-storage key for device fallback.
- Server failures must not block local visibility changes.
- Ignore malformed and obsolete theme identifiers.
- Do not deploy.

---

### Task 1: Preference policy and account endpoint

**Files:**
- Create: `src/adventure/v2/dungeonThemeVisibility.ts`
- Create: `src/adventure/v2/dungeonThemeVisibility.test.ts`
- Create: `src/app/api/v2/me/dungeon-visibility-settings/route.ts`
- Create: `src/app/api/v2/me/dungeon-visibility-settings/route.test.ts`
- Modify: `src/adventure/v2/V2DungeonList.tsx`
- Modify: `src/adventure/v2/V2DungeonList.test.ts`

**Interfaces:**
- Produces: `DUNGEON_THEME_VISIBILITY_SAVE_KEY = "dungeon-theme-visibility.v1"`.
- Produces: `normalizeHiddenThemeStarts(raw: unknown): number[]` returning unique sorted positive integers.
- Produces: GET/PATCH `/api/v2/me/dungeon-visibility-settings` with `{ ok: true, hiddenThemeStarts: number[] | null }`.

- [ ] **Step 1: Read the required Next.js route-handler and client/server guides**

Run: `sed -n '1,260p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md && sed -n '1,240p' node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`

Expected: route handlers use Web `Request`/`Response`; client hooks stay behind `"use client"`.

- [ ] **Step 2: Write failing policy and route tests**

Cover normalization and authenticated persistence with assertions equivalent to:

```ts
expect(normalizeHiddenThemeStarts([13.8, "7", 1, 7, -1, null])).toEqual([1, 7, 13]);
expect(await (await GET()).json()).toEqual({ ok: true, hiddenThemeStarts: null });
expect(upsertSave).toHaveBeenCalledWith(
  expect.anything(),
  "visibility-user",
  DUNGEON_THEME_VISIBILITY_SAVE_KEY,
  [1, 7, 13],
);
```

Also assert unauthenticated GET/PATCH return 401 and invalid request bodies return 400.

- [ ] **Step 3: Run the new tests and confirm failure**

Run: `npm test -- src/adventure/v2/dungeonThemeVisibility.test.ts src/app/api/v2/me/dungeon-visibility-settings/route.test.ts`

Expected: FAIL because the module and route do not exist.

- [ ] **Step 4: Implement the policy and endpoint**

Use this contract:

```ts
export const DUNGEON_THEME_VISIBILITY_SAVE_KEY =
  "dungeon-theme-visibility.v1";

export function normalizeHiddenThemeStarts(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw
    .map((value) => Math.floor(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0))]
    .sort((a, b) => a - b);
}
```

GET returns `null` only when no save exists. PATCH requires an object with `hiddenThemeStarts`, normalizes it, stores the array with `upsertSave`, and returns the normalized array. Move or re-export `parseHiddenThemeStarts` through the pure policy so the existing list tests no longer import parsing logic from a client component.

- [ ] **Step 5: Run policy and route tests**

Run: `npm test -- src/adventure/v2/dungeonThemeVisibility.test.ts src/app/api/v2/me/dungeon-visibility-settings/route.test.ts src/adventure/v2/V2DungeonList.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the server-side unit**

```bash
git add src/adventure/v2/dungeonThemeVisibility.ts src/adventure/v2/dungeonThemeVisibility.test.ts src/app/api/v2/me/dungeon-visibility-settings/route.ts src/app/api/v2/me/dungeon-visibility-settings/route.test.ts src/adventure/v2/V2DungeonList.tsx src/adventure/v2/V2DungeonList.test.ts
git commit -m "feat: persist dungeon visibility preferences"
```

### Task 2: Local-first synchronization hook and list integration

**Files:**
- Create: `src/adventure/v2/useDungeonThemeVisibility.ts`
- Create: `src/adventure/v2/useDungeonThemeVisibility.test.tsx`
- Modify: `src/adventure/v2/V2DungeonList.tsx`

**Interfaces:**
- Consumes: `normalizeHiddenThemeStarts` and the endpoint from Task 1.
- Produces: `useDungeonThemeVisibility(): { hiddenThemeStarts: Set<number>; setHiddenThemeStarts(next: Set<number>): void }`.

- [ ] **Step 1: Write failing hook tests**

Test these three flows with mocked `fetch` and `localStorage`:

```ts
expect([...result.current.hiddenThemeStarts]).toEqual([7]); // server overrides local
expect(fetchMock).toHaveBeenCalledWith(
  "/api/v2/me/dungeon-visibility-settings",
  expect.objectContaining({ method: "PATCH" }),
); // null server seeds local
expect([...result.current.hiddenThemeStarts]).toEqual([13]); // local edit survives late GET
```

Use a deferred GET promise for the race test: call `setHiddenThemeStarts(new Set([13]))` before resolving GET with `[7]`.

- [ ] **Step 2: Run the hook test and confirm failure**

Run: `npm test -- src/adventure/v2/useDungeonThemeVisibility.test.tsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the hook**

Initialize from local storage after mount, track `updatedLocallyRef`, and use this write path:

```ts
const update = useCallback((next: Set<number>) => {
  const normalized = normalizeHiddenThemeStarts([...next]);
  updatedLocallyRef.current = true;
  writeLocal(normalized);
  setHiddenThemeStarts(new Set(normalized));
  void persist(normalized);
}, []);
```

If GET returns `null`, PATCH the locally loaded value. If GET returns an array and no local edit has occurred, replace state and local cache. Swallow network/storage errors.

- [ ] **Step 4: Replace the list's inline storage effects with the hook**

Keep `toggleHiddenTheme` pure. Route all checkbox changes and “전체 표시” actions through the hook setter; do not alter card filtering or layout.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/adventure/v2/useDungeonThemeVisibility.test.tsx src/adventure/v2/V2DungeonList.test.ts src/adventure/v2/V2DungeonList.render.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the client unit**

```bash
git add src/adventure/v2/useDungeonThemeVisibility.ts src/adventure/v2/useDungeonThemeVisibility.test.tsx src/adventure/v2/V2DungeonList.tsx
git commit -m "feat: sync dungeon visibility across devices"
```
