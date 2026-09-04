import { describe, expect, it } from "vitest";
import {
  createRequestProfile,
  currentRequestProfile,
  runOutsideRequestProfile,
  runWithRequestProfile,
} from "./requestContext";

describe("request profiler context", () => {
  it("백그라운드 작업 동안 요청 문맥을 비우고 호출자 문맥을 복원한다", () => {
    const profile = createRequestProfile({
      feature: "life",
      operation: "POST /api/v2/fishing/reel",
      method: "POST",
      startedAtNs: BigInt(0),
      socketBytesAtStart: 0,
    });

    runWithRequestProfile(profile, () => {
      expect(currentRequestProfile()).toBe(profile);
      runOutsideRequestProfile(() => {
        expect(currentRequestProfile()).toBeUndefined();
      });
      expect(currentRequestProfile()).toBe(profile);
    });

    expect(currentRequestProfile()).toBeUndefined();
  });
});
