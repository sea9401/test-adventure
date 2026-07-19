import { describe, expect, it } from "vitest";
import {
  createReviewLoginThrottle,
  matchesReviewLoginCredentials,
  readReviewLoginConfig,
  type ReviewLoginConfig,
} from "./reviewLogin";

const CONFIG: ReviewLoginConfig = {
  loginId: "reviewer",
  password: "strong-review-password",
  userEmail: "review@example.com",
};

describe("review login config", () => {
  it("세 환경변수가 모두 유효할 때만 심사용 로그인을 활성화한다", () => {
    expect(
      readReviewLoginConfig({
        REVIEW_LOGIN_ID: " reviewer ",
        REVIEW_LOGIN_PASSWORD: "strong-review-password",
        REVIEW_LOGIN_USER_EMAIL: " review@example.com ",
      }),
    ).toEqual(CONFIG);
    expect(
      readReviewLoginConfig({
        REVIEW_LOGIN_ID: "reviewer",
        REVIEW_LOGIN_PASSWORD: "short",
      }),
    ).toBeNull();
  });

  it("아이디와 비밀번호가 모두 일치할 때만 통과한다", () => {
    expect(
      matchesReviewLoginCredentials(
        { loginId: " reviewer ", password: "strong-review-password" },
        CONFIG,
      ),
    ).toBe(true);
    expect(
      matchesReviewLoginCredentials(
        { loginId: "reviewer", password: "wrong-password" },
        CONFIG,
      ),
    ).toBe(false);
    expect(
      matchesReviewLoginCredentials(
        { loginId: null, password: "strong-review-password" },
        CONFIG,
      ),
    ).toBe(false);
  });
});

describe("review login throttle", () => {
  it("정해진 실패 횟수 뒤 차단하고 시간이 지나면 다시 허용한다", () => {
    const throttle = createReviewLoginThrottle({
      maxFailures: 3,
      windowMs: 1_000,
    });
    const now = 10_000;

    throttle.recordFailure("client", now);
    throttle.recordFailure("client", now + 1);
    expect(throttle.canAttempt("client", now + 2)).toBe(true);
    throttle.recordFailure("client", now + 2);
    expect(throttle.canAttempt("client", now + 3)).toBe(false);
    expect(throttle.canAttempt("client", now + 1_003)).toBe(true);
  });

  it("로그인 성공 시 누적 실패를 지운다", () => {
    const throttle = createReviewLoginThrottle({ maxFailures: 2 });
    throttle.recordFailure("client", 1);
    throttle.clear("client");
    throttle.recordFailure("client", 2);
    expect(throttle.canAttempt("client", 3)).toBe(true);
  });
});
