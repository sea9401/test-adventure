# Mastery Tower Weekly Checkpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KST-weekly 10-floor checkpoints that can be selected for both the first daily climb and post-defeat re-entry without resetting lifetime records or first-clear rewards.

**Architecture:** Extend `MasteryTowerState` with a lazy-reset weekly best and keep all checkpoint arithmetic in the existing pure tower domain module. The status API exposes server-derived start options, the attempt API validates the requested start floor, and the client passes the choice through the battle page query string into the first attempt POST.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Vitest, Tailwind surface tokens

## Global Constraints

- Weekly boundaries are Monday 00:00 KST and are calculated with `kstWeekMondayKey`.
- Only weekly progress resets; lifetime best and first-clear reward history remain permanent.
- A cleared 10-floor boundary unlocks its following floor, with 41 as the final checkpoint start.
- Skipped floors do not update daily best or rewards; only a won battle does.
- Existing floor count, difficulty, rewards, stamina cost, and cooldown remain unchanged.
- New nested panels use `SURFACE_INSET`; no translucent custom card background is introduced.
- Do not deploy or change maintenance mode.

---

### Task 1: Weekly state and checkpoint domain rules

**Files:**
- Modify: `src/adventure/data/v2/masteryTower.ts`
- Test: `src/adventure/data/v2/masteryTower.test.ts`
- Test: `src/lib/server/masteryTowerRollover.test.ts`

**Interfaces:**
- Produces: `weekStartedAt: string` and `weekBestFloor: number` on `MasteryTowerState`.
- Produces: `masteryTowerCheckpointStartFloor(state): number | null`.
- Produces: `resolveMasteryTowerAttemptFloor(state, requestedStartFloor): { ok: true; floor: number } | { ok: false; error: "invalid_start_floor" }`.
- Consumes: `kstWeekMondayKey(now)` from `src/lib/kst.ts`.

- [ ] **Step 1: Write failing domain tests**

Add tests covering current-week parsing, legacy saves, Monday reset, the `0/9 → null`, `10 → 11`, `37 → 31`, `50 → 41` checkpoint table, valid 1/checkpoint starts, invalid starts, and rejection of a start override while `runFloor > 0`. Assert that rollover preserves lifetime and first-clear fields.

```ts
const weekly = parseMasteryTowerState(
  { date: "2026-08-09", weekStartedAt: "2026-08-03", weekBestFloor: 37 },
  "2026-08-09",
  "2026-08-03",
);
expect(masteryTowerCheckpointStartFloor(weekly)).toBe(31);
expect(masteryTowerStartFloors(weekly)).toEqual([1, 31]);
expect(resolveMasteryTowerAttemptFloor(weekly, 31)).toEqual({ ok: true, floor: 31 });
expect(resolveMasteryTowerAttemptFloor(weekly, 27)).toEqual({
  ok: false,
  error: "invalid_start_floor",
});

const monday = parseMasteryTowerState(weekly, "2026-08-10", "2026-08-10");
expect(monday).toMatchObject({
  weekStartedAt: "2026-08-10",
  weekBestFloor: 0,
  lifetimeBestFloor: weekly.lifetimeBestFloor,
  firstClearRewardsClaimed: weekly.firstClearRewardsClaimed,
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- src/adventure/data/v2/masteryTower.test.ts src/lib/server/masteryTowerRollover.test.ts`

Expected: FAIL because weekly fields and checkpoint helpers do not exist.

- [ ] **Step 3: Implement weekly parsing, reset, and checkpoint helpers**

Import `kstWeekMondayKey`, normalize missing or stale weekly fields to the current week with a zero best, preserve the weekly best across daily reset, update it in `clearMasteryTowerFloor`, and leave it untouched in `failMasteryTowerRun`. Cap the checkpoint boundary at `MASTERY_TOWER_MAX_FLOOR - 10` before returning the following floor.

`resolveMasteryTowerAttemptFloor` must return `runFloor + 1` only when no start override is supplied during an active run. For a new run, accept only floor 1 or `masteryTowerCheckpointStartFloor(state)`.

