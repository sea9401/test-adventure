// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BattleLogTickIndicator,
  currentBattleLogTickForViewport,
  useBattleLogCurrentTick,
} from "./BattleLogTickIndicator";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function TickTrackingHarness() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const currentTick = useBattleLogCurrentTick(
    viewportRef,
    400,
    true,
    "stable-log",
  );
  return (
    <div ref={viewportRef}>
      <div data-battle-log-group-tick="400">첫 구간</div>
      <div data-battle-log-group-tick="800">둘째 구간</div>
      <output aria-label="현재 전투 틱">{currentTick}</output>
    </div>
  );
}

describe("전투 로그 현재 시간대 선택", () => {
  const groups = [
    { tick: 400, top: -80, bottom: 20 },
    { tick: 800, top: 24, bottom: 180 },
    { tick: 1_200, top: 184, bottom: 340 },
  ];

  it("화면 상단에 일부라도 보이는 첫 로그 묶음의 틱을 고른다", () => {
    expect(currentBattleLogTickForViewport(groups, 0, 300, 3_000)).toBe(400);
    expect(currentBattleLogTickForViewport(groups, 30, 300, 3_000)).toBe(800);
  });

  it("화면 밖에서는 스크롤 방향 끝의 묶음을 고른다", () => {
    expect(currentBattleLogTickForViewport(groups, -400, -100, 3_000)).toBe(
      400,
    );
    expect(currentBattleLogTickForViewport(groups, 500, 800, 3_000)).toBe(
      1_200,
    );
  });

  it("손상된 틱은 전투 시간 범위로 제한하고 빈 로그는 숨긴다", () => {
    expect(
      currentBattleLogTickForViewport(
        [{ tick: 3_500, top: 10, bottom: 50 }],
        0,
        300,
        3_000,
      ),
    ).toBe(3_000);
    expect(
      currentBattleLogTickForViewport(
        [{ tick: -20, top: 10, bottom: 50 }],
        0,
        300,
        3_000,
      ),
    ).toBe(0);
    expect(currentBattleLogTickForViewport([], 0, 300, 3_000)).toBeNull();
  });
});

describe("전투 로그 현재 시간대 표시", () => {
  it("현재 틱과 최대 틱을 천 단위 구분해서 불투명 카드에 표시한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogTickIndicator currentTick={1_500} maxTick={3_000} />,
    );

    expect(html).toContain("현재 시간대");
    expect(html).toContain("1,500 / 3,000틱");
    expect(html).toContain('data-battle-log-tick-indicator="full"');
    expect(html).toContain("bg-white");
  });

  it("좁은 화면용 배지는 한 줄 compact 표식을 제공한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogTickIndicator currentTick={800} maxTick={3_000} compact />,
    );

    expect(html).toContain('data-battle-log-tick-indicator="compact"');
    expect(html).toContain("800 / 3,000틱");
  });

  it("표시 단계에서도 현재 틱을 최대 시간 안으로 제한한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogTickIndicator currentTick={3_500} maxTick={3_000} />,
    );

    expect(html).toContain("3,000 / 3,000틱");
    expect(html).not.toContain("3,500 / 3,000틱");
  });
});

describe("전투 로그 현재 시간대 스크롤 추적", () => {
  it("관찰 API가 없을 때 스크롤 후 최상단 로그 묶음으로 갱신한다", () => {
    const positions = new Map([
      ["400", { top: -80, bottom: 20 }],
      ["800", { top: 24, bottom: 180 }],
    ]);
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        const position = positions.get(this.dataset.battleLogGroupTick ?? "");
        const top = position?.top ?? 0;
        const bottom = position?.bottom ?? 0;
        return {
          top,
          bottom,
          left: 0,
          right: 100,
          width: 100,
          height: bottom - top,
          x: 0,
          y: top,
          toJSON: () => ({}),
        };
      },
    );
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    render(<TickTrackingHarness />);
    expect(screen.getByLabelText("현재 전투 틱").textContent).toBe("400");

    positions.set("400", { top: -120, bottom: -20 });
    positions.set("800", { top: 0, bottom: 156 });
    fireEvent.scroll(window);
    act(() => {
      for (const callback of frames.splice(0)) callback(0);
    });

    expect(screen.getByLabelText("현재 전투 틱").textContent).toBe("800");
  });
});
