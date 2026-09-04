// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V2SettingsMenu } from "./V2SettingsMenu";

const authMocks = vi.hoisted(() => ({
  events: [] as string[],
  signOut: vi.fn<() => Promise<void>>(),
}));

vi.mock("next-auth/react", () => ({ signOut: authMocks.signOut }));
vi.mock("./useAttendanceReminder", () => ({
  useAttendanceReminder: () => false,
}));

describe("게임 메뉴 로그아웃", () => {
  beforeEach(() => {
    authMocks.events.length = 0;
    authMocks.signOut.mockReset();
    authMocks.signOut.mockImplementation(async () => {
      authMocks.events.push("authjs");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/auth/logout") {
          authMocks.events.push("cleanup");
        }
        return { ok: false };
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("Auth.js 로그아웃 뒤 잔여 세션 쿠키를 정리한다", async () => {
    render(<V2SettingsMenu />);
    fireEvent.click(screen.getByRole("button", { name: "메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => {
      expect(authMocks.events).toEqual(["authjs", "cleanup"]);
    });
    expect(authMocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
  });

  it("Auth.js 로그아웃이 실패해도 잔여 쿠키 정리를 시도한다", async () => {
    authMocks.signOut.mockImplementation(async () => {
      authMocks.events.push("authjs");
      throw new Error("signout failed");
    });

    render(<V2SettingsMenu />);
    fireEvent.click(screen.getByRole("button", { name: "메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => {
      expect(authMocks.events).toEqual(["authjs", "cleanup"]);
    });
  });
});
