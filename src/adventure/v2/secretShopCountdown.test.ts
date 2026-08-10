import { describe, expect, it } from "vitest";
import {
  correctedSecretShopExpiry,
  formatSecretShopRemaining,
} from "./secretShopCountdown";

describe("비밀 상점 남은 시간", () => {
  it("남은 유효 시간을 분:초 형식으로 올림 표시한다", () => {
    expect(formatSecretShopRemaining(29 * 60_000 + 59_000)).toBe("29:59");
    expect(formatSecretShopRemaining(1)).toBe("00:01");
    expect(formatSecretShopRemaining(-1)).toBe("00:00");
  });

  it("서버와 클라이언트 시계 차이를 보정한 종료 시각을 만든다", () => {
    expect(correctedSecretShopExpiry(130_000, 100_000, 1_000_000)).toBe(
      1_030_000,
    );
  });
});
