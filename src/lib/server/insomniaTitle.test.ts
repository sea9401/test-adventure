import { describe, expect, it } from "vitest";
import { isInsomniaTitleWindow, koreanHourOf } from "@/lib/server/insomniaTitle";

describe("insomniaTitle", () => {
  it("KST 기준 0시부터 4시 전까지 불면증 칭호 시간대로 본다", () => {
    expect(isInsomniaTitleWindow(new Date("2026-07-01T14:59:00.000Z"))).toBe(
      false,
    ); // 23:59 KST
    expect(isInsomniaTitleWindow(new Date("2026-07-01T15:00:00.000Z"))).toBe(
      true,
    ); // 00:00 KST
    expect(isInsomniaTitleWindow(new Date("2026-07-01T18:59:00.000Z"))).toBe(
      true,
    ); // 03:59 KST
    expect(isInsomniaTitleWindow(new Date("2026-07-01T19:00:00.000Z"))).toBe(
      false,
    ); // 04:00 KST
  });

  it("서버 현지 시간대와 무관하게 서울 시각을 계산한다", () => {
    expect(koreanHourOf(new Date("2026-07-01T15:30:00.000Z"))).toBe(0);
  });
});
