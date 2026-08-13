import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_VERIFICATION_REQUEST_TIMEOUT_MS,
  parseActivityVerificationChallenge,
  submitActivityVerification,
} from "./useActivityVerification";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("parseActivityVerificationChallenge", () => {
  it("관리자 요청 여부를 사람 확인 화면 모델에 보존한다", () => {
    expect(
      parseActivityVerificationChallenge(
        {
          error: "human_verification_required",
          activity: "mining",
          siteKey: "turnstile-site",
          captchaSiteKey: "captcha-site",
          reason: "strong_signal",
          manualTest: true,
        },
        "mining",
      ),
    ).toEqual({
      activity: "mining",
      siteKey: "turnstile-site",
      captchaSiteKey: "captcha-site",
      reason: "strong_signal",
      manualTest: true,
    });
  });

  it("기존 서버 응답은 실제 판정으로 해석한다", () => {
    expect(
      parseActivityVerificationChallenge(
        {
          error: "human_verification_required",
          activity: "fishing",
          siteKey: "turnstile-site",
          reason: "volume",
        },
        "fishing",
      ),
    ).toMatchObject({ manualTest: false });
  });
});

describe("submitActivityVerification", () => {
  it("인증 서버 응답이 멈추면 제한 시간 뒤 실패로 복구한다", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const result = submitActivityVerification(
      "fishing",
      { turnstileToken: "token" },
      fetcher,
    );
    await vi.advanceTimersByTimeAsync(ACTIVITY_VERIFICATION_REQUEST_TIMEOUT_MS);

    await expect(result).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("이전 요청이 이미 인증 상태를 해제했다면 성공으로 복구한다", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { ok: false, error: "verification_not_required" },
        { status: 409 },
      ),
    );

    await expect(
      submitActivityVerification(
        "fishing",
        { turnstileToken: "fresh-token" },
        fetcher,
      ),
    ).resolves.toBe(true);
  });
});
