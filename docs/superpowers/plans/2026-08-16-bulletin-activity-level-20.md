# Bulletin Activity Level 20 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing bulletin activity progression from Lv.10 to Lv.20, preserve all existing activity credit, and add permanent cosmetic titles at Lv.15 and Lv.20.

**Architecture:** Keep the existing derived-data model: bulletin rows are aggregated into counters, `deriveBulletinActivity` maps points through one static level table, and the existing best-effort title synchronizer grants every eligible milestone. Extend only the level/reward catalogs and the badge style catalog; keep the database, API shape, scoring SQL, and activity card component structure unchanged.

**Tech Stack:** TypeScript 5, React 19 server rendering tests, Vitest 4, Tailwind CSS 4, Next.js 16 application code.

## Global Constraints

- Scope is the existing bulletin activity level only; do not create a combined chat, guild, or profile community level.
- Keep Lv.1–10 thresholds, rank names, title rewards, point weights, and daily credit limits unchanged.
- Use the approved Lv.11–20 thresholds and rank names exactly; Lv.20 starts at 2,610 points.
- Add cosmetic title rewards only at Lv.15 (`bulletin_elder`) and Lv.20 (`bulletin_legend`).
- Existing accumulated activity is retroactive because level remains derived from current bulletin rows.
- Do not add a migration, stored level column, API field, gameplay-stat reward, currency reward, or item reward.
- Preserve opaque `Card` and `SURFACE_INSET` surfaces in the activity UI.
- Preserve unrelated working-tree changes and untracked files; stage only files named in each task.
- Do not deploy.

---

## File Structure

- `src/lib/bulletinActivity.ts`: point normalization, static Lv.1–20 catalog, milestone reward catalog, and derived progress.
- `src/lib/bulletinActivity.test.ts`: boundary, cap, retroactive derivation, and milestone catalog behavior.
- `src/adventure/data/titles.ts`: canonical definitions for the two new equippable titles.
- `src/lib/server/bulletinActivityTitles.test.ts`: best-effort title synchronization behavior at Lv.20.
- `src/adventure/bulletin/BulletinActivityCard.test.tsx`: user-visible next-level and next-title text driven by the extended catalogs.
- `src/adventure/bulletin/BulletinActivityBadge.tsx`: static badge style catalog and safe level clamping.
- `src/adventure/bulletin/BulletinActivityBadge.test.tsx`: twenty-level visual distinction, Lv.20 rendering, and out-of-range clamping.

### Task 1: Extend activity levels and milestone titles

**Files:**
- Modify: `src/lib/bulletinActivity.test.ts`
- Modify: `src/lib/server/bulletinActivityTitles.test.ts`
- Modify: `src/adventure/bulletin/BulletinActivityCard.test.tsx`
- Modify: `src/lib/bulletinActivity.ts`
- Modify: `src/adventure/data/titles.ts`

**Interfaces:**
- Consumes: `deriveBulletinActivity(BulletinActivityBreakdown): BulletinActivitySummary` and `bulletinActivityTitleIdsForLevel(level: number): string[]`.
- Produces: `BULLETIN_ACTIVITY_LEVELS` with Lv.1–20 and `BULLETIN_ACTIVITY_TITLE_REWARDS` containing the existing four rewards plus Lv.15/Lv.20.

- [ ] **Step 1: Write failing domain and UI behavior tests**

In `src/lib/bulletinActivity.test.ts`, replace the Lv.10 cap expectation and add a literal boundary table. Derive points with `creditedComments` so expected values do not reuse production helpers:

```ts
const NEW_LEVEL_BOUNDARIES = [
  { minPoints: 585, level: 11, title: "길잡이", previousLevel: 10 },
  { minPoints: 730, level: 12, title: "기록가", previousLevel: 11 },
  { minPoints: 895, level: 13, title: "경청자", previousLevel: 12 },
  { minPoints: 1_080, level: 14, title: "중재자", previousLevel: 13 },
  { minPoints: 1_285, level: 15, title: "원로", previousLevel: 14 },
  { minPoints: 1_510, level: 16, title: "연대기 작가", previousLevel: 15 },
  { minPoints: 1_755, level: 17, title: "명망가", previousLevel: 16 },
  { minPoints: 2_020, level: 18, title: "광장의 등불", previousLevel: 17 },
  { minPoints: 2_305, level: 19, title: "산증인", previousLevel: 18 },
  { minPoints: 2_610, level: 20, title: "전설", previousLevel: 19 },
] as const;

it.each(NEW_LEVEL_BOUNDARIES)(
  "$minPoints점에서 Lv.$level $title에 도달한다",
  ({ minPoints, level, title, previousLevel }) => {
    expect(deriveBulletinActivity({
      creditedPosts: 0,
      creditedComments: minPoints - 1,
      receivedLikes: 0,
    }).level).toBe(previousLevel);
    expect(deriveBulletinActivity({
      creditedPosts: 0,
      creditedComments: minPoints,
      receivedLikes: 0,
    })).toMatchObject({ level, title, levelStartPoints: minPoints });
  },
);

it("2,610점 이상을 Lv.20으로 제한한다", () => {
  expect(deriveBulletinActivity({
    creditedPosts: 1_000,
    creditedComments: 1_000,
    receivedLikes: 1_000,
  })).toMatchObject({
    level: 20,
    title: "전설",
    levelStartPoints: 2_610,
    nextLevelPoints: null,
    progressPct: 100,
  });
});
```

