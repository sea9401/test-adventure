// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signIn } from "next-auth/react";
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

describe("카카오 계정 전환", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(signIn).mockClear();
  });

  it("기본 카카오 로그인은 브라우저에 남은 카카오 로그인을 그대로 쓴다", () => {
    render(<SignInButtons ageConfirmed />);

    fireEvent.click(screen.getByRole("button", { name: "카카오톡으로 로그인" }));

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith("kakao", { callbackUrl: "/create" });
  });

  it("다른 카카오 계정으로 로그인은 카카오 로그인 화면을 다시 요청한다", () => {
    render(<SignInButtons ageConfirmed />);

    fireEvent.click(
      screen.getByRole("button", { name: "다른 카카오 계정으로 로그인" }),
    );

    // 게임에서 로그아웃해도 브라우저의 카카오 로그인은 남는다. prompt=login 이 없으면
    // 카카오가 묻지 않고 직전 계정으로 인가해 계정을 바꿀 수 없다.
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith(
      "kakao",
      { callbackUrl: "/create" },
      { prompt: "login" },
    );
  });

  it("연령 확인 전에는 계정 전환 로그인도 표시하지 않는다", () => {
    render(<SignInButtons />);

    expect(
      screen.queryByRole("button", { name: "다른 카카오 계정으로 로그인" }),
    ).toBeNull();
  });
});
