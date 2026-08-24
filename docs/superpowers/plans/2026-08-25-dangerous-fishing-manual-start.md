# Dangerous Fishing Manual Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위험 해역 일반 조우와 거대어 개인 시도가 두 단계 준비 흐름의 명시적인 시작 버튼을 눌렀을 때만 시작되게 한다.

**Architecture:** 기존 `start_realtime` API와 서버 저장 규약은 유지하고, 그 앞에 클라이언트 전용 준비 상태를 둔다. 일반 조우 상태는 `DangerousFishingView`, 거대어 상태는 `DangerousFishingBossPanel`이 소유하며, 실제 시작 성공으로 새 조우가 나타나면 `DangerousFishingView`가 해당 조우 상단을 한 번 뷰포트로 이동한다.

**Tech Stack:** Next.js 16 App Router, React 19 client components, Tailwind CSS 4, Vitest, Testing Library

## Global Constraints

- 일반 위험 해역과 거대어 개인 시도에 모두 명시적 시작 단계를 제공한다.
- 준비 단계에서는 서버 요청, 미끼 소비와 제한 시간 진행이 없어야 한다.
- 실제 시작 요청이 실패하면 준비 상태를 유지해 같은 선택으로 재시도할 수 있어야 한다.
- 기존 서버 API·저장 형식, 1초 안전 준비, 실시간 복구와 조작 규칙은 변경하지 않는다.
- 모든 카드와 준비 안내는 `SURFACE_CARD`, `SURFACE_INSET`의 불투명 표면을 사용한다.
- 일반 낚시, 밸런스, 배포, 푸시와 점검 모드는 변경하지 않는다.

---

### Task 1: General Dangerous Encounter Preparation

**Files:**
- Modify: `src/adventure/v2/DangerousFishingView.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingPreparationPanel.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.tsx`

**Interfaces:**
- Extend `DangerousFishingPreparationPanel` with `encounterPrepared: boolean`, `onPrepareEncounter: () => void`, and `onCancelEncounter: () => void`.
- Keep `onStartEncounter: () => void`; it becomes the second-step actual start callback.
- `DangerousFishingView` stores `{ voyageId: string; baitId: DangerousBaitId } | null` so preparation cannot leak into another voyage or bait selection.

- [x] **Step 1: Write failing general preparation behavior tests**

Render a voyage without an encounter. Click `낚시 준비` and assert the real preparation card appears with `낚시 시작`, `준비 취소`, selected bait and the no-timer copy while `onStartEncounter` has zero calls. Click `낚시 시작` and assert `onStartEncounter` is called once. Add a rejected-start case where the callback resolves `false` and assert the preparation card remains available for retry.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/adventure/v2/DangerousFishingView.test.tsx
```

Expected: FAIL because the first `낚싯줄 던지기` click currently invokes the server callback and there is no manual start card.

- [x] **Step 3: Implement the minimal general preparation state and card**

In `DangerousFishingView`, set preparation state on the first click, clear it on bait change/cancel/success, and pass the derived boolean to `DangerousFishingPreparationPanel`. In the panel, replace the voyage bait controls with an opaque `aria-label="위험 해역 낚시 시작 준비"` card while prepared. Render full-width `낚시 시작` and secondary `준비 취소` buttons and state that the timer does not run before start.

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/adventure/v2/DangerousFishingView.test.tsx
```

Expected: all tests in the file PASS.

### Task 2: Giant Fish Preparation

**Files:**
- Modify: `src/adventure/v2/DangerousFishingBossPanel.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingBossPanel.tsx`

**Interfaces:**
- `DangerousFishingBossPanel` keeps its public props and stores `preparedEventId: string | null` locally.
- The first action changes to `개인 시도 준비`; the prepared action is `거대어 낚시 시작` and invokes the existing `onStart(eventId): Promise<boolean>`.

- [x] **Step 1: Write failing giant-fish preparation behavior tests**

