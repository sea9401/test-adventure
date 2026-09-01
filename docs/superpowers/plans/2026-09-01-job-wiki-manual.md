# Job Wiki Manual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임 안내서에서 전투·생활을 포함한 전체 직업을 검색하고, 각 직업의 계보·성장·전체 스킬·주문식 변형·장착 시너지를 위키형 정적 페이지로 확인할 수 있게 한다.

**Architecture:** React와 무관한 `jobManualModel`이 기존 직업·스킬 카탈로그를 읽어 목록/상세 모델을 생성한다. `/manual/jobs`에는 작은 클라이언트 검색 컴포넌트만 추가하고, `/manual/jobs/[jobId]`는 전체 카탈로그를 `generateStaticParams`로 정적 생성하는 서버 페이지로 둔다. 스킬 변형 효과도 기존 효과 포매터를 공유하도록 `describeV2Effects`를 공개해 숫자의 단일 진실 출처를 유지한다.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript 5, Tailwind CSS 4, Vitest 4, Testing Library

## Global Constraints

- 현재 프로젝트의 Next.js API를 추측하지 말고 `node_modules/next/dist/docs/`의 동적 라우트와 `generateStaticParams` 문서를 따른다.
- 전투·생활 직업을 포함한 `V2_JOB_LIST` 전체를 로그인과 해금 여부에 관계없이 공개한다.
- 게임에 없는 설정 문구, 추정 공식, 숨은 효과를 만들지 않는다.
- 밸런스 수치와 관계를 매뉴얼용 상수로 복사하지 않고 기존 카탈로그와 포매터에서 파생한다.
- `/manual/jobs`의 기존 전직·숙련도·수행 안내는 유지한다.
- 모든 본문과 중첩 카드는 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`의 불투명 표면을 사용한다.
- 라이트·다크 모드와 모바일 한 열 레이아웃에서 배경 이미지가 카드 뒤로 비치지 않아야 한다.
- 기존 사용자 변경을 보존하고, 이 계획에 속한 파일만 단계별로 커밋한다.
- 배포하지 않는다.

---

## File Structure

- `src/adventure/data/v2/v2Skills.ts`: 기본 스킬과 변형·시너지 효과가 공유할 공개 효과 설명 함수 제공
- `src/adventure/data/v2/v2Skills.test.ts`: 공개 효과 설명 함수의 다단·상태 효과 회귀 검증
- `src/app/manual/jobManualModel.ts`: 전체 직업 관계·분류·성장·스킬 상세를 만드는 React 비의존 순수 모델
- `src/app/manual/jobManualModel.test.ts`: 전체 카탈로그 무결성, 관계, 변형·시너지, 대표 직업 모델 검증
- `src/app/manual/content/JobWikiIndex.tsx`: 직업명·스킬명 검색과 전투/생활·직군·차수 필터 UI
- `src/app/manual/content/JobWikiIndex.test.tsx`: 필터 모델과 접근 가능한 목록 렌더 검증
- `src/app/manual/content/jobs.tsx`: 기존 직업 안내 하단에 전체 직업 도감 삽입
- `src/app/manual/current-content.test.tsx`: 기존 내용 보존과 도감 진입점 통합 검증
- `src/app/manual/jobs/[jobId]/JobManualContent.tsx`: 직업 하나의 관계·성장·스킬·변형·시너지 표시
- `src/app/manual/jobs/[jobId]/JobManualContent.test.tsx`: 일반·복합·7차·생활 직업 상세 렌더 검증
- `src/app/manual/jobs/[jobId]/page.tsx`: 정적 경로, 메타데이터, 404와 `ManualLayout` 연결
- `src/app/manual/jobs/[jobId]/page.test.tsx`: 전체 정적 파라미터와 대표 메타데이터 검증

---

### Task 1: Shared effect descriptions and authoritative job manual model

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts:1952-2675`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`
- Create: `src/app/manual/jobManualModel.ts`
- Create: `src/app/manual/jobManualModel.test.ts`

**Interfaces:**
- Consumes: `V2_JOB_LIST`, `V2_JOB_CATALOG`, `skillsForJob`, `V2_SKILLS`, `describeV2Skill`, `spCostOf`, `v2SkillLearnCost`, `V2_STAT_LABELS`
- Produces: `describeV2Effects(effects, tier, monsterOnly?) => string[]`
- Produces: `buildJobManualIndex(): JobManualIndexEntry[]`
- Produces: `buildJobManualEntry(jobId: string): JobManualEntry | null`
- Produces: `jobManualStaticParams(): Array<{ jobId: string }>`

- [x] **Step 1: Write failing tests for reusable effect formatting**

Add a focused test to `v2Skills.test.ts` proving a variant effect array can be described without adding the parent skill's MP, cooldown, or proc metadata:

```ts
it("describeV2Effects는 변형 효과만 전투 수식으로 설명한다", () => {
  const variant = V2_SKILLS.v2c_primordialmage_return.castVariants?.[0];
  expect(variant).toBeDefined();

  const lines = describeV2Effects(variant!.effects, 3);

  expect(lines.some((line) => line.startsWith("피해 마법 공격력×"))).toBe(true);
  expect(lines).toContain("연소 지속피해 +1스택 (대상 행동 2회, 최대 1스택)");
  expect(lines.some((line) => line.startsWith("MP "))).toBe(false);
  expect(lines.some((line) => line.startsWith("발동 "))).toBe(false);
});
```

- [x] **Step 2: Run the effect formatter test and verify RED**

Run:

```bash
npm test -- src/adventure/data/v2/v2Skills.test.ts
```

Expected: FAIL because `describeV2Effects` is not exported.

- [x] **Step 3: Extract the reusable effect formatter**

In `v2Skills.ts`, move the poison display reordering and direct-damage-count logic from `describeV2Skill` into:

```ts
export function describeV2Effects(
  effects: readonly V2SkillEffect[],
  tier: 1 | 2 | 3,
  monsterOnly = false,
): string[];
```

It must preserve the current poison payoff display order, add an `N회 공격` prefix for multiple direct effects, and call the existing `describeMissingHpDamage`/`describeV2Effect` logic. Make `describeV2Skill` use this function for non-passive skills so current tooltips and the manual share identical formulas.

- [x] **Step 4: Run the skill tests and verify GREEN**

Run:

```bash
npm test -- src/adventure/data/v2/v2Skills.test.ts
```

Expected: PASS with all existing tooltip tests unchanged.

- [x] **Step 5: Write failing model tests**

Create `jobManualModel.test.ts` with these assertions:

```ts
describe("job manual model", () => {
  it("includes every catalog job and static route exactly once", () => {
    const index = buildJobManualIndex();
    expect(index.map((job) => job.id)).toEqual(V2_JOB_LIST.map((job) => job.id));
    expect(jobManualStaticParams()).toEqual(
      V2_JOB_LIST.map((job) => ({ jobId: job.id })),
    );
  });

  it("builds forward and reverse links for a hybrid job", () => {
    const templar = buildJobManualEntry("templar")!;
    expect(templar.prerequisites.map((job) => job.name)).toEqual([
      "기사",
      "사제",
    ]);
    expect(templar.classification.line).toBe("hybrid");
    expect(templar.nextJobs.length).toBeGreaterThan(0);
  });

  it("expands primordial spell variants and equipped synergies", () => {
    const primordial = buildJobManualEntry("primordialmage")!;
    const skill = primordial.skills.find((entry) => entry.name === "태초회귀")!;
    expect(skill.variants[0]?.name).toBe("개벽·오원소 회귀");
    expect(skill.variants[0]?.requiredEquippedSkillNames).toContain("홍련술");
    expect(skill.synergies.some((entry) =>
      entry.requiredSkillNames.includes("근원공명") &&
      entry.requiredSkillNames.includes("오원소 폭주"),
    )).toBe(true);
    expect(skill.variants[0]?.effectLines.some((line) => line.startsWith("피해 "))).toBe(true);
  });

  it("returns null for an unknown job", () => {
    expect(buildJobManualEntry("missing-job")).toBeNull();
  });
});
```

Also iterate every `skillsForJob(job.id)` and assert each ID resolves in `V2_SKILLS`; include the job ID in the assertion message.

- [x] **Step 6: Run model tests and verify RED**

Run:

```bash
npm test -- src/app/manual/jobManualModel.test.ts
```

Expected: FAIL because `jobManualModel.ts` does not exist.

- [x] **Step 7: Implement the pure model**

Define explicit serializable types for:

```ts
type JobManualKind = "combat" | "life";
type JobManualLine =
  | "adventurer"
  | "warrior"
  | "martial"
  | "mage"
  | "rogue"
  | "survivor"
  | "mutant"
  | "hybrid";

