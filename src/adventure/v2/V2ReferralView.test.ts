import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchReferralSummary,
  referralProgressStatus,
} from "./V2ReferralView";

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
