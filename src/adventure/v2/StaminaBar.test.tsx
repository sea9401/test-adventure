// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaminaBar, StaminaPotionModal, staminaRegenSummary } from "./StaminaBar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("전투용 스태미너 바", () => {
  it("작은 표시에서도 회복과 전투 후 서버 수치를 반영한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T00:00:00Z"));
    const anchor = Date.now();
    const { rerender } = render(
      <StaminaBar compact state={{ current: 100, lastUpdatedAt: anchor }} max={3000} regenBonusPct={20} />,
    );
    expect(screen.getByText("100 / 3,000")).toBeTruthy();
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByText("101 / 3,000")).toBeTruthy();
    rerender(<StaminaBar compact state={{ current: 51, lastUpdatedAt: Date.now() }} max={3000} regenBonusPct={20} />);
    expect(screen.getByText("51 / 3,000")).toBeTruthy();
    expect(screen.getByText(/지원권 \+20%/)).toBeTruthy();
  });

  it("작은 표시에서 포션 사용 창을 열고 닫는다", () => {
    render(<StaminaBar compact state={{ current: 100, lastUpdatedAt: Date.now() }} potions={2} onUsePotion={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "스태미나 포션 사용" }));
    expect(screen.getByRole("button", { name: "2개 사용" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("button", { name: "2개 사용" })).toBeNull();
  });
});

describe("상단 바의 스태미나 창", () => {
  it("회복 속도와 최대치까지 남은 시간을 보여 준다", () => {
    render(
      <StaminaPotionModal
        potions={0}
        current={1_820}
        max={2_000}
        regen={{ secondsPerPoint: 12, untilFull: "36분" }}
        onUse={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("12초마다 1")).toBeTruthy();
    expect(screen.getByText("36분")).toBeTruthy();
  });

  it("회복 요약을 계산한다", () => {
    const now = Date.UTC(2026, 9, 3, 0, 0, 0);
    const summary = staminaRegenSummary({ current: 1_990, lastUpdatedAt: now }, now, 2_000, 0);
    expect(summary.secondsPerPoint).toBe(12);
    expect(summary.untilFull).toBe("2분");
    expect(staminaRegenSummary({ current: 2_000, lastUpdatedAt: now }, now, 2_000, 0).untilFull).toBe("회복 완료");
  });
});

