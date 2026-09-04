import { describe, expect, it } from "vitest";
import {
  isAllowedUgcReportReason,
  isUgcReportReason,
  isUgcReportSubject,
  isUgcSourceType,
  normalizeUgcSourceId,
} from "./ugc-safety";

describe("UGC 신고 입력 검증", () => {
  it("지원하는 콘텐츠 출처만 허용한다", () => {
    expect(isUgcSourceType("bulletin_post")).toBe(true);
    expect(isUgcSourceType("bulletin_comment")).toBe(true);
    expect(isUgcSourceType("chat_message")).toBe(true);
    expect(isUgcSourceType("inbox_message")).toBe(true);
    expect(isUgcSourceType("profile")).toBe(true);
    expect(isUgcSourceType("guild_profile")).toBe(true);
    expect(isUgcSourceType("chat_room")).toBe(true);
    expect(isUgcSourceType("marketplace_trade")).toBe(true);
    expect(isUgcSourceType("marketplace_listing")).toBe(true);
    expect(isUgcSourceType("unknown")).toBe(false);
  });

  it("숫자와 문자열 출처 식별자를 안전한 문자열로 정규화한다", () => {
    expect(normalizeUgcSourceId(42)).toBe("42");
    expect(normalizeUgcSourceId("  모험가  ")).toBe("모험가");
    expect(normalizeUgcSourceId(0)).toBeNull();
    expect(normalizeUgcSourceId(" ")).toBeNull();
    expect(normalizeUgcSourceId("가".repeat(129))).toBeNull();
  });

  it("콘텐츠 신고와 사용자 신고를 구분한다", () => {
    expect(isUgcReportSubject("content")).toBe(true);
    expect(isUgcReportSubject("user")).toBe(true);
    expect(isUgcReportSubject("all")).toBe(false);
  });

  it("정해진 신고 사유 외의 값을 거부한다", () => {
    expect(isUgcReportReason("harassment")).toBe(true);
    expect(isUgcReportReason("personal_info")).toBe(true);
    expect(isUgcReportReason("unknown")).toBe(false);
  });

  it("출처별 신고 사유만 허용한다", () => {
    expect(
      isAllowedUgcReportReason("marketplace_trade", "abnormal_price"),
    ).toBe(true);
    expect(
      isAllowedUgcReportReason("marketplace_trade", "market_manipulation"),
    ).toBe(true);
    expect(
      isAllowedUgcReportReason("marketplace_trade", "real_money_trade"),
    ).toBe(true);
    expect(isAllowedUgcReportReason("marketplace_trade", "other")).toBe(true);
    expect(
      isAllowedUgcReportReason("marketplace_listing", "abnormal_price"),
    ).toBe(true);
    expect(
      isAllowedUgcReportReason("marketplace_listing", "harassment"),
    ).toBe(false);
    expect(
      isAllowedUgcReportReason("marketplace_trade", "harassment"),
    ).toBe(false);
    expect(
      isAllowedUgcReportReason("bulletin_post", "abnormal_price"),
    ).toBe(false);
    expect(isAllowedUgcReportReason("bulletin_post", "harassment")).toBe(true);
  });
});