Extend the milestone assertion with literal outputs:

```ts
expect(bulletinActivityTitleIdsForLevel(14)).toEqual([
  "bulletin_storyteller",
  "bulletin_regular",
  "bulletin_adviser",
  "bulletin_keeper",
]);
expect(bulletinActivityTitleIdsForLevel(15)).toEqual([
  "bulletin_storyteller",
  "bulletin_regular",
  "bulletin_adviser",
  "bulletin_keeper",
  "bulletin_elder",
]);
expect(bulletinActivityTitleIdsForLevel(20)).toEqual([
  "bulletin_storyteller",
  "bulletin_regular",
  "bulletin_adviser",
  "bulletin_keeper",
  "bulletin_elder",
  "bulletin_legend",
]);
```

In `src/lib/server/bulletinActivityTitles.test.ts`, add:

```ts
it("Lv.20에서는 미보유 상위 이정표 칭호만 순서대로 지급한다", async () => {
  mocks.rows = [{
    value: {
      titles: {
        bulletin_storyteller: { obtainedAt: 1 },
        bulletin_regular: { obtainedAt: 2 },
        bulletin_adviser: { obtainedAt: 3 },
        bulletin_keeper: { obtainedAt: 4 },
      },
    },
  }];
  const activity = deriveBulletinActivity({
    creditedPosts: 0,
    creditedComments: 2_610,
    receivedLikes: 0,
  });

  const granted = await syncBulletinActivityTitles("u1", activity, 456);

  expect(activity.level).toBe(20);
  expect(granted).toEqual(["bulletin_elder", "bulletin_legend"]);
  expect(mocks.grantTitleIfMissingInTx).toHaveBeenNthCalledWith(
    1, mocks.tx, "u1", "bulletin_elder", 456,
  );
  expect(mocks.grantTitleIfMissingInTx).toHaveBeenNthCalledWith(
    2, mocks.tx, "u1", "bulletin_legend", 456,
  );
});
```

In `src/adventure/bulletin/BulletinActivityCard.test.tsx`, add three real-render tests:

```tsx
it("Lv.10에서는 Lv.11 진행도와 Lv.15 칭호를 안내한다", () => {
  const html = renderToStaticMarkup(
    <BulletinActivityCard activity={deriveBulletinActivity({
      creditedPosts: 0,
      creditedComments: 460,
      receivedLikes: 0,
    })} />,
  );
  expect(html).toContain("460 / 585점");
  expect(html).toContain("다음 칭호 · Lv.15 ‘광장 원로’");
});

it("Lv.15에서는 Lv.20 칭호를 안내한다", () => {
  const html = renderToStaticMarkup(
    <BulletinActivityCard activity={deriveBulletinActivity({
      creditedPosts: 0,
      creditedComments: 1_285,
      receivedLikes: 0,
    })} />,
  );
  expect(html).toContain("다음 칭호 · Lv.20 ‘광장의 전설’");
});

it("Lv.20에서는 최고 레벨과 모든 칭호 해금을 안내한다", () => {
  const html = renderToStaticMarkup(
    <BulletinActivityCard activity={deriveBulletinActivity({
      creditedPosts: 0,
      creditedComments: 2_610,
      receivedLikes: 0,
    })} />,
  );
  expect(html).toContain("최고 레벨");
  expect(html).toContain("게시판 칭호 보상을 모두 해금했습니다.");
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/lib/bulletinActivity.test.ts src/lib/server/bulletinActivityTitles.test.ts src/adventure/bulletin/BulletinActivityCard.test.tsx
```

Expected: FAIL because 585+ points still cap at Lv.10, the new title IDs are absent, and Lv.10 still renders as the maximum level.

