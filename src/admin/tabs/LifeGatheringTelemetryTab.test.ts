import { describe, expect, it } from "vitest";
import { guardDetail } from "./LifeGatheringTelemetryTab";

describe("guardDetail", () => {
  it("관리자가 요청한 사람 확인을 운영 테스트로 구분한다", () => {
    expect(guardDetail({ manualTest: true, mode: "captcha" })).toBe(
      "운영 테스트 · 2단계 hCaptcha",
    );
  });
});
