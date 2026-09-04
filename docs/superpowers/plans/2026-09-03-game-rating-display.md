# Game Rating Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the official 12세이용가 and 폭력성 classification at first game entry and on a permanently accessible public information page.

**Architecture:** A pure `gameRating` module owns all decision data, asset paths, route eligibility, and timing. A client launch-notice component mounts once in the root layout, while a server-rendered public page and two navigation links provide persistent access without an hourly interruption.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library, Sharp.

## Global Constraints

- Use the exact classification number `GC-CC-NP-260903-001` and decision date `2026.09.03`.
- Use production date `2026.08.07`, producer registration `제2026-000005호`, and distributor registration `제2026-000001호`.
- Display only the official `폭력성` content descriptor.
- The launch notice must remain visible for 3.5 seconds and cannot be skipped.
- Use opaque surfaces; no scene background may show through content.
- Do not add age-verification behavior, submit a content-modification report, deploy, or change maintenance mode.
- Preserve all unrelated working-tree changes and stage only files listed by each task.

---

### Task 1: Rating data, official assets, and public information page

**Files:**
- Create: `src/lib/gameRating.ts`
- Create: `src/components/GameRatingInformation.tsx`
- Create: `src/components/GameRatingInformation.test.tsx`
- Create: `src/app/game-info/page.tsx`
- Create: `public/images/rating/12-plus.webp`
- Create: `public/images/rating/violence.webp`
- Modify: `scripts/optimize-images.mjs`
- Modify: `scripts/check-asset-rights.mjs`
- Modify: `docs/asset-rights.json`

**Interfaces:**
- Produces: `GAME_RATING`, `GAME_RATING_NOTICE_MS`, and `isGameEntryPath(pathname: string): boolean` from `src/lib/gameRating.ts`.
- Produces: `GameRatingInformation({ compact?: boolean })` for the launch notice and public page.

- [ ] **Step 1: Write the failing information-page test**

Create `src/components/GameRatingInformation.test.tsx` with literal assertions that catch an omitted or mismatched classification field:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameRatingInformation } from "./GameRatingInformation";
import GameInfoPage from "@/app/game-info/page";

