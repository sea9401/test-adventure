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
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    vi.useRealTimers();
  });

  it("새 탭의 게임 진입 시 3.5초 동안 12세·폭력성 고지를 표시한다", () => {
    render(<GameRatingLaunchNotice />);

    const notice = screen.getByRole("status", { name: "게임 이용등급 안내" });
    expect(notice.textContent).toContain("12세 미만은 이용할 수 없습니다");
    expect(notice.textContent).toContain("폭력성");
    expect(notice.getAttribute("aria-modal")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      window.sessionStorage.getItem("msmsge.game-rating-notice.seen.v1"),
    ).toBeNull();

    act(() => vi.advanceTimersByTime(GAME_RATING_NOTICE_MS - 1));
    expect(screen.queryByRole("status")).not.toBeNull();
    expect(
      window.sessionStorage.getItem("msmsge.game-rating-notice.seen.v1"),
    ).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
    expect(window.sessionStorage.getItem("msmsge.game-rating-notice.seen.v1")).toBe(
      "1",
    );
  });

  it("같은 탭에서 새로고침하면 등급 고지를 다시 표시하지 않는다", () => {
    const firstView = render(<GameRatingLaunchNotice />);
    expect(screen.queryByRole("status")).not.toBeNull();
    act(() => vi.advanceTimersByTime(GAME_RATING_NOTICE_MS));

    firstView.unmount();
    render(<GameRatingLaunchNotice />);
    act(() => vi.advanceTimersByTime(0));

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("세션 저장소를 사용할 수 없으면 보수적으로 고지를 표시한다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    render(<GameRatingLaunchNotice />);

    expect(
      screen.queryByRole("status", { name: "게임 이용등급 안내" }),
    ).not.toBeNull();
  });

  it("정책 페이지 직접 방문에서는 표시하지 않는다", () => {
    pathname = "/privacy";
    render(<GameRatingLaunchNotice />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("같은 루트 수명에서 정책 페이지에서 게임으로 이동하면 한 번만 표시한다", () => {
    pathname = "/privacy";
    const view = render(<GameRatingLaunchNotice />);
    expect(screen.queryByRole("status")).toBeNull();

    pathname = "/";
    view.rerender(<GameRatingLaunchNotice />);
    expect(screen.queryByRole("status")).not.toBeNull();

    act(() => vi.advanceTimersByTime(GAME_RATING_NOTICE_MS));
    expect(screen.queryByRole("status")).toBeNull();

    pathname = "/town";
    view.rerender(<GameRatingLaunchNotice />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("게임 경로 접두사가 비슷한 공개 경로는 진입으로 오인하지 않는다", () => {
    expect(isGameEntryPath("/town/fishing")).toBe(true);
    expect(isGameEntryPath("/township")).toBe(false);
    expect(isGameEntryPath("/game-info")).toBe(false);
  });
});
