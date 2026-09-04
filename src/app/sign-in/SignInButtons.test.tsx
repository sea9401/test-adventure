// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInButtons } from "./SignInButtons";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

describe("로그인 전 연령 확인", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("체크 전에는 확인 요청을 보낼 수 없고 체크 후 명시적인 확인만 전송한다", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInButtons />);

    const submit = screen.getByRole("button", { name: "확인하고 계속" });
    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: "본인은 만 14세 이상입니다." }));
    expect(submit.hasAttribute("disabled")).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/age-eligibility", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
    });
  });

  it("서버 확인을 마친 상태에서만 실제 로그인 수단을 표시한다", () => {
    render(<SignInButtons ageConfirmed />);

    expect(screen.getByRole("button", { name: "카카오톡으로 로그인" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
