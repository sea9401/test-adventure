# Battle Log Tick Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전용 전투 로그에서 화면 최상단에 보이는 로그 묶음의 첫 틱을 `현재 시간대 · 1,500 / 3,000틱` 형식으로 표시한다.

**Architecture:** 엔진과 UI가 같은 3,000틱 상한을 쓰도록 타임라인 모듈에 공용 상수를 둔다. `BattleLogList`는 각 ATB 묶음의 첫 틱을 DOM 메타데이터로 노출하고, 별도 클라이언트 컴포넌트가 전용 로그 스크롤 뷰포트에서 최상단 가시 묶음을 추적해 데스크톱 보조 카드와 모바일 고정 배지를 렌더링한다.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4 Client Components, TypeScript, Tailwind CSS 4, Vitest 4.1.10

## Global Constraints

- 배포하지 않는다.
- 틱 정보가 없는 레거시 로그에서는 표시를 숨긴다.
- PvE와 PvP 모두 최대값 `3,000틱`을 사용한다.
- 데스크톱 표시는 로그 카드 오른쪽 여백, 좁은 화면 표시는 로그 카드 내부 우측 상단에 둔다.
- 카드와 배지는 `src/components/ui/surfaces.ts`의 불투명 표면 상수를 사용한다.
- 전투 엔진 결과와 저장된 리플레이 형식은 변경하지 않는다.
- 구현은 현재 세션에서 진행하며 서브에이전트를 생성하지 않는다.

---

## File Structure

- Modify `src/adventure/v2/combat/combatTimeline.ts`: PvE·PvP·UI가 공유할 `ATB_TIMELINE_TICK_CAP`을 소유한다.
- Modify `src/adventure/v2/combat/engine.atb.ts`: 기존 공개 `ATB_TICK_CAP`을 공용 상수에서 파생한다.
- Modify `src/adventure/v2/combat/engine.pvp-atb.ts`: 기존 공개 `PVP_ATB_TICK_CAP`을 공용 상수에서 파생한다.
- Modify `src/adventure/v2/combat/combatTimeline.test.ts`: 공용 상한을 고정한다.
- Modify `src/adventure/battle/BattleLogList.tsx`: 로그 묶음 첫 틱 계산과 DOM 메타데이터 노출을 담당한다.
- Modify `src/adventure/battle/BattleLogList.test.tsx`: 첫 틱 추출과 레거시 미노출을 검증한다.
- Create `src/adventure/battle/BattleLogTickIndicator.tsx`: 가시 묶음 선택, 스크롤 추적, 반응형 표시를 담당한다.
- Create `src/adventure/battle/BattleLogTickIndicator.test.tsx`: 위치 선택·클램프·표시 마크업을 검증한다.
- Modify `src/adventure/battle/BattleScene.tsx`: 전용 페이지 로그 카드에 추적기와 표시를 연결한다.
- Modify `src/adventure/battle/BattleScene.test.tsx`: 전용 페이지에서만 표시 슬롯이 연결되는지 검증한다.

---

### Task 1: 공용 틱 상한과 로그 묶음 메타데이터

**Files:**
- Modify: `src/adventure/v2/combat/combatTimeline.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`
- Modify: `src/adventure/v2/combat/combatTimeline.test.ts`
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Modify: `src/adventure/battle/BattleLogList.test.tsx`

**Interfaces:**
- Produces: `ATB_TIMELINE_TICK_CAP: 3000`
- Produces: `battleLogGroupFirstTick(group: BattleLogEntry[]): number | null`
- Produces: ATB 그룹 DOM 속성 `data-battle-log-group-tick="<number>"`
- Consumes: 기존 `BattleLogEntry.t`와 `groupBattleLogEntries()` 결과

- [ ] **Step 1: 공용 상한과 그룹 첫 틱의 실패 테스트 작성**

`combatTimeline.test.ts`에서 공용 상한을 import하고 다음 검증을 추가한다.

```ts
it("PvE·PvP·UI 공용 전투 시간 상한은 3,000틱이다", () => {
  expect(ATB_TIMELINE_TICK_CAP).toBe(3_000);
});
```

`BattleLogList.test.tsx`에서 `battleLogGroupFirstTick`을 import하고 다음 검증을 추가한다.

```ts
it("묶음에서 처음 기록된 ATB 틱을 반환한다", () => {
  expect(
    battleLogGroupFirstTick([
      { kind: "info", text: "전투 시작" },
      { kind: "player_attack", text: "공격", t: 420 },
      { kind: "info", text: "효과", t: 425 },
    ]),
  ).toBe(420);
});

it("틱이 없는 레거시 묶음은 null이고 DOM 메타데이터도 만들지 않는다", () => {
  const entries: BattleLogEntry[] = [{ kind: "info", text: "옛 로그" }];
  expect(battleLogGroupFirstTick(entries)).toBeNull();
  expect(renderToStaticMarkup(<BattleLogList entries={entries} />)).not.toContain(
    "data-battle-log-group-tick",
  );
});
```

- [ ] **Step 2: 새 테스트가 실패하는지 확인**