type JobManualRelation = {
  id: string;
  name: string;
  requiredMastery: number | null;
};

type JobManualIndexEntry = {
  id: string;
  name: string;
  tier: number;
  kind: JobManualKind;
  line: JobManualLine;
  lineLabel: string;
  primaryStats: string[];
  skillNames: string[];
  searchText: string;
};
```

`JobManualEntry` extends the index data with `summary`, `unlockText`, `prerequisites`, `nextJobs`, `jobBonuses`, `cultivation`, and `skills`. Each skill contains base detail lines plus `variants` and `synergies`, with requirement IDs/names and effect lines.

Classification rules:

1. `isLifestyleMasteryJobId(job.id)` selects `kind: "life"`.
2. More than one distinct combat root among prerequisite ancestry selects `line: "hybrid"`.
3. Otherwise use the legacy class mapping/root ancestry for warrior, martial, mage, rogue, survivor, or mutant.
4. The `none` root uses the dedicated adventurer line; other root jobs keep their own line.

Use `describeV2Effects` for variant/synergy effect arrays. Do not throw for unknown `jobId`; return `null` so the route decides 404. Do throw an invariant error when a catalog job references a missing skill definition, because silently omitting it violates the spec.

- [x] **Step 8: Run model and catalog tests and verify GREEN**

Run:

```bash
npm test -- src/app/manual/jobManualModel.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts
```

Expected: PASS.

- [x] **Step 9: Commit Task 1**

```bash
git add src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts src/app/manual/jobManualModel.ts src/app/manual/jobManualModel.test.ts
git commit -m "feat: build authoritative job manual models"
```

---

### Task 2: Searchable job wiki index in the existing jobs manual

**Files:**
- Create: `src/app/manual/content/JobWikiIndex.tsx`
- Create: `src/app/manual/content/JobWikiIndex.test.tsx`
- Modify: `src/app/manual/content/jobs.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: `JobManualIndexEntry[]` from `buildJobManualIndex()`
- Produces: `filterJobManualIndex(entries, filters): JobManualIndexEntry[]`
- Produces: `<JobWikiIndex entries={entries} />`