describe("게임 등급정보", () => {
  it("결정된 12세 등급과 폭력성 정보 및 등록번호를 표시한다", () => {
    const html = renderToStaticMarkup(<GameRatingInformation />);
    expect(html).toContain("12세 미만은 이용할 수 없습니다");
    expect(html).toContain("GC-CC-NP-260903-001");
    expect(html).toContain("2026.08.07");
    expect(html).toContain("제2026-000005호");
    expect(html).toContain("제2026-000001호");
    expect(html).toContain("폭력성");
    expect(html).toContain('/images/rating/12-plus.webp');
    expect(html).toContain('/images/rating/violence.webp');
    expect(html).not.toContain("선정성");
    expect(html).not.toContain("사행성");
  });

  it("로그인 없는 공개 페이지에서 결정사유와 공식 확인 경로를 제공한다", () => {
    const html = renderToStaticMarkup(<GameInfoPage />);
    expect(html).toContain("게임 등급정보");
    expect(html).toContain("무기와 붉은 선혈이 표현된 일러스트");
    expect(html).toContain("게임콘텐츠등급분류위원회에서 결정 내용 확인");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/components/GameRatingInformation.test.tsx`

Expected: FAIL because `GameRatingInformation` and `/game-info` do not exist.

- [ ] **Step 3: Add the rating model and server-rendered UI**

Create `src/lib/gameRating.ts` with a frozen literal object containing all values in Global Constraints, the two `/images/rating/*.webp` paths, the GCRB decision-search URL, `GAME_RATING_NOTICE_MS = 3_500`, and a route predicate covering `/`, `/sign-in`, `/create`, and the game route prefixes.

Create `GameRatingInformation` as a presentational component using `next/image`, `SURFACE_CARD`, and `SURFACE_INSET`. In compact mode render the required notice and metadata without the long decision rationale; otherwise include the full rationale and official external link.

Create `src/app/game-info/page.tsx` with public metadata, an opaque `PageShell`/`Card` layout, a back link to `/`, and the full `GameRatingInformation`.

- [ ] **Step 4: Add and register official assets**

Convert the already downloaded official GIFs losslessly with Sharp:

```bash
node -e "const sharp=require('sharp'); Promise.all([sharp('/tmp/gcrb-icon-over12.gif').webp({lossless:true}).toFile('/tmp/12-plus.webp'),sharp('/tmp/gcrb-grade-violence.gif').webp({lossless:true}).toFile('/tmp/violence.webp')]).catch(e=>{console.error(e);process.exit(1)})"
```

Place the WebP files in `public/images/rating/`. Add `rating: { maxWidth: 256, quality: 95 }` to `PROFILES`. Add a cleared `official-gcrb-rating-marks` rights source with both GCRB URLs and route `public/images/rating/` to it in `sourceFor`. Run `npm run update-asset-rights` after reviewing the two hashes.

- [ ] **Step 5: Run focused verification and commit**

Run:

```bash
npm test -- src/components/GameRatingInformation.test.tsx
npm run check-images -- --strict
npm run check-asset-rights -- --strict
```

Expected: all commands exit 0 with two referenced and cleared rating assets.

Commit only Task 1 files with message `feat: add public game rating information`.

---

### Task 2: First-entry 3.5-second rating notice

**Files:**
- Create: `src/components/GameRatingLaunchNotice.tsx`
- Create: `src/components/GameRatingLaunchNotice.test.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `GAME_RATING_NOTICE_MS`, `isGameEntryPath`, and `GameRatingInformation` from Task 1.
- Produces: root-mounted `GameRatingLaunchNotice` with no props.

- [ ] **Step 1: Write the failing timer and route tests**

Mock `usePathname` with a mutable literal and use fake timers. Assert that `/sign-in` initially renders a modal containing `12세 미만은 이용할 수 없습니다`, remains present at 3,499ms, disappears at 3,500ms, and that `/privacy` never renders the modal. Also assert that changing from `/privacy` to `/` in the same root lifetime shows the notice once.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/components/GameRatingLaunchNotice.test.tsx`

Expected: FAIL because `GameRatingLaunchNotice` does not exist.

- [ ] **Step 3: Implement the launch notice**

Create a focused client component that:

```tsx
const [visible, setVisible] = useState(() => isGameEntryPath(pathname));
const hasShown = useRef(isGameEntryPath(pathname));
```

Uses one effect to trigger on the first later game-route transition and another effect to hide after `GAME_RATING_NOTICE_MS`. Render nothing when hidden. When visible, render a fixed opaque black layer above normal application UI, an official rating mark at the viewport upper-right, and a centered opaque `SURFACE_CARD` containing compact `GameRatingInformation`. Use `role="dialog"`, `aria-modal="true"`, and no close control.

Import and render it in `src/app/layout.tsx` immediately after `<AppLaunchSplash />` so the existing installation transition remains intact.

- [ ] **Step 4: Run focused verification and commit**

Run:

```bash
npm test -- src/components/GameRatingLaunchNotice.test.tsx src/components/AppLaunchSplash.test.tsx
npx tsc --noEmit
```

Expected: tests and type checking exit 0.

Commit only Task 2 files with message `feat: show rating notice on first game entry`.

---

### Task 3: Persistent navigation and release documentation

**Files:**
- Modify: `src/app/sign-in/LandingContent.tsx`
- Modify: `src/app/sign-in/LandingContent.test.tsx`
- Modify: `src/adventure/v2/V2SettingsMenu.tsx`
- Create: `src/adventure/v2/V2SettingsMenu.rating.test.tsx`
- Modify: `src/adventure/v2/V2PreferencesView.tsx`
- Modify: `src/adventure/v2/V2PreferencesView.test.tsx`
- Modify: `docs/release-readiness.md`

**Interfaces:**
- Consumes: public `/game-info` page from Task 1.
- Produces: public and in-game one-click access to rating information.

- [ ] **Step 1: Write failing navigation tests**

Extend the landing and preferences tests to require `href="/game-info"` and the label `게임 등급정보`. Add a focused static-render test for `V2SettingsMenu` that requires a `/game-info` link with `target="_blank"` so in-game state is retained.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/app/sign-in/LandingContent.test.tsx src/adventure/v2/V2PreferencesView.test.tsx src/adventure/v2/V2SettingsMenu.rating.test.tsx
```

Expected: FAIL because none of the three surfaces link to `/game-info`.

- [ ] **Step 3: Add navigation links and refresh release documentation**

Add `게임 등급정보` to the landing footer. Add an external-tab entry with the Phosphor `IdentificationCard` icon to the in-game menu. Add a `게임 등급정보` row with the same icon to the opaque `계정 및 안내` card in preferences.

Update `docs/release-readiness.md` to replace the stale exemption-candidate conclusion with the exact 2026-09-03 rating decision and implemented display locations. Keep the earlier exemption history only as historical context if it remains useful; remove instructions that say not to show an official rating.

- [ ] **Step 4: Run all verification gates**

Run:

```bash
npm test
npx tsc --noEmit
npx eslint src/lib/gameRating.ts src/components/GameRatingInformation.tsx src/components/GameRatingInformation.test.tsx src/components/GameRatingLaunchNotice.tsx src/components/GameRatingLaunchNotice.test.tsx src/app/game-info/page.tsx src/app/layout.tsx src/app/sign-in/LandingContent.tsx src/app/sign-in/LandingContent.test.tsx src/adventure/v2/V2SettingsMenu.tsx src/adventure/v2/V2SettingsMenu.rating.test.tsx src/adventure/v2/V2PreferencesView.tsx src/adventure/v2/V2PreferencesView.test.tsx
npm run check-images -- --strict
npm run check-asset-rights -- --strict
npm run build
```

Expected: all commands exit 0. The build must execute `prebuild`, including image optimization and image-reference checks.

- [ ] **Step 5: Inspect scope and commit**

Run `git diff --check`, inspect `git status --short`, and review diffs only for files in this plan. Do not stage the pre-existing telemetry/operations changes.

Commit Task 3 files and any final test-only corrections with message `docs: record official game rating release requirements`.
