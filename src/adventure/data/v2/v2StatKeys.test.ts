import { describe, expect, it } from "vitest";
import { V2_STAT_DESCRIPTIONS } from "./v2StatKeys";

describe("V2_STAT_DESCRIPTIONS 생애 자원 역할", () => {
  it("STR·VIT·SPI·INT의 자원 성장 최솟값/최댓값 역할을 설명한다", () => {
    expect(V2_STAT_DESCRIPTIONS.str).toContain("HP 성장 최솟값");
    expect(V2_STAT_DESCRIPTIONS.vit).toContain("HP 성장 최댓값");
    expect(V2_STAT_DESCRIPTIONS.spi).toContain("MP 성장 최솟값");
    expect(V2_STAT_DESCRIPTIONS.int).toContain("MP 성장 최댓값");
  });
});