- [x] **Step 1: Write failing filter and render tests**

Create tests that pass a small fixture containing a mage combat job, warrior combat job, and fishing life job:

```ts
expect(filterJobManualIndex(entries, {
  query: "태초회귀",
  kind: "all",
  line: "all",
  tier: "all",
}).map((job) => job.id)).toEqual(["primordialmage"]);

expect(filterJobManualIndex(entries, {
  query: "",
  kind: "life",
  line: "all",
  tier: "all",
}).map((job) => job.id)).toEqual(["fisher"]);
```

Render `<JobWikiIndex>` and assert the search label, filter group labels, `3개 중 3개`, and `/manual/jobs/primordialmage` link. Interact with the search input and assert the visible result count changes. Render a no-match query and assert the reset guidance appears.

Add a `current-content.test.tsx` assertion that `JobsContent` still contains `직군과 직업 사다리`, `숙련의 탑`, and now `전체 직업 도감`.

- [x] **Step 2: Run the index tests and verify RED**

Run:

```bash
npm test -- src/app/manual/content/JobWikiIndex.test.tsx src/app/manual/current-content.test.tsx
```

Expected: FAIL because the component and heading are absent.

- [x] **Step 3: Implement filtering and index UI**

Make `JobWikiIndex.tsx` a client component. Keep filters in local state:

```ts
type JobWikiFilters = {
  query: string;
  kind: "all" | JobManualKind;
  line: "all" | JobManualLine;
  tier: "all" | number;
};
```

Normalize search with `trim().toLocaleLowerCase("ko-KR")`; apply query, kind, line, and tier as an intersection. Search only the prebuilt `searchText` containing job ID/name and skill names.

