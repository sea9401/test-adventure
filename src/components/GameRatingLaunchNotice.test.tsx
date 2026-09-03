// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_RATING_NOTICE_MS, isGameEntryPath } from "@/lib/gameRating";

let pathname = "/sign-in";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

import { GameRatingLaunchNotice } from "./GameRatingLaunchNotice";

describe("게임 최초 진입 등급 고지", () => {
  beforeEach(() => {
    pathname = "/sign-in";
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("게임 진입 시 3.5초 동안 건너뛸 수 없는 12세 고지를 표시한다", () => {
    render(<GameRatingLaunchNotice />);

    const dialog = screen.getByRole("dialog", { name: "게임 이용등급 안내" });
    expect(dialog.textContent).toContain("12세 미만은 이용할 수 없습니다");
    expect(screen.queryByRole("button")).toBeNull();

    act(() => vi.advanceTimersByTime(GAME_RATING_NOTICE_MS - 1));
    expect(screen.queryByRole("dialog")).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("정책 페이지 직접 방문에서는 표시하지 않는다", () => {
    pathname = "/privacy";
    render(<GameRatingLaunchNotice />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("같은 루트 수명에서 정책 페이지에서 게임으로 이동하면 한 번만 표시한다", () => {
    pathname = "/privacy";
    const view = render(<GameRatingLaunchNotice />);
    expect(screen.queryByRole("dialog")).toBeNull();

    pathname = "/";
    view.rerender(<GameRatingLaunchNotice />);
    expect(screen.queryByRole("dialog")).not.toBeNull();

    act(() => vi.advanceTimersByTime(GAME_RATING_NOTICE_MS));
    expect(screen.queryByRole("dialog")).toBeNull();

    pathname = "/town";
    view.rerender(<GameRatingLaunchNotice />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("게임 경로 접두사가 비슷한 공개 경로는 진입으로 오인하지 않는다", () => {
    expect(isGameEntryPath("/town/fishing")).toBe(true);
    expect(isGameEntryPath("/township")).toBe(false);
    expect(isGameEntryPath("/game-info")).toBe(false);
  });
});
