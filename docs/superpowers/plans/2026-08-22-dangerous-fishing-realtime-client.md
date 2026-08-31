# Dangerous Fishing Realtime Client and Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dangerous-fishing v2 encounter UI with a responsive hold/release Canvas minigame using three dedicated underwater backgrounds, procedural fish motion, recoverable input transcripts, and accessible DOM HUDs.

**Architecture:** A focused Client Component owns `requestAnimationFrame` rendering while a separate hook owns fixed-tick state, `sessionStorage`, and non-blocking checkpoint/finish requests. Existing v1 encounter panels remain available for saved v1 encounters; only v2 encounters use the new renderer.

**Tech Stack:** React 19 Client Components, Canvas 2D, Pointer Events, `requestAnimationFrame`, Web `fetch`, `sessionStorage`, Vitest/jsdom, Next.js 16 Image conventions, Sharp image optimization.

## Global Constraints

- Complete `2026-08-22-dangerous-fishing-realtime-engine.md` first.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before changing Client Component boundaries.
- General fishing screens and rules remain unchanged.
- Rendering may run at 60fps; gameplay advances only through the shared 50ms fixed-tick module.
- Pointer/mouse/touch hold means `reel`; release, cancel, blur, and hidden-tab transition mean `release`.
- Space key down/up must produce the same transitions without scrolling the page.
- All scene artwork is decorative; tension, stamina, distance, timer, bait effect, warning, and result remain accessible DOM.
- Use `SURFACE_CARD`, `SURFACE_INSET`, and existing opaque surfaces for every content panel over imagery.
- Respect `prefers-reduced-motion` without changing gameplay timing.
- Do not deploy or change maintenance mode.

---

### Task 1: Produce and register encounter artwork

**Files:**
- Create: `public/images/ui/dangerous-fishing-shattered-reef-encounter.webp`
- Create: `public/images/ui/dangerous-fishing-storm-trench-encounter.webp`
- Create: `public/images/ui/dangerous-fishing-abyssal-rift-encounter.webp`
- Create: `public/images/fish/tidal_colossus-struggle.webp`
- Create: `public/images/fish/abyss_kraken-struggle.webp`
- Create: `src/adventure/v2/dangerousFishingAssets.test.ts`
- Modify: `src/adventure/data/v2/dangerousFishing.ts`
- Modify: `src/adventure/data/v2/dangerousFishing.test.ts`
- Modify: `scripts/optimize-images.mjs`
- Modify: `docs/asset-rights-audit.md`

**Interfaces:**
- Produces `DangerousZone.encounterImageSrc` and `DangerousBoss.struggleSpriteSrc` literals consumed by the Canvas renderer.

- [ ] **Step 1: Add failing asset-path tests before generating files**

```ts
for (const zone of Object.values(DANGEROUS_ZONES)) {
  expect(zone.encounterImageSrc).toBe(
    `/images/ui/dangerous-fishing-${zone.id.replaceAll("_", "-")}-encounter.webp`,
  );
}
for (const boss of Object.values(DANGEROUS_BOSSES)) {
  expect(boss.struggleSpriteSrc).toMatch(/-struggle\.webp$/);
}
```

Use explicit catalog strings matching the exact filenames above rather than deriving them at runtime if the zone ID spelling differs. In `dangerousFishingAssets.test.ts`, use Sharp metadata to require 16:9 encounter backgrounds and alpha-enabled 1024×256 boss sheets composed of four equal 256×256 frames.

- [ ] **Step 2: Run catalog and image checks and confirm RED**

Run: `npx vitest run src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingAssets.test.ts && npm run check-images`

Expected: FAIL because the new fields/files do not exist.

- [ ] **Step 3: Generate the three backgrounds with the built-in image generation tool**

Read `/home/sea9401/.codex/skills/.system/imagegen/SKILL.md` completely before generating assets. Use one call per image, `stylized-concept`, 16:9, background only, no text/UI/fish/rod/line/hook. Every prompt must reserve the central 60% for gameplay and the upper-right line corridor.

```text
Shattered Reef: shallow turquoise dangerous reef, fractured pale rock shelves at outer edges and bottom, sun caustics, sparse coral, energetic but readable, painterly fantasy watercolor-and-ink game background.
Storm Trench: storm-dark underwater trench, teal and slate-blue current bands, distant lightning glow through the surface, edge rocks and bubbles, central water column calm enough for a fish sprite.
Abyssal Rift: deep indigo abyss, violet bioluminescent crystals and jagged shelves at edges and bottom, narrow visible surface strip, restrained light shafts, mysterious fantasy game background.
```