Render:

- labeled search input
- accessible button groups with `aria-pressed`
- visible `N개 중 M개` result count
- reset button when any filter is active
- compact opaque cards linking to `/manual/jobs/${id}`
- empty-state explanation and reset action

Use `SURFACE_INSET` for controls and `SURFACE_CARD` for each job card. Cards show name, tier/kind/line badges, primary stats and skill names, but not full effects.

- [x] **Step 4: Insert the index into `JobsContent`**

At the end of the existing content, add an `H2` titled `전체 직업 도감`, a short paragraph explaining all information is public and data-driven, then render:

```tsx
<JobWikiIndex entries={buildJobManualIndex()} />
```

Do not remove or reorder the existing roadmap, mastery, tower, and cultivation explanations.

- [x] **Step 5: Run index/manual tests and verify GREEN**

Run:

```bash
npm test -- src/app/manual/content/JobWikiIndex.test.tsx src/app/manual/current-content.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit Task 2**

```bash
git add src/app/manual/content/JobWikiIndex.tsx src/app/manual/content/JobWikiIndex.test.tsx src/app/manual/content/jobs.tsx src/app/manual/current-content.test.tsx
git commit -m "feat: add searchable job manual index"
```

---

### Task 3: Static per-job wiki pages

**Files:**
- Create: `src/app/manual/jobs/[jobId]/JobManualContent.tsx`
- Create: `src/app/manual/jobs/[jobId]/JobManualContent.test.tsx`
- Create: `src/app/manual/jobs/[jobId]/page.tsx`
- Create: `src/app/manual/jobs/[jobId]/page.test.tsx`

**Interfaces:**
- Consumes: `buildJobManualEntry(jobId)` and `jobManualStaticParams()`
- Produces: `<JobManualContent entry={entry} />`
- Produces: `generateStaticParams()`, `generateMetadata({ params })`, default async page

- [x] **Step 1: Write failing detail renderer tests**

Render `JobManualContent` for representative real models:

```ts
const primordial = buildJobManualEntry("primordialmage")!;
const html = renderToStaticMarkup(<JobManualContent entry={primordial} />);
expect(html).toContain("선행 필수 직업");
expect(html).toContain("후행 가능 직업");
expect(html).toContain("태초회귀");
expect(html).toContain("개벽·오원소 회귀");
expect(html).toContain("필요 장착 스킬");
expect(html).toContain("장착 시너지");
```

Add cases for `templar` (multiple prerequisites), `primordialsage` (tier 7/PvP detail), a lifestyle job such as `legendarychef`, and the `none` root job. Assert all cards use one of the approved surface constants and no `opacity-` class is placed on card containers.

- [x] **Step 2: Run detail renderer tests and verify RED**

Run:

```bash
npm test -- 'src/app/manual/jobs/[jobId]/JobManualContent.test.tsx'
```

Expected: FAIL because `JobManualContent` does not exist.

- [x] **Step 3: Implement the detail content**

Render in this order:

1. `/manual/jobs` back link
2. tier/line/kind badges and data-derived summary
3. prerequisite and non-job unlock condition cards
4. next-job link cards
5. job bonus and cultivation definition lists
6. all skill cards
7. bottom navigation to prerequisite/next jobs and index

Skill cards keep name, kind, SP/learn cost/stat/tier metadata, catalog description, and base effect lines always visible. Only variants and synergies use `<details>`. Each variant shows required learned skills, required equipped skills, and effect lines. Each synergy shows required skills and effect lines. Use semantic headings, lists, `dl`, and links rather than visual-only div structures.

- [x] **Step 4: Write failing route tests**

Test that:

```ts
expect(generateStaticParams()).toEqual(jobManualStaticParams());
const metadata = await generateMetadata({
  params: Promise.resolve({ jobId: "primordialmage" }),
});
expect(metadata.title).toContain("태초술사");
expect(metadata.alternates?.canonical).toBe("/manual/jobs/primordialmage");
```

Render the resolved default page for `primordialmage` and assert the manual title and detail content are present. Mock `next/navigation`'s `notFound` with a throwing sentinel and assert an unknown ID takes that path.

- [x] **Step 5: Run route tests and verify RED**

Run:

```bash
npm test -- 'src/app/manual/jobs/[jobId]/page.test.tsx'
```

Expected: FAIL because the route does not exist.

- [x] **Step 6: Implement the static route and metadata**

Follow the installed Next.js 16 docs:

```ts
export const dynamicParams = false;