```ts
export function masteryTowerCheckpointStartFloor(
  state: MasteryTowerState,
): number | null;

export function masteryTowerStartFloors(state: MasteryTowerState): number[];

export function resolveMasteryTowerAttemptFloor(
  state: MasteryTowerState,
  requestedStartFloor?: number,
):
  | { ok: true; floor: number }
  | { ok: false; error: "invalid_start_floor" };
```

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `npm test -- src/adventure/data/v2/masteryTower.test.ts src/lib/server/masteryTowerRollover.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the domain change**

```bash
git add src/adventure/data/v2/masteryTower.ts src/adventure/data/v2/masteryTower.test.ts src/lib/server/masteryTowerRollover.test.ts
git commit -m "feat: add weekly mastery tower checkpoints"
```

### Task 2: Server-derived start options and attempt validation

**Files:**
- Modify: `src/app/api/v2/mastery-tower/route.ts`
- Modify: `src/app/api/v2/mastery-tower/attempt/route.ts`
- Test: `src/adventure/data/v2/masteryTower.test.ts`

**Interfaces:**
- Consumes: `masteryTowerCheckpointStartFloor` and `resolveMasteryTowerAttemptFloor` from Task 1.
- Produces from GET: `startOptions: Array<{ floor: number; checkpointFloor: number | null; requiredPower: number; guardian: MasteryTowerGuardianPreview }>`; it is non-empty only when `runFloor === 0`.
- Consumes in POST JSON: optional integer `startFloor`.

- [ ] **Step 1: Add failing assertions for start-option construction and request validation**

Extract a pure `masteryTowerStartFloors(state): number[]` domain helper and assert `[1]` before the first weekly checkpoint, `[1, 31]` at weekly best 37, and `[]` while a run is active. Extend invalid request assertions to cover fractions, strings, arbitrary floors, and an override during an active run.

```ts
expect(masteryTowerStartFloors(state({ weekBestFloor: 9 }))).toEqual([1]);
expect(masteryTowerStartFloors(state({ weekBestFloor: 37 }))).toEqual([1, 31]);
expect(
  masteryTowerStartFloors(state({ runFloor: 12, weekBestFloor: 37 })),
).toEqual([]);
expect(resolveMasteryTowerAttemptFloor(state({ runFloor: 12 }), 1)).toEqual({
  ok: false,
  error: "invalid_start_floor",
});
```

- [ ] **Step 2: Run the domain test and confirm RED**

Run: `npm test -- src/adventure/data/v2/masteryTower.test.ts`

Expected: FAIL because `masteryTowerStartFloors` is missing.

- [ ] **Step 3: Implement GET options and POST validation**

Build GET `startOptions` exclusively from `masteryTowerStartFloors`, `masteryTowerRequiredPower`, and `masteryTowerGuardianPreview`. Parse POST JSON with `{}` fallback, require `startFloor` to be an integer when present, resolve the actual floor on the server, and return HTTP 400 with `invalid_start_floor` before battle simulation for a rejected request.

```ts
const startOptions = masteryTowerStartFloors(tower).map((floor) => ({
  floor,
  checkpointFloor: floor === 1 ? null : floor - 1,
  requiredPower: masteryTowerRequiredPower(floor),
  guardian: masteryTowerGuardianPreview(floor),
}));

const body = (await req.json().catch(() => ({}))) as { startFloor?: unknown };
const requestedStartFloor =
  body.startFloor === undefined
    ? undefined
    : Number.isInteger(body.startFloor)
      ? Number(body.startFloor)
      : Number.NaN;