- [ ] **Step 3: Add the approved level and reward catalogs**

Append these entries to `BULLETIN_ACTIVITY_LEVELS` in `src/lib/bulletinActivity.ts`:

```ts
  { level: 11, minPoints: 585, title: "길잡이" },
  { level: 12, minPoints: 730, title: "기록가" },
  { level: 13, minPoints: 895, title: "경청자" },
  { level: 14, minPoints: 1_080, title: "중재자" },
  { level: 15, minPoints: 1_285, title: "원로" },
  { level: 16, minPoints: 1_510, title: "연대기 작가" },
  { level: 17, minPoints: 1_755, title: "명망가" },
  { level: 18, minPoints: 2_020, title: "광장의 등불" },
  { level: 19, minPoints: 2_305, title: "산증인" },
  { level: 20, minPoints: 2_610, title: "전설" },
```

Append these entries to `BULLETIN_ACTIVITY_TITLE_REWARDS`:

```ts
  { level: 15, titleId: "bulletin_elder", name: "광장 원로" },
  { level: 20, titleId: "bulletin_legend", name: "광장의 전설" },
```

Add canonical title definitions to `src/adventure/data/titles.ts`:

```ts
  bulletin_elder: {
    id: "bulletin_elder",
    name: "광장 원로",
    description: "오랜 시간 광장의 이야기를 듣고 사람들의 자리를 이어 준 원로.",
    condition: "게시판 활동 Lv.15 달성",
    category: "town",
  },
  bulletin_legend: {
    id: "bulletin_legend",
    name: "광장의 전설",
    description: "수많은 이야기와 인연으로 광장의 역사를 함께 써 내려간 전설.",
    condition: "게시판 활동 Lv.20 달성",
    category: "town",
  },
```

Do not modify scoring constants, normalization, SQL, API types, or `BulletinActivityCard.tsx`; its next-level and next-reward text updates from the catalogs.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same focused Vitest command from Step 2.

Expected: all tests PASS with no warnings.

- [ ] **Step 5: Commit the domain extension**

```bash
git add src/lib/bulletinActivity.ts src/lib/bulletinActivity.test.ts src/adventure/data/titles.ts src/lib/server/bulletinActivityTitles.test.ts src/adventure/bulletin/BulletinActivityCard.test.tsx
git commit -m "feat(community): extend bulletin activity to level 20"
```

### Task 2: Add upper-tier badge styling

**Files:**
- Modify: `src/adventure/bulletin/BulletinActivityBadge.test.tsx`
- Modify: `src/adventure/bulletin/BulletinActivityBadge.tsx`

**Interfaces:**
- Consumes: `BulletinActivitySummary.level` values from 1 through 20.
- Produces: `bulletinActivityBadgeClass(level: number): string` with twenty distinguishable static Tailwind class strings and safe clamping to Lv.1/Lv.20.

- [ ] **Step 1: Write failing badge behavior tests**

Update the distinct-style and clamping tests, then add a real-render Lv.20 assertion:

```tsx
it("레벨 1~20에 서로 다른 배지 스타일을 적용한다", () => {
  const classes = Array.from({ length: 20 }, (_, index) =>
    bulletinActivityBadgeClass(index + 1),
  );
  expect(new Set(classes).size).toBe(20);
  expect(classes[0]).toContain("emerald");
  expect(classes[19]).toContain("amber");
});

it("범위를 벗어난 레벨은 양 끝 스타일로 제한한다", () => {
  expect(bulletinActivityBadgeClass(0)).toBe(bulletinActivityBadgeClass(1));
  expect(bulletinActivityBadgeClass(99)).toBe(bulletinActivityBadgeClass(20));
});

it("최고 레벨 배지에는 전설 등급과 금색 상위 스타일을 표시한다", () => {
  const html = renderToStaticMarkup(
    <BulletinActivityBadge
      activity={deriveBulletinActivity({
        creditedPosts: 0,
        creditedComments: 2_610,
        receivedLikes: 0,
      })}
      showTitle
    />,
  );
  expect(html).toContain("Lv.20 전설");
  expect(html).toContain("border-amber-500");
  expect(html).toContain("ring-2");
});
```

- [ ] **Step 2: Run the badge test and verify RED**

Run:

```bash
npm test -- src/adventure/bulletin/BulletinActivityBadge.test.tsx
```

Expected: FAIL because the style catalog has only ten entries and Lv.11–20 clamp to the old Lv.10 amber style.

- [ ] **Step 3: Append ten static upper-tier styles**