export function generateStaticParams() {
  return jobManualStaticParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ jobId: string }>;
}): Promise<Metadata> {
  const { jobId } = await params;
  const entry = buildJobManualEntry(jobId);
  if (!entry) return { title: "직업 정보 · 게임 안내서", robots: { index: false, follow: false } };
  return {
    title: `${entry.name} · 직업 도감 · 게임 안내서`,
    description: entry.summary,
    alternates: { canonical: `/manual/jobs/${entry.id}` },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      siteName: "무슨무슨게임",
      title: `${entry.name} · 직업 도감`,
      description: entry.summary,
      url: `/manual/jobs/${entry.id}`,
      locale: "ko_KR",
    },
  };
}
```

The default page awaits `params`, calls `buildJobManualEntry`, invokes `notFound()` for null, and wraps `JobManualContent` in `ManualLayout` with `currentSlug="jobs"`.

- [x] **Step 7: Run detail and route tests and verify GREEN**

Run:

```bash
npm test -- 'src/app/manual/jobs/[jobId]/JobManualContent.test.tsx' 'src/app/manual/jobs/[jobId]/page.test.tsx'
```

Expected: PASS.

- [x] **Step 8: Commit Task 3**

```bash
git add 'src/app/manual/jobs/[jobId]/JobManualContent.tsx' 'src/app/manual/jobs/[jobId]/JobManualContent.test.tsx' 'src/app/manual/jobs/[jobId]/page.tsx' 'src/app/manual/jobs/[jobId]/page.test.tsx'
git commit -m "feat: add static job wiki pages"
```

---

### Task 4: Cross-feature verification and documentation alignment

**Files:**
- Modify only if a failing assertion exposes an actual omission: files created or modified in Tasks 1-3
- Modify: `docs/superpowers/plans/2026-09-01-job-wiki-manual.md` to check completed steps

**Interfaces:**
- Consumes: all Task 1-3 outputs
- Produces: a verified manual feature with no missing catalog references or route gaps

- [x] **Step 1: Run all focused tests**

```bash
npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/app/manual/jobManualModel.test.ts src/app/manual/content/JobWikiIndex.test.tsx src/app/manual/current-content.test.tsx 'src/app/manual/jobs/[jobId]/JobManualContent.test.tsx' 'src/app/manual/jobs/[jobId]/page.test.tsx'
```

Expected: PASS.

- [x] **Step 2: Run targeted lint and TypeScript**

```bash
npx eslint src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts src/app/manual/jobManualModel.ts src/app/manual/jobManualModel.test.ts src/app/manual/content/JobWikiIndex.tsx src/app/manual/content/JobWikiIndex.test.tsx src/app/manual/content/jobs.tsx src/app/manual/current-content.test.tsx 'src/app/manual/jobs/[jobId]/JobManualContent.tsx' 'src/app/manual/jobs/[jobId]/JobManualContent.test.tsx' 'src/app/manual/jobs/[jobId]/page.tsx' 'src/app/manual/jobs/[jobId]/page.test.tsx'
npx tsc --noEmit
```

Expected: both commands exit 0.

- [x] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all test files pass, with only existing intentional skips.

- [x] **Step 4: Run the production build**

```bash
npm run build
```

Expected: image checks, Next.js compilation, static generation for every `/manual/jobs/[jobId]` path, and postbuild checks all exit 0.

- [x] **Step 5: Review rendered surface and mobile contracts**

Confirm from tests and rendered markup that the top-level manual surface and every nested job/skill card uses an approved opaque surface, long effect text wraps, tables scroll within their own container, and no locked-card opacity is present.

- [x] **Step 6: Mark plan checkboxes and commit verification metadata**

```bash
git add docs/superpowers/plans/2026-09-01-job-wiki-manual.md
git commit -m "docs: record job wiki manual implementation"
```
