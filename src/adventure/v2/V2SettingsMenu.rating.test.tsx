// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V2SettingsMenu } from "./V2SettingsMenu";

vi.mock("./useAttendanceReminder", () => ({
  useAttendanceReminder: () => false,
}));

describe("게임 메뉴 등급정보 링크", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("게임 상태를 유지하도록 등급정보를 새 탭으로 연다", () => {
    render(<V2SettingsMenu />);
    fireEvent.click(screen.getByRole("button", { name: "메뉴" }));

    const link = screen.getByRole("link", { name: "게임 등급정보" });
    expect(link.getAttribute("href")).toBe("/game-info?from=game");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });
});