Keep the first ten `LEVEL_BADGE_CLASS` entries byte-for-byte unchanged and append these literal Lv.11–20 entries so Tailwind discovers every class at build time:

```ts
  "border-emerald-500 bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300 dark:border-emerald-500 dark:bg-emerald-900 dark:text-emerald-100 dark:ring-emerald-700",
  "border-teal-500 bg-teal-100 text-teal-950 ring-1 ring-teal-300 dark:border-teal-500 dark:bg-teal-900 dark:text-teal-100 dark:ring-teal-700",
  "border-cyan-500 bg-cyan-100 text-cyan-950 ring-1 ring-cyan-300 dark:border-cyan-500 dark:bg-cyan-900 dark:text-cyan-100 dark:ring-cyan-700",
  "border-sky-500 bg-sky-100 text-sky-950 ring-1 ring-sky-300 dark:border-sky-500 dark:bg-sky-900 dark:text-sky-100 dark:ring-sky-700",
  "border-blue-500 bg-blue-100 text-blue-950 ring-1 ring-blue-300 dark:border-blue-500 dark:bg-blue-900 dark:text-blue-100 dark:ring-blue-700",
  "border-indigo-500 bg-indigo-100 text-indigo-950 ring-1 ring-indigo-300 dark:border-indigo-500 dark:bg-indigo-900 dark:text-indigo-100 dark:ring-indigo-700",
  "border-violet-500 bg-violet-100 text-violet-950 ring-1 ring-violet-300 dark:border-violet-500 dark:bg-violet-900 dark:text-violet-100 dark:ring-violet-700",
  "border-fuchsia-500 bg-fuchsia-100 text-fuchsia-950 ring-1 ring-fuchsia-300 dark:border-fuchsia-500 dark:bg-fuchsia-900 dark:text-fuchsia-100 dark:ring-fuchsia-700",
  "border-rose-500 bg-rose-100 text-rose-950 ring-1 ring-rose-300 dark:border-rose-500 dark:bg-rose-900 dark:text-rose-100 dark:ring-rose-700",
  "border-amber-500 bg-amber-200 text-amber-950 ring-2 ring-amber-300 shadow-sm dark:border-amber-400 dark:bg-amber-900 dark:text-amber-50 dark:ring-amber-600",
```

The existing clamp based on `LEVEL_BADGE_CLASS.length` then automatically clamps above-range inputs to Lv.20.

- [ ] **Step 4: Run the badge test and verify GREEN**

Run the same focused Vitest command from Step 2.

Expected: all badge tests PASS with no warnings.

- [ ] **Step 5: Commit the badge extension**

```bash
git add src/adventure/bulletin/BulletinActivityBadge.tsx src/adventure/bulletin/BulletinActivityBadge.test.tsx
git commit -m "feat(community): style upper bulletin activity levels"
```

### Task 3: Verify the complete extension

**Files:**
- Verify only; do not modify files unless a verification failure exposes a requirement gap.

**Interfaces:**
- Consumes: the completed Lv.20 domain and badge changes from Tasks 1–2.
- Produces: fresh evidence that the approved design works and existing behavior remains intact.

- [ ] **Step 1: Run all directly related tests**

```bash
npm test -- src/lib/bulletinActivity.test.ts src/lib/server/bulletinActivityTitles.test.ts src/adventure/bulletin/BulletinActivityCard.test.tsx src/adventure/bulletin/BulletinActivityBadge.test.tsx
```

Expected: all related tests PASS.

- [ ] **Step 2: Run TypeScript and focused ESLint checks**

```bash
npx tsc --noEmit
npx eslint src/lib/bulletinActivity.ts src/lib/bulletinActivity.test.ts src/lib/server/bulletinActivityTitles.test.ts src/adventure/data/titles.ts src/adventure/bulletin/BulletinActivityCard.test.tsx src/adventure/bulletin/BulletinActivityBadge.tsx src/adventure/bulletin/BulletinActivityBadge.test.tsx
```

Expected: both commands exit 0 with no errors or warnings.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: the full Vitest suite exits 0 with no failures.

- [ ] **Step 4: Review commits and working tree isolation**

```bash
git diff HEAD~2..HEAD --check
git diff HEAD~2..HEAD --stat
git status --short
```

Expected: the two implementation commits contain only the seven implementation/test files listed above. Pre-existing unrelated changes and untracked files remain unstaged and unchanged.

- [ ] **Step 5: Confirm deployment was not performed**

Do not run deployment, maintenance, push, merge, or PR commands. Report the two implementation commit hashes and the verification evidence to the user.
