import { describe, expect, it } from "vitest";
import { cookingIngredientOptions } from "./adminCatalogOptions";

describe("관리자 요리 재료 선택지", () => {
  it("SVG 전용 재료는 장식 문자 없이 이름을 표시한다", () => {
    const options = cookingIngredientOptions();

    expect(options.find((option) => option.id === "pantry:salt")?.label).toBe(
      "상점 · 소금",
    );
    expect(
      options.find((option) => option.id === "processed:cheese")?.label,
    ).toBe("가공 · 치즈");
  });
});
