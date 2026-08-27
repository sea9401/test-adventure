// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchReferralSummary,
  referralProgressStatus,
} from "./V2ReferralView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

function summaryResponse(hasReferrer: boolean) {
  return {
    ok: true,
    code: null,
    hasReferrer,
    newUserStaminaPotions: 2,
    referrerSignupStaminaPotions: 2,
    tutorialTaskStaminaPotions: 2,
    tutorialTasks: [],
    myReferralProgress: null,
    attributedCount: 0,
    totalRewardStaminaPotions: 0,
    referrals: [],
  };
}

describe("홍보 이벤트 참여자 상태 문구", () => {
  it("탈퇴한 참여자에게 현재 사냥터를 표시하지 않는다", () => {
    expect(
      referralProgressStatus({
        deleted: true,
        completedRewardStages: 3,
      }),
    ).toBe("탈퇴 · 보상 완료 3단계");
  });

  it("활성 참여자는 사냥 깊이 대신 전체 작업 진행도만 표시한다", () => {
    const status = referralProgressStatus({
      deleted: false,
      completedRewardStages: 3,
    });
    expect(status).toBe("보상 완료 3단계");
    expect(status).not.toContain("사냥터");
  });
});

describe("홍보 진행도 불러오기", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("서버 진행도를 동기화한 뒤 최신 요약을 조회한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ ok: true, code: null }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchReferralSummary();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/referrals/me/sync", {
      method: "POST",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/referrals/me", {
      cache: "no-store",
    });
  });

  it("동기화가 실패하면 오래된 요약을 성공으로 표시하지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({ ok: false }, { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchReferralSummary()).rejects.toThrow("sync failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("추천인 등록 폼 노출", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("아직 귀속되지 않은 계정에만 사후 등록 폼을 보여준다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ok: true }))
        .mockResolvedValueOnce(Response.json(summaryResponse(false))),
    );

    const { V2ReferralView } = await import("./V2ReferralView");
    render(createElement(V2ReferralView, { embedded: true }));

    expect(
      await screen.findByLabelText("추천인의 홍보 링크 또는 코드"),
    ).toBeTruthy();
  });

  it("이미 귀속된 계정에는 영구 등록 폼을 다시 보여주지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ok: true }))
        .mockResolvedValueOnce(Response.json(summaryResponse(true))),
    );

    const { V2ReferralView } = await import("./V2ReferralView");
    render(createElement(V2ReferralView, { embedded: true }));

    await screen.findByText("아직 내 링크로 합류한 모험가가 없습니다.");
    expect(
      screen.queryByLabelText("추천인의 홍보 링크 또는 코드"),
    ).toBeNull();
  });
});