Render an active boss event without an attempt. Click `개인 시도 준비` and assert `onStart` has zero calls while the preparation region, `거대어 낚시 시작`, no-timer copy and `준비 취소` appear. Verify cancel returns to the first action. Re-enter preparation, click the actual start button, and assert the event ID reaches `onStart` once.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/adventure/v2/DangerousFishingBossPanel.test.tsx
```

Expected: FAIL because `개인 시도 시작` currently calls `onStart` immediately.

- [x] **Step 3: Implement the minimal giant-fish preparation state and card**

Store the prepared event ID, derive preparation only when it matches the current active event, and preserve it when `onStart` resolves `false`. Render the preparation controls inside `SURFACE_INSET`, keep the existing blocked-reason rule on the first action, and disable both start paths while `busy` is true.

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/adventure/v2/DangerousFishingBossPanel.test.tsx
```

Expected: all tests in the file PASS.

### Task 3: Mobile Viewport Positioning After Actual Start

**Files:**
- Modify: `src/adventure/v2/DangerousFishingView.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.tsx`

**Interfaces:**
- `DangerousFishingView` keeps a ref with pending scope `"voyage" | "boss" | null` and DOM refs for the two encounter sections.
- Existing start props remain `(baitId) => Promise<boolean>` and `(eventId) => Promise<boolean>`; wrapper handlers mark the pending scope before awaiting them.

- [x] **Step 1: Write failing viewport behavior test**

Render a stateful harness that begins with a voyage and no encounter, enters preparation, and replaces the model with a realtime encounter when `낚시 시작` is clicked. Stub `HTMLElement.prototype.scrollIntoView` and assert it is called once with `{ block: "start" }`. Separately render an already restored realtime encounter and assert no automatic scroll occurs.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/adventure/v2/DangerousFishingView.test.tsx
```

Expected: FAIL because rendering a new encounter does not currently move the viewport to its HUD.

- [x] **Step 3: Implement one-shot encounter positioning**

Mark the pending scope immediately before the actual async start request. Clear it on failure. When the matching realtime encounter ID appears, call the matching wrapper's `scrollIntoView({ block: "start" })` once and clear the pending scope. Add `scroll-mt-24` to both wrappers. Do not set the pending scope for restored encounters or status refreshes.

- [x] **Step 4: Run the general and boss tests and verify GREEN**

Run:

```bash
npm test -- src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx
```

Expected: both test files PASS.

### Task 4: Integrated Verification and Commit

**Files:**
- Inspect: all files modified in Tasks 1-3
- Test: dangerous fishing component suites, TypeScript, ESLint, images and production build

**Interfaces:**
- Produces one implementation commit after the design commit.

- [x] **Step 1: Run the dangerous-fishing regression set**

Run:

```bash
npm test -- src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/DangerousFishingRealtimePanel.test.tsx src/adventure/v2/useDangerousFishingRealtime.test.tsx
```

Expected: all selected test files PASS without warnings.

- [x] **Step 2: Run static and asset verification**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npx eslint src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingPreparationPanel.tsx src/adventure/v2/DangerousFishingBossPanel.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx
npm run check-images
```

Expected: every command exits 0.

- [x] **Step 3: Run the Next.js production build**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

Expected: Next.js 16 production build and postbuild repair exit 0.

- [x] **Step 4: Review the final diff against the design**

Confirm both content types require two separate user inputs, only the second invokes the existing API callback, failed starts remain retryable, new encounters scroll once, restored encounters do not scroll, all surfaces are opaque, and no server or deployment file changed.

- [x] **Step 5: Commit the implementation**

```bash
git add src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingView.tsx src/adventure/v2/DangerousFishingPreparationPanel.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/DangerousFishingBossPanel.tsx docs/superpowers/plans/2026-08-25-dangerous-fishing-manual-start.md
git commit -m "feat: require manual start for dangerous fishing"
```
