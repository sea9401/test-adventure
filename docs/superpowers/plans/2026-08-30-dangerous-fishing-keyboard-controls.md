# Dangerous Fishing Keyboard Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위험 해역 실시간 낚시의 감아올리기 버튼에서 `Space`와 `Enter`를 마우스 누름/놓기와 동일하게 처리한다.

**Architecture:** 기존 `useDangerousFishingRealtime`의 포인터·키보드 입력 소스 결합과 서버 재현용 `reel`/`release` 기록을 그대로 사용한다. 키보드 이벤트 판별만 `Space`와 `Enter`를 허용하도록 확장하고 hook 및 DOM 수준 회귀 테스트로 동작을 고정한다.

**Tech Stack:** TypeScript 5, React 19 client component hook, Next.js 16, Vitest 4, Testing Library

## Global Constraints

- `Space`와 `Enter`의 `keydown`/`keyup`을 각각 마우스 `pointerdown`/`pointerup`과 같은 상태 전환으로 처리한다.
- 자동 반복은 추가 입력을 만들지 않으며 키 기본 동작을 막는다.
- 포인터와 키보드가 겹치면 모든 입력이 해제될 때만 `release`로 전환한다.
- 위험 해역 밸런스, 시뮬레이션, 서버 API, 일반 낚시는 변경하지 않는다.
- 배포·푸시·PR 생성은 하지 않는다.

---

## File Structure

- Modify `src/adventure/v2/useDangerousFishingRealtime.test.tsx`: hook의 `Space`·`Enter` 입력 상태와 기록 회귀 테스트.
- Modify `src/adventure/v2/DangerousFishingRealtimePanel.test.tsx`: 실제 버튼의 두 키 down/up DOM 동작 회귀 테스트.
- Modify `src/adventure/v2/useDangerousFishingRealtime.ts`: 키보드 감아올리기 입력 판별을 `Space`·`Enter`로 확장.

---

### Task 1: Space·Enter 감아올리기 입력

**Files:**
- Modify: `src/adventure/v2/useDangerousFishingRealtime.test.tsx:75-87,350-384`
- Modify: `src/adventure/v2/DangerousFishingRealtimePanel.test.tsx:262-311`
- Modify: `src/adventure/v2/useDangerousFishingRealtime.ts:75-80,827-850`

**Interfaces:**
- Consumes: `onKeyDown(event)`과 `onKeyUp(event)`의 기존 `KeyboardInputEvent` 계약.
- Produces: `Space` 또는 `Enter`에서 `holding`과 재현 입력 mode를 `reel`/`release`로 전환하는 동일한 hook API.

- [ ] **Step 1: Enter 실패 회귀 테스트 작성**

hook 테스트의 키 픽스처가 `Space`와 `Enter`를 만들 수 있게 하고, 기존 입력 테스트를 두 키에 대해 실행한다.

```tsx
function keyboardEvent(input: "space" | "enter" = "space", repeat = false) {
  return {
    code: input === "space" ? "Space" : "Enter",
    key: input === "space" ? " " : "Enter",
    repeat,
    preventDefault: vi.fn(),
  };
}

it.each(["space", "enter"] as const)(
  "pointer와 %s 입력을 같은 reel/release 전환으로 처리하고 반복 키다운을 무시한다",
  (input) => {
    const encounter = encounterFixture();
    vi.stubGlobal("fetch", successfulFetch(encounter));
    const { result } = renderRealtime(encounter);

    const pointer = pointerEvent();
    act(() => result.current.onPointerDown(pointer as never));
    expect(result.current.holding).toBe(true);
    expect(result.current.view.mode).toBe("reel");
    act(() => result.current.onPointerUp(pointer as never));
    expect(result.current.holding).toBe(false);
    expect(result.current.view.mode).toBe("release");

    const repeated = keyboardEvent(input, true);
    act(() => result.current.onKeyDown(repeated as never));
    expect(repeated.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.holding).toBe(false);

    const keyDown = keyboardEvent(input);
    act(() => result.current.onKeyDown(keyDown as never));
    expect(keyDown.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.holding).toBe(true);
    expect(result.current.view.mode).toBe("reel");

    const keyUp = keyboardEvent(input);
    act(() => result.current.onKeyUp(keyUp as never));
    expect(keyUp.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.holding).toBe(false);
    expect(result.current.view.mode).toBe("release");
  },
);
```

panel 테스트도 두 키의 실제 DOM 이벤트를 검증한다.

```tsx
it.each([
  ["Space", " "],
  ["Enter", "Enter"],
] as const)("%s의 기본 동작과 repeat를 막고 keyup에서 줄을 놓는다", (code, key) => {
  render(
    <DangerousFishingRealtimePanel
      {...baseProps}
      encounter={encounterFixture()}
    />,
  );
  const button = screen.getByRole("button", { name: "누르고 감아올리기" });
  const repeat = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    code,
    key,
    repeat: true,
  });
  fireEvent(button, repeat);
  expect(repeat.defaultPrevented).toBe(true);
  expect(button.getAttribute("aria-pressed")).toBe("false");

  const down = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    code,
    key,
  });
  fireEvent(button, down);
  expect(down.defaultPrevented).toBe(true);
  expect(button.getAttribute("aria-pressed")).toBe("true");

  const up = new KeyboardEvent("keyup", {
    bubbles: true,
    cancelable: true,
    code,
    key,
  });
  fireEvent(button, up);
  expect(up.defaultPrevented).toBe(true);
  expect(button.getAttribute("aria-pressed")).toBe("false");
});
```

- [ ] **Step 2: 실패를 확인**

Run: `npm test -- src/adventure/v2/useDangerousFishingRealtime.test.tsx src/adventure/v2/DangerousFishingRealtimePanel.test.tsx`

Expected: `Enter` 케이스가 `holding`/`aria-pressed`를 `true`로 바꾸지 못해 FAIL하고 기존 `Space` 케이스는 PASS한다.

- [ ] **Step 3: 최소 구현 작성**

`useDangerousFishingRealtime.ts`에 키 판별 헬퍼를 두고 두 handler에서 공유한다.

```ts
function isReelKeyboardInput(event: KeyboardInputEvent): boolean {
  return (
    event.code === "Space" ||
    event.key === " " ||
    event.code === "Enter" ||
    event.key === "Enter"
  );
}
```

`onKeyDown`과 `onKeyUp`의 기존 Space 조건을 `if (!isReelKeyboardInput(event)) return;`으로 교체한다. 나머지 반복 방지, 포인터 결합, `appendMode` 로직은 바꾸지 않는다.

- [ ] **Step 4: 집중 테스트와 정적 검증 실행**

Run: `npm test -- src/adventure/v2/useDangerousFishingRealtime.test.tsx src/adventure/v2/DangerousFishingRealtimePanel.test.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx`

Expected: 모든 지정 테스트 PASS.

Run: `npx eslint src/adventure/v2/useDangerousFishingRealtime.ts src/adventure/v2/useDangerousFishingRealtime.test.tsx src/adventure/v2/DangerousFishingRealtimePanel.test.tsx`

Expected: exit 0, 오류와 경고 없음.

Run: `git diff --check`

Expected: exit 0.

- [ ] **Step 5: 구현 커밋**

```bash
git add src/adventure/v2/useDangerousFishingRealtime.ts src/adventure/v2/useDangerousFishingRealtime.test.tsx src/adventure/v2/DangerousFishingRealtimePanel.test.tsx
git commit -m "fix: support enter in dangerous fishing controls"
```