Run:

```bash
npx vitest run src/adventure/v2/combat/combatTimeline.test.ts src/adventure/battle/BattleLogList.test.tsx
```

Expected: `ATB_TIMELINE_TICK_CAP`과 `battleLogGroupFirstTick` 미정의로 FAIL.

- [ ] **Step 3: 공용 상한과 그룹 메타데이터 최소 구현**

`combatTimeline.ts`에 공용 상한을 추가한다.

```ts
export const ATB_TIMELINE_TICK_CAP = 3_000;
```

두 엔진 파일은 기존 공개 이름을 유지하면서 공용 값을 사용한다.

```ts
import { ATB_TIMELINE_TICK_CAP, actionInterval } from "./combatTimeline";
export const ATB_TICK_CAP = ATB_TIMELINE_TICK_CAP;
```

```ts
import { ATB_TIMELINE_TICK_CAP, actionInterval } from "./combatTimeline";
export const PVP_ATB_TICK_CAP = ATB_TIMELINE_TICK_CAP;
```

`BattleLogList.tsx`에 순수 헬퍼를 추가하고 각 그룹 래퍼에 틱이 있을 때만 속성을 설정한다.

```ts
export function battleLogGroupFirstTick(
  group: BattleLogEntry[],
): number | null {
  for (const entry of group) {
    if (entry.t != null && Number.isFinite(entry.t)) return entry.t;
  }
  return null;
}
```

```tsx
const groupTick = battleLogGroupFirstTick(group);
<div
  data-battle-log-group-tick={groupTick ?? undefined}
  className={`${SURFACE_INSET} ${s.spacing} p-2`}
>
```

- [ ] **Step 4: 단위 테스트 통과 확인**

Run:

```bash
npx vitest run src/adventure/v2/combat/combatTimeline.test.ts src/adventure/v2/combat/combatAtb.test.ts src/adventure/v2/combat/combatPvpAtb.test.ts src/adventure/battle/BattleLogList.test.tsx
```

Expected: 모든 테스트 PASS, 기존 PvE/PvP 공개 상한도 계속 3,000.

- [ ] **Step 5: Task 1 커밋**

```bash
git add src/adventure/v2/combat/combatTimeline.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.pvp-atb.ts src/adventure/v2/combat/combatTimeline.test.ts src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx
git commit -m "refactor: share battle timeline tick cap"
```

---

### Task 2: 현재 시간대 추적과 반응형 표시

**Files:**
- Create: `src/adventure/battle/BattleLogTickIndicator.tsx`
- Create: `src/adventure/battle/BattleLogTickIndicator.test.tsx`
- Modify: `src/adventure/battle/BattleScene.tsx`
- Modify: `src/adventure/battle/BattleScene.test.tsx`

**Interfaces:**
- Consumes: `ATB_TIMELINE_TICK_CAP`, `data-battle-log-group-tick`, 로그 뷰포트 ref
- Produces: `currentBattleLogTickForViewport(groups, viewportTop, viewportBottom, maxTick): number | null`
- Produces: `useBattleLogCurrentTick(viewportRef, initialTick, enabled, updateKey): number | null`
- Produces: `BattleLogTickIndicator({ currentTick, maxTick, compact? })`

- [ ] **Step 1: 가시 묶음 선택과 표시의 실패 테스트 작성**

새 테스트 파일에 다음 핵심 사례를 작성한다.

```tsx
const groups = [
  { tick: 400, top: -80, bottom: 20 },
  { tick: 800, top: 24, bottom: 180 },
  { tick: 1_200, top: 184, bottom: 340 },
];

expect(currentBattleLogTickForViewport(groups, 0, 300, 3_000)).toBe(400);
expect(currentBattleLogTickForViewport(groups, 30, 300, 3_000)).toBe(800);
expect(
  currentBattleLogTickForViewport(
    [{ tick: 3_500, top: 10, bottom: 50 }],
    0,
    300,
    3_000,
  ),
).toBe(3_000);
expect(currentBattleLogTickForViewport([], 0, 300, 3_000)).toBeNull();

const html = renderToStaticMarkup(
  <BattleLogTickIndicator currentTick={1_500} maxTick={3_000} />,
);
expect(html).toContain("현재 시간대");
expect(html).toContain("1,500 / 3,000틱");
expect(html).toContain("bg-white");
```

`BattleScene.test.tsx`에는 `state.log`의 첫 항목에 `t: 0`을 넣은 상태를 만들어 `logViewport="page"`일 때 서버 렌더부터 `0 / 3,000틱` 표시 슬롯과 반응형 위치가 렌더링되고, 기본 `contained`에서는 렌더링되지 않는 검증을 추가한다.

- [ ] **Step 2: 새 테스트가 실패하는지 확인**

Run:

```bash
npx vitest run src/adventure/battle/BattleLogTickIndicator.test.tsx src/adventure/battle/BattleScene.test.tsx
```

Expected: 새 모듈과 시간대 표시 마크업이 없어 FAIL.

