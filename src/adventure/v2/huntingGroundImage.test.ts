import { describe, expect, it } from "vitest";
import { huntingGroundImageForDepth } from "./gameSceneBackgroundForPath";

describe("huntingGroundImageForDepth", () => {
  it("여섯 단계마다 같은 지역 그림을 쓴다", () => {
    expect(huntingGroundImageForDepth(1)).toBe("/images/ui/plains.webp");
    expect(huntingGroundImageForDepth(6)).toBe("/images/ui/plains.webp");
    expect(huntingGroundImageForDepth(7)).toBe("/images/ui/canyon.webp");
    expect(huntingGroundImageForDepth(84)).toBe("/images/ui/star_grave.webp");
  });

  it("지역 그림이 정해지지 않은 단계는 기본 사냥터 그림을 쓴다", () => {
    expect(huntingGroundImageForDepth(85)).toBe("/images/ui/hunt.webp");
    expect(huntingGroundImageForDepth(0)).toBe("/images/ui/hunt.webp");
  });
});
