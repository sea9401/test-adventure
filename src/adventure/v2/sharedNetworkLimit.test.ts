import { describe, expect, it } from "vitest";
import {
  SHARED_NETWORK_LIMIT_ERROR,
  SharedNetworkLimitError,
  lifeRequestError,
  sharedNetworkLimitMessage,
} from "./sharedNetworkLimit";

describe("같은 인터넷 연결 다계정 제한 안내", () => {
  it("서버 응답이 다계정 제한이면 남은 시간을 담은 오류로 바꾼다", () => {
    const error = lifeRequestError(
      { ok: false, error: SHARED_NETWORK_LIMIT_ERROR, retryAfterSec: 421 },
      "woodcutting_start_failed",
    );
    expect(error).toBeInstanceOf(SharedNetworkLimitError);
    expect(error.message).toBe(SHARED_NETWORK_LIMIT_ERROR);
    expect(sharedNetworkLimitMessage(error)).toBe(
      "같은 인터넷 연결에서 여러 계정이 생활 콘텐츠를 이용하고 있어 잠시 제한되었습니다. 약 8분 뒤 다시 이용할 수 있습니다.",
    );
  });

  it("다른 실패는 기존 오류 코드를 유지하고 안내 문구를 만들지 않는다", () => {
    const error = lifeRequestError({ ok: false, error: "rate_limited" }, "cast_failed");
    expect(error).not.toBeInstanceOf(SharedNetworkLimitError);
    expect(error.message).toBe("cast_failed");
    expect(sharedNetworkLimitMessage(error)).toBeNull();
    expect(sharedNetworkLimitMessage(null)).toBeNull();
  });

  it("남은 시간을 모르면 최대 제한 시간으로 안내한다", () => {
    expect(sharedNetworkLimitMessage(new Error(SHARED_NETWORK_LIMIT_ERROR))).toBe(
      "같은 인터넷 연결에서 여러 계정이 생활 콘텐츠를 이용하고 있어 잠시 제한되었습니다. 약 10분 뒤 다시 이용할 수 있습니다.",
    );
  });
});