Copy selected PNG outputs to the exact `public/images/ui/*.png` names. Update the `fish` profile comment and maximum width in `scripts/optimize-images.mjs` to 1024px so a four-frame sheet retains four 256px frames; existing smaller fish images are not enlarged because the script uses `withoutEnlargement`. Run `npm run optimize-images`, and confirm the PNG originals are replaced by WebP.

- [ ] **Step 4: Generate two transparent four-frame struggle sheets**

Locate the two boss source images from their catalog entries and inspect each local file with `view_image` before editing. Use those exact files as image-generation references, preserve identity/colors, and request a transparent background with four equal horizontal frames sharing the same canvas size and anchor: neutral wind-up, left bend, right thrash, recovery. Inspect the generated sheets with `view_image`, copy the selected outputs to `public/images/fish/*-struggle.png`, then run `npm run optimize-images`.

- [ ] **Step 5: Register assets, rights notes, and verify GREEN**

Run: `npx vitest run src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingAssets.test.ts && npm run check-images && npm run check-asset-rights`

Expected: all five files are referenced, no missing image is reported, and the rights audit recognizes the generated assets.

- [ ] **Step 6: Commit the visual assets**

```bash
git add public/images/ui/dangerous-fishing-*-encounter.webp public/images/fish/tidal_colossus-struggle.webp public/images/fish/abyss_kraken-struggle.webp src/adventure/data/v2/dangerousFishing.ts src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingAssets.test.ts scripts/optimize-images.mjs docs/asset-rights-audit.md
git commit -m "feat: add dangerous fishing encounter artwork"
```

### Task 2: Canvas scene renderer and procedural fish motion

**Files:**
- Create: `src/adventure/v2/DangerousFishingRealtimeCanvas.tsx`
- Create: `src/adventure/v2/dangerousFishingRealtimeRender.ts`
- Create: `src/adventure/v2/dangerousFishingRealtimeRender.test.ts`

**Interfaces:**
- Consumes: `DangerousRealtimeView`, `encounterImageSrc`, fish image, optional boss struggle sprite, depth, risk, and reduced-motion boolean.
- Produces: `DangerousFishingRealtimeCanvas` and pure helpers `fishPoseAt`, `lineCurveAt`, `sceneEffectsFor`, and `staticFallbackFor`.

- [ ] **Step 1: Write failing pure render-model tests**

```ts
expect(sceneEffectsFor("deep", 5, false)).toMatchObject({
  particleDensity: 3,
  shakeStrength: 2,
  lightLevel: 0,
});
expect(sceneEffectsFor("deep", 5, true)).toMatchObject({
  particleDensity: 1,
  shakeStrength: 0,
});
expect(fishPoseAt(viewFixture({ behavior: "dive" }), 500)).toMatchObject({
  direction: "down",
});
expect(staticFallbackFor(viewFixture())).toMatchObject({
  background: "solid-underwater",
  animated: false,
});
```

- [ ] **Step 2: Run render helper tests and confirm RED**

Run: `npx vitest run src/adventure/v2/dangerousFishingRealtimeRender.test.ts`

Expected: FAIL because the render helpers do not exist.

- [ ] **Step 3: Implement render helpers and the focused Client Component**

```tsx
"use client";

export function DangerousFishingRealtimeCanvas({
  view,
  scene,
  target,
  reducedMotion,
}: DangerousFishingRealtimeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // ResizeObserver + devicePixelRatio canvas sizing; rAF draws only imagery.
  return <canvas ref={canvasRef} role="img" aria-label={sceneDescription} />;
}
```

Draw the fish from vertical source slices with tail-weighted sine offsets, interpolate position/tilt between fixed ticks, draw a quadratic line curve, and cap device pixel ratio at 2. Keep all text and controls outside Canvas. If Canvas initialization or an image load fails, render the pure fallback model as a solid underwater DOM scene with a static fish image and the same controls; never stop the simulation.

- [ ] **Step 4: Run helper tests and lint**

Run: `npx vitest run src/adventure/v2/dangerousFishingRealtimeRender.test.ts`

Run: `npx eslint src/adventure/v2/DangerousFishingRealtimeCanvas.tsx src/adventure/v2/dangerousFishingRealtimeRender.ts src/adventure/v2/dangerousFishingRealtimeRender.test.ts`

Expected: both commands exit 0.

- [ ] **Step 5: Commit the renderer**

```bash
git add src/adventure/v2/DangerousFishingRealtimeCanvas.tsx src/adventure/v2/dangerousFishingRealtimeRender.ts src/adventure/v2/dangerousFishingRealtimeRender.test.ts
git commit -m "feat: animate dangerous fishing encounters"
```

