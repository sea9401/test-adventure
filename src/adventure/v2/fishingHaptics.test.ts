import { describe, expect, it, vi } from "vitest";
import {
  FISHING_BITE_HAPTIC_PATTERN,
  triggerFishingBiteHaptic,
} from "./fishingHaptics";

describe("낚시 입질 햅틱", () => {
  it("짧게 구분되는 두 번의 진동 패턴을 한 번 요청한다", () => {
    const vibrate = vi.fn(() => true);

    expect(triggerFishingBiteHaptic({ vibrate })).toBe(true);
    expect(FISHING_BITE_HAPTIC_PATTERN).toEqual([45, 35, 70]);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([45, 35, 70]);
  });

  it("진동 API가 없으면 아무 작업 없이 실패를 알린다", () => {
    expect(triggerFishingBiteHaptic({})).toBe(false);
  });

  it("브라우저가 진동 호출을 거부해도 예외를 전파하지 않는다", () => {
    const vibrate = vi.fn(() => {
      throw new DOMException("not allowed", "NotAllowedError");
    });

    expect(triggerFishingBiteHaptic({ vibrate })).toBe(false);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});
