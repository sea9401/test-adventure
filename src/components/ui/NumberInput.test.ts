import { describe, expect, it } from "vitest";
import {
  normalizeIntegerInput,
  parseNumberDraft,
} from "./DraftNumberInput";
import { formatThousands, parseAmount } from "./NumberInput";

describe("normalizeIntegerInput", () => {
  it("정수로 내리고 min/max 범위 안으로 보정한다", () => {
    expect(normalizeIntegerInput(7.9, 1, 10)).toBe(7);
    expect(normalizeIntegerInput(0, 1, 10)).toBe(1);
    expect(normalizeIntegerInput(11, 1, 10)).toBe(10);
  });

  it("입력 중 빈 값은 숫자로 강제 변환하지 않는다", () => {
    expect(parseNumberDraft("")).toBeNull();
    expect(parseNumberDraft("12")).toBe(12);
  });
});

describe("formatThousands", () => {
  it("천단위 콤마", () => {
    expect(formatThousands("1000")).toBe("1,000");
    expect(formatThousands("1234567")).toBe("1,234,567");
    expect(formatThousands("999")).toBe("999");
  });
  it("숫자 외 문자 제거(이미 콤마 포함 입력도 재정규화)", () => {
    expect(formatThousands("1,000")).toBe("1,000");
    expect(formatThousands("1,00")).toBe("100");
    expect(formatThousands("1a2b3")).toBe("123");
  });
  it("선행 0 정규화 / 빈값", () => {
    expect(formatThousands("007")).toBe("7");
    expect(formatThousands("02913")).toBe("2,913");
    expect(formatThousands("")).toBe("");
    expect(formatThousands("abc")).toBe("");
  });
  it("안전 정수 초과는 자릿수 콤마만(정밀도 손실 회피)", () => {
    expect(formatThousands("1234567890123456789")).toBe(
      "1,234,567,890,123,456,789",
    );
  });
});

describe("parseAmount", () => {
  it("콤마 제거 후 정수", () => {
    expect(parseAmount("1,000")).toBe(1000);
    expect(parseAmount("1,234,567")).toBe(1234567);
    expect(parseAmount("500")).toBe(500);
  });
  it("빈값/손상/null = 0", () => {
    expect(parseAmount("")).toBe(0);
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount("abc")).toBe(0);
  });
  it("format → parse 왕복", () => {
    expect(parseAmount(formatThousands("732016"))).toBe(732016);
  });
});