### Task 3: Recoverable realtime client hook

**Files:**
- Create: `src/adventure/v2/useDangerousFishingRealtime.ts`
- Create: `src/adventure/v2/useDangerousFishingRealtime.test.tsx`
- Modify: `src/adventure/v2/useDangerousFishing.ts`

**Interfaces:**
- Consumes: v2 encounter view plus engine replay APIs and normal/boss endpoint metadata.
- Produces: `{ view, holding, warning, connection, onPointerDown, onPointerUp, onKeyDown, onKeyUp, retryFinish }`.
- Storage key: `dangerous-fishing.realtime.v2:${encounterId}`.

- [ ] **Step 1: Write failing hook tests with fake timers and mocked fetch**

```tsx
const { result } = renderHook(() => useDangerousFishingRealtime(fixture));
act(() => result.current.onPointerDown(pointerEvent()));
expect(result.current.holding).toBe(true);
act(() => vi.advanceTimersByTime(2_050));
expect(fetch).toHaveBeenCalledWith(
  expect.stringContaining("dangerous-fishing"),
  expect.objectContaining({ method: "POST" }),
);
expect(JSON.parse(sessionStorage.getItem(storageKey)!)).toMatchObject({
  encounterId: fixture.encounter.id,
});
```

Cover Space prevention, cancel/blur/visibility release, elapsed fixed-tick catch-up after a hidden tab resumes, 2-second checkpoints, stale revision replay, reload restoration, finish request ID reuse, exponential-backoff offline retry, unmount cleanup, and supported-device vibration only on first entry into high tension and line break.

- [ ] **Step 2: Run hook tests and confirm RED**

Run: `npx vitest run src/adventure/v2/useDangerousFishingRealtime.test.tsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the hook without importing server-only modules**

```ts
export type DangerousRealtimeClientTarget =
  | { kind: "voyage"; endpoint: "/api/v2/dangerous-fishing/encounter" }
  | { kind: "boss"; endpoint: "/api/v2/dangerous-fishing/boss"; eventId: string };
```

Use refs for the animation/tick loop and transcript, React state only for DOM-visible snapshots, `AbortController` for teardown, and the existing activity verification JSON reader for API responses. Retry failed checkpoints with bounded exponential backoff while local input continues. Call `navigator.vibrate` only after feature detection and only for high-tension entry or line break. Do not call the broad `refresh()` after every checkpoint.

- [ ] **Step 4: Run hook and existing dangerous fishing hook tests**

Run: `npx vitest run src/adventure/v2/useDangerousFishingRealtime.test.tsx src/adventure/v2/dangerousFishingFeedback.test.ts`

Expected: tests pass and finish feedback still uses the existing result-card path.

- [ ] **Step 5: Commit the realtime hook**

```bash
git add src/adventure/v2/useDangerousFishingRealtime.ts src/adventure/v2/useDangerousFishingRealtime.test.tsx src/adventure/v2/useDangerousFishing.ts
git commit -m "feat: manage realtime dangerous fishing input"
```

### Task 4: Hold/release HUD and v1/v2 panel switching

**Files:**
- Create: `src/adventure/v2/DangerousFishingRealtimePanel.tsx`
- Create: `src/adventure/v2/DangerousFishingRealtimePanel.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingBossPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingBossPanel.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingEncounterPanel.tsx`

**Interfaces:**
- `DangerousFishingRealtimePanel` consumes a v2 encounter, scene/target catalog entries, target metadata, endpoint target, and finish callback.
- V1 encounters continue rendering `DangerousFishingEncounterPanel`; v2 encounters render `DangerousFishingRealtimePanel`.

- [ ] **Step 1: Write failing rendering and accessibility tests**

```tsx
const html = renderToStaticMarkup(<DangerousFishingRealtimePanel {...props} />);
expect(html).toContain("누르고 감아올리기");
expect(html).toContain("낚싯줄 장력");
expect(html).not.toContain("추천");
expect(html).not.toContain("현재 행동");
expect(html).toContain("aria-valuenow");
```

Add integration fixtures proving v1 gets three buttons, v2 gets one hold control, boss v2 keeps public contribution summary, scene images are not duplicated, and a Canvas/image failure keeps the DOM fallback playable.

- [ ] **Step 2: Run panel tests and confirm RED**

Run: `npx vitest run src/adventure/v2/DangerousFishingRealtimePanel.test.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx`

Expected: FAIL because the v2 panel is absent.

- [ ] **Step 3: Implement the opaque HUD and switch logic**

Render Canvas as a decorative layer inside the scene. Render tension safe-zone track, stamina, distance, timer, bait effect, connection status, warning, and result as DOM. Use Pointer Events with pointer capture on the hold control and Space handlers on the same focusable button.

- [ ] **Step 4: Run panel tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/DangerousFishingRealtimePanel.test.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/dangerousFishingFeedback.test.ts`