const resolvedFloor = resolveMasteryTowerAttemptFloor(tower, requestedStartFloor);
if (!resolvedFloor.ok) {
  return { status: 400, body: { ok: false as const, error: resolvedFloor.error } };
}
const floor = resolvedFloor.floor;
```

- [ ] **Step 4: Run focused tower tests and type-check the routes**

Run: `npm test -- src/adventure/data/v2/masteryTower.test.ts src/app/api/v2/mastery-tower/claim/route.test.ts`

Run: `npx tsc --noEmit`

Expected: both commands PASS.

- [ ] **Step 5: Commit the API change**

```bash
git add src/adventure/data/v2/masteryTower.ts src/adventure/data/v2/masteryTower.test.ts src/app/api/v2/mastery-tower/route.ts src/app/api/v2/mastery-tower/attempt/route.ts
git commit -m "feat: validate mastery tower checkpoint starts"
```

### Task 3: Start-position picker and battle handoff

**Files:**
- Modify: `src/adventure/v2/V2MasteryTowerView.tsx`
- Modify: `src/app/(game)/battle/mastery-tower/page.tsx`
- Modify: `src/app/(game)/battle/mastery-tower/battle/page.tsx`
- Modify: `src/adventure/v2/V2MasteryTowerBattleView.tsx`
- Create: `src/adventure/v2/MasteryTowerStartPicker.test.tsx`

**Interfaces:**
- Consumes: GET `startOptions` from Task 2.
- Changes: `onEnterBattle(startFloor?: number): void`.
- Produces: `initialStartFloor?: number` prop on `V2MasteryTowerBattleView`.

- [ ] **Step 1: Write a failing static-render picker test**

Export a focused `MasteryTowerStartPicker` from `V2MasteryTowerView.tsx`. Render it with floor 1 and floor 31 options and assert visible copy `1층부터`, `30층 체크포인트 돌파`, `31층부터 시작`, plus `aria-pressed="true"` on the selected option. Also render a single floor-1 option and assert no checkpoint choice.

```tsx
const html = renderToStaticMarkup(
  <MasteryTowerStartPicker
    options={[
      { floor: 1, checkpointFloor: null },
      { floor: 31, checkpointFloor: 30 },
    ]}
    selectedFloor={31}
    onSelect={() => undefined}
  />,
);
expect(html).toContain("1층부터");
expect(html).toContain("30층 체크포인트 돌파");
expect(html).toContain("31층부터 시작");
expect(html).toContain('aria-pressed="true"');
```

- [ ] **Step 2: Run the picker test and confirm RED**

Run: `npm test -- src/adventure/v2/MasteryTowerStartPicker.test.tsx`

Expected: FAIL because the picker is not exported.

- [ ] **Step 3: Implement the picker and selected target preview**

Default a new run to the latest option, render the two choices with `SURFACE_INSET`, and derive the displayed next floor, required power, and guardian from the selected option. During an active run, keep the existing next-floor display and do not render the picker. Pass the selected start floor from both the main entry button and `더 도전하기`.

```tsx
export function MasteryTowerStartPicker({
  options,
  selectedFloor,
  onSelect,
}: {
  options: Pick<TowerStartOption, "floor" | "checkpointFloor">[];
  selectedFloor: number;
  onSelect: (floor: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="등반 시작 위치">
      {options.map((option) => (
        <button
          key={option.floor}
          type="button"
          aria-pressed={selectedFloor === option.floor}
          onClick={() => onSelect(option.floor)}
          className={SURFACE_INSET}
        >
          {option.checkpointFloor === null
            ? "1층부터"
            : `${option.checkpointFloor}층 체크포인트 돌파 · ${option.floor}층부터 시작`}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Pass the choice through the App Router and first POST**

Navigate to `/battle/mastery-tower/battle?startFloor=N`. Following the installed Next.js 16 page documentation, make the battle page async and await its `searchParams: Promise<...>` before passing an integer to the client component. Send `{ startFloor }` only for the initial attempt; subsequent successful `다음 층 입장` calls send no override.

```tsx
export default async function MasteryTowerBattlePage({
  searchParams,
}: {
  searchParams: Promise<{ startFloor?: string | string[] }>;
}) {
  const raw = (await searchParams).startFloor;
  const startFloor = typeof raw === "string" ? Number(raw) : undefined;
  return (
    <V2MasteryTowerBattleView
      initialStartFloor={Number.isInteger(startFloor) ? startFloor : undefined}
    />
  );
}
```

After defeat, replace direct re-entry with `시작 위치 선택`, returning to the tower page so both choices are available again. Replace fixed `1층부터` cooldown text with checkpoint-aware wording and add a Korean message for `invalid_start_floor`.

- [ ] **Step 5: Run component tests and type-check**

Run: `npm test -- src/adventure/v2/MasteryTowerStartPicker.test.tsx`

Run: `npx tsc --noEmit`

Expected: both commands PASS.

- [ ] **Step 6: Commit the client flow**

```bash
git add src/adventure/v2/V2MasteryTowerView.tsx src/adventure/v2/V2MasteryTowerBattleView.tsx src/adventure/v2/MasteryTowerStartPicker.test.tsx 'src/app/(game)/battle/mastery-tower/page.tsx' 'src/app/(game)/battle/mastery-tower/battle/page.tsx'
git commit -m "feat: choose mastery tower checkpoint starts"
```

### Task 4: Manual copy and final regression verification

**Files:**
- Modify: `src/app/manual/content/jobs.tsx`

**Interfaces:**
- Documents the weekly reset, 10-floor unlock rule, and permanent lifetime/first-clear records.

- [ ] **Step 1: Update the manual**

Add concise bullets explaining that weekly progress resets Monday 00:00 KST, clearing each 10-floor boundary unlocks its next floor for that week, new climbs can start at floor 1 or the latest checkpoint, and permanent records and first-clear bonuses do not reset.

```tsx
<li>
  주간 진행은 매주 월요일 00:00 KST에 초기화됩니다. 그 주에 10층 단위
  체크포인트를 돌파하면 새 등반을 1층 또는 최근 체크포인트의 다음 층에서
  시작할 수 있습니다. 역대 최고층과 최초 돌파 보너스 기록은 초기화되지 않습니다.
</li>
```

- [ ] **Step 2: Run all relevant verification**

Run: `npm test -- src/adventure/data/v2/masteryTower.test.ts src/lib/server/masteryTowerRollover.test.ts src/app/api/v2/mastery-tower/claim/route.test.ts src/adventure/v2/MasteryTowerStartPicker.test.tsx`

Run: `npx tsc --noEmit`

Run: `npm run lint -- --file src/adventure/data/v2/masteryTower.ts --file src/adventure/v2/V2MasteryTowerView.tsx --file src/adventure/v2/V2MasteryTowerBattleView.tsx --file src/app/api/v2/mastery-tower/route.ts --file src/app/api/v2/mastery-tower/attempt/route.ts`

Expected: all commands PASS. If this ESLint version does not support `--file`, run `npx eslint` with the exact changed file paths instead.

- [ ] **Step 3: Inspect the final diff and commit documentation**

Run: `git diff --check` and inspect `git diff --stat` plus `git status --short` to ensure unrelated working-tree changes are excluded.

```bash
git add src/app/manual/content/jobs.tsx
git commit -m "docs: explain mastery tower checkpoints"
```

- [ ] **Step 4: Request code review**

Review the final diff against `docs/superpowers/specs/2026-08-09-mastery-tower-weekly-checkpoints-design.md`, paying particular attention to weekly rollover, invalid start requests, daily reward integrity, and both light/dark opaque surfaces. Address findings, rerun the focused verification, and commit only feature files.
