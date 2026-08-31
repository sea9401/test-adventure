// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferralRegistrationForm } from "./ReferralRegistrationForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("추천인 사후 등록", () => {
  it("홍보 링크나 코드를 영구 추천인으로 등록하고 최신 진행도를 요청한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        staminaPotions: 10,
        newlyCompletedTaskIds: ["hunt_depth_24"],
      }),
    );
    const onRegistered = vi.fn(async () => undefined);
    vi.stubGlobal("fetch", fetchMock);

    render(<ReferralRegistrationForm onRegistered={onRegistered} />);

    expect(screen.getByText(/계정당 한 번만/)).toBeTruthy();
    expect(screen.getByText(/이미 완료한 단계도 소급/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("추천인의 홍보 링크 또는 코드"), {
      target: { value: "https://msmsge.com/r/abcdef0123456789" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추천인 등록" }));

    await waitFor(() => expect(onRegistered).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/referrals/me/attribute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        referral: "https://msmsge.com/r/abcdef0123456789",
      }),
    });
  });

  it.each([
    ["invalid_referral", "유효한 홍보 링크 또는 코드를 확인해 주세요."],
    ["self_referral", "내 홍보 코드는 추천인으로 등록할 수 없습니다."],
    [
      "already_attributed",
      "이미 추천인이 등록되었거나 홍보 보상을 받은 계정입니다.",
    ],
  ])("서버 오류 %s를 사용자가 해결할 수 있는 문구로 안내한다", async (error, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ ok: false, error }, { status: 409 }),
      ),
    );
    const onRegistered = vi.fn();

    render(<ReferralRegistrationForm onRegistered={onRegistered} />);
    fireEvent.change(screen.getByLabelText("추천인의 홍보 링크 또는 코드"), {
      target: { value: "abcdef0123456789" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추천인 등록" }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it("알 수 없는 네트워크 실패는 다시 시도할 수 있게 안내한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<ReferralRegistrationForm onRegistered={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("추천인의 홍보 링크 또는 코드"), {
      target: { value: "abcdef0123456789" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추천인 등록" }));

    expect(
      await screen.findByText("추천인을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요."),
    ).toBeTruthy();
  });
});