Expected: all v1/v2 view tests pass.

- [ ] **Step 5: Commit the realtime panels**

```bash
git add src/adventure/v2/DangerousFishingRealtimePanel.tsx src/adventure/v2/DangerousFishingRealtimePanel.test.tsx src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/DangerousFishingEncounterPanel.tsx
git commit -m "feat: replace dangerous fishing controls with realtime tension"
```

### Task 5: Switch new starts to v2 and preserve legacy sessions

**Files:**
- Modify: `src/adventure/v2/useDangerousFishing.ts`
- Modify: `src/adventure/v2/DangerousFishingView.test.tsx`
- Modify: `src/lib/server/dangerousFishingRoute.test.ts`
- Modify: `src/lib/server/dangerousFishingBossRoute.test.ts`

**Interfaces:**
- New voyage and boss starts call `action: "start_realtime"`.
- Saved v1 encounters retain their legacy action callbacks until completion/expiry.

- [ ] **Step 1: Write failing client request-selection tests**

```ts
expect(startEncounterBody("basic_bait")).toEqual({
  action: "start_realtime",
  baitId: "basic_bait",
});
expect(actionsForEncounter(v1Fixture()).kind).toBe("legacy");
expect(actionsForEncounter(v2Fixture()).kind).toBe("realtime");
```

- [ ] **Step 2: Run integration tests and confirm RED**

Run: `npx vitest run src/adventure/v2/DangerousFishingView.test.tsx src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBossRoute.test.ts`

Expected: FAIL while new starts still call v1 `start`.

- [ ] **Step 3: Change only new-start requests and leave v1 callbacks intact**

Do not delete `act` or `actOnBoss`. Branch by `simulationVersion` in the view model so old sessions can finish once and all newly started sessions use the realtime hook.

- [ ] **Step 4: Run all dangerous fishing UI/server tests**

Run: `npx vitest run src/adventure/v2/DangerousFishingRealtimePanel.test.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBossRoute.test.ts 'src/app/(game)/town/fishing/dangerous/page.test.tsx'`

Expected: all tests pass for new v2 starts and saved v1 fixtures.

- [ ] **Step 5: Commit the default-path switch**

```bash
git add src/adventure/v2/useDangerousFishing.ts src/adventure/v2/DangerousFishingView.test.tsx src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBossRoute.test.ts
git commit -m "feat: enable realtime dangerous fishing encounters"
```

### Task 6: Client and asset verification gate

**Files:**
- Modify only files required by failures found in this gate.

**Interfaces:**
- Produces the playable realtime client consumed by the reward plan.

- [ ] **Step 1: Run dangerous fishing client regression tests**

Run: `npx vitest run src/adventure/v2/dangerousFishingRealtimeRender.test.ts src/adventure/v2/useDangerousFishingRealtime.test.tsx src/adventure/v2/DangerousFishingRealtimePanel.test.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/dangerousFishingFeedback.test.ts src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBossRoute.test.ts 'src/app/(game)/town/fishing/dangerous/page.test.tsx'`

Expected: all tests pass.

- [ ] **Step 2: Run image and asset-rights verification**

Run: `npm run check-images && npm run check-asset-rights`

Expected: both commands exit 0 with all new assets referenced.

- [ ] **Step 3: Run lint and type checking**

Run: `npx eslint src/adventure/v2/DangerousFishingRealtimeCanvas.tsx src/adventure/v2/dangerousFishingRealtimeRender.ts src/adventure/v2/useDangerousFishingRealtime.ts src/adventure/v2/DangerousFishingRealtimePanel.tsx src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingBossPanel.tsx src/adventure/data/v2/dangerousFishing.ts`

Run: `npx tsc --noEmit`

Expected: both commands exit 0.

- [ ] **Step 4: Inspect the mobile interaction manually in development**

Run: `npm run dev`

Verify at 390×844 and desktop widths: pointer capture, Space prevention, safe-area spacing, opaque HUD, reduced-motion mode, background fit, v1 fixture compatibility, reload restoration, and no duplicated boss image.

- [ ] **Step 5: Check repository scope**

Run: `git diff --check && git status --short`

Expected: no generated PNG remains under `public/images`; `.superpowers/` remains unstaged.
