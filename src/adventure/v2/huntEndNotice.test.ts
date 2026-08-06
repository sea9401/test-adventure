import { describe, expect, it } from "vitest";
import { huntEndReasonText } from "./huntEndNotice";

describe("전투 종료 사유 안내", () => {
  it("자동 전투의 주요 종료 사유를 구분한다", () => {
    expect(huntEndReasonText("stamina", 100)).toBe(
      "스태미너가 부족합니다.",
    );
    expect(huntEndReasonText("recovery", 100)).toBe(
      "체력이 부족해 회복이 필요합니다.",
    );
    expect(huntEndReasonText("rare_map_exhausted", 100)).toContain(
      "남은 전투 횟수",
    );
    expect(huntEndReasonText("request_failed", 100)).toContain(
      "다시 시도",
    );
  });

  it("충전약 정지 기준 수치를 표시한다", () => {
    expect(huntEndReasonText("potion", 1_000)).toContain("1,000 이하");
  });
});