- [ ] **Step 3: 순수 선택 함수와 표시 컴포넌트 구현**

새 파일에서 위치 타입과 선택 함수를 구현한다.

```ts
export type BattleLogTickGroupPosition = {
  tick: number;
  top: number;
  bottom: number;
};

export function currentBattleLogTickForViewport(
  groups: BattleLogTickGroupPosition[],
  viewportTop: number,
  viewportBottom: number,
  maxTick: number,
): number | null {
  if (groups.length === 0) return null;
  const visible = groups.find(
    (group) => group.bottom > viewportTop && group.top < viewportBottom,
  );
  const selected = visible ??
    (groups[0].top >= viewportBottom ? groups[0] : groups[groups.length - 1]);
  return Math.min(maxTick, Math.max(0, Math.round(selected.tick)));
}
```

표시 컴포넌트는 `SURFACE_CARD`를 사용하고 숫자는 `toLocaleString("ko-KR")`으로 포맷한다. 일반형은 두 줄 카드, `compact`형은 한 줄 배지로 렌더링한다.

- [ ] **Step 4: 스크롤 추적 훅 구현**

`useBattleLogCurrentTick`은 `initialTick`을 첫 렌더 상태로 사용해 hydration 전에도 시간대가 보이게 하며, 다음 규칙을 따른다.

```ts
const nodes = viewport.querySelectorAll<HTMLElement>(
  "[data-battle-log-group-tick]",
);
const overlay = viewport.closest<HTMLElement>(
  '[data-battle-log-scroll-container="true"]',
);
const scrollTarget: Window | HTMLElement = overlay ?? window;
```

- 초기값은 `BattleScene`이 `state.log`에서 찾은 첫 번째 유효 틱이다.
- `IntersectionObserver`가 있으면 `root`를 오버레이 또는 `null`로 설정하고, 교차 상태가 바뀔 때 DOM 순서대로 위치를 다시 계산한다.
- `IntersectionObserver`가 없으면 `scrollTarget`의 passive `scroll` 이벤트와 `window.resize`에서 같은 위치 계산 함수를 호출한다.
- effect cleanup에서 observer를 해제하고 이벤트 리스너와 예약된 animation frame을 제거한다.
- `enabled=false` 또는 유효 그룹이 없으면 `null`을 반환한다.

- [ ] **Step 5: BattleScene에 데스크톱·모바일 위치 연결**

기존 로그 카드 래퍼를 `relative` 컨테이너로 감싸고 `logViewport === "page"`일 때만 추적 훅을 활성화한다.

```tsx
<div className="relative">
  <div ref={logRef} data-battle-log-viewport={logViewport} className={...}>
    {currentTick != null && (
      <div className="sticky top-20 z-20 mb-2 flex justify-end xl:hidden">
        <BattleLogTickIndicator
          currentTick={currentTick}
          maxTick={ATB_TIMELINE_TICK_CAP}
          compact
        />
      </div>
    )}
    <BattleLogList ... />
  </div>
  {currentTick != null && (
    <aside className="absolute inset-y-0 left-full ml-4 hidden w-36 xl:block">
      <div className="sticky top-20">
        <BattleLogTickIndicator
          currentTick={currentTick}
          maxTick={ATB_TIMELINE_TICK_CAP}
        />
      </div>
    </aside>
  )}
</div>
```

표시 컨테이너에는 테스트와 추적 범위를 명확히 하는 `data-battle-log-tick-indicator` 속성을 추가한다.

- [ ] **Step 6: 집중 테스트 통과 확인**

Run:

```bash
npx vitest run src/adventure/battle/BattleLogTickIndicator.test.tsx src/adventure/battle/BattleLogList.test.tsx src/adventure/battle/BattleScene.test.tsx src/adventure/v2/ReplayBattleScene.test.tsx src/adventure/v2/V2BattleLogHandoffView.test.tsx
```

Expected: 모든 테스트 PASS.

- [ ] **Step 7: 정적 검증**

Run:

```bash
npx eslint src/adventure/battle/BattleLogTickIndicator.tsx src/adventure/battle/BattleLogTickIndicator.test.tsx src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx src/adventure/battle/BattleScene.tsx src/adventure/battle/BattleScene.test.tsx src/adventure/v2/combat/combatTimeline.ts src/adventure/v2/combat/combatTimeline.test.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.pvp-atb.ts
npx tsc --noEmit
git diff --check
```

Expected: ESLint 오류 없음, TypeScript 오류 없음, whitespace 오류 없음.

- [ ] **Step 8: Task 2 커밋**

```bash
git add src/adventure/battle/BattleLogTickIndicator.tsx src/adventure/battle/BattleLogTickIndicator.test.tsx src/adventure/battle/BattleScene.tsx src/adventure/battle/BattleScene.test.tsx
git commit -m "feat: show current battle log tick"
```

---

## Final Verification

- [ ] Run focused combat timeline and battle log tests.
- [ ] Run ESLint on every touched TypeScript file.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `git diff --check` and inspect `git status --short`.
- [ ] Confirm no deployment or maintenance command was run.
