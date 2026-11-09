import { describe, expect, it } from "vitest";
import { farmErrorMessage } from "./useFarm";
import { SHARED_NETWORK_LIMIT_ERROR, lifeRequestError } from "./sharedNetworkLimit";

describe("농장 오류 문구", () => {
  it("요청 제한은 잠시 뒤 다시 시도하라고 안내한다", () => {
    expect(farmErrorMessage(new Error("rate_limited"))).toBe(
      "요청이 너무 많아 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요.",
    );
  });
});

describe("농장 같은 인터넷 연결 다계정 제한", () => {
  it("일반 요청 제한과 다르게 이유와 남은 시간을 안내한다", () => {
    expect(
      farmErrorMessage(
        lifeRequestError(
          { ok: false, error: SHARED_NETWORK_LIMIT_ERROR, retryAfterSec: 60 },
          "farm_failed",
        ),
      ),
    ).toBe(
      "같은 인터넷 연결에서 여러 계정이 생활 콘텐츠를 이용하고 있어 잠시 제한되었습니다. 약 1분 뒤 다시 이용할 수 있습니다.",
    );
  });
});
