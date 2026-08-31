import { describe, expect, it } from "vitest";
import {
  correctedRareMapExpiry,
  formatRareMapRemaining,
} from "./rareMapCountdown";

describe("희귀 탐사 남은 시간", () => {
  it("서버에 남은 시간을 클라이언트 수신 시각 기준으로 보정한다", () => {
    expect(correctedRareMapExpiry(1_000_000, 2_200_000, 9_000_000)).toBe(
      9_600_000,
    );
  });

  it("남은 초를 올림해 MM:SS로 표시하고 만료값은 0으로 제한한다", () => {
    expect(formatRareMapRemaining(29 * 60_000 + 59_000)).toBe("29:59");
    expect(formatRareMapRemaining(1)).toBe("00:01");
    expect(formatRareMapRemaining(-1)).toBe("00:00");
  });
});
