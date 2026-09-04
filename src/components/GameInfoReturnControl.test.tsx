// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameInfoReturnControl } from "./GameInfoReturnControl";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("게임 등급정보 돌아가기", () => {
  it("보조 탭을 닫아 기존 게임 탭으로 돌아간다", () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
    render(<GameInfoReturnControl />);

    fireEvent.click(
      screen.getByRole("button", { name: "무슨무슨게임으로 돌아가기" }),
    );

    expect(close).toHaveBeenCalledOnce();
  });

  it("브라우저가 탭 닫기를 막으면 기존 게임 탭 선택을 안내한다", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "close").mockImplementation(() => undefined);
    render(<GameInfoReturnControl />);

    fireEvent.click(
      screen.getByRole("button", { name: "무슨무슨게임으로 돌아가기" }),
    );
    act(() => vi.advanceTimersByTime(100));

    expect(screen.getByRole("status").textContent).toContain(
      "기존 게임 탭을 선택해 주세요",
    );
  });
});
