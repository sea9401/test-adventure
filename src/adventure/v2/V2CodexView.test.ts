import { describe, expect, it } from "vitest";
import {
  classifyCodexEquipmentIds,
  codexTabFromParam,
  codexThemeDeepDepth,
  shouldShowCodexTutorial,
} from "./V2CodexView";

describe("모험의 서 이용 안내", () => {
  it("처음 방문한 이용자에게 표시하고 확인 후에는 자동으로 숨긴다", () => {
    expect(shouldShowCodexTutorial(false, false)).toBe(true);
    expect(shouldShowCodexTutorial(true, false)).toBe(false);
  });

  it("이미 확인했어도 안내 버튼으로 다시 볼 수 있다", () => {
    expect(shouldShowCodexTutorial(true, true)).toBe(true);
  });
});

describe("모험의 서 URL 탭", () => {
  it("제작 완료 화면의 장비 도감 링크를 장비 탭으로 연다", () => {
    expect(codexTabFromParam("equipment")).toBe("equipment");
  });

  it("탭이 없거나 잘못됐으면 기존 기본 탭을 사용한다", () => {
    expect(codexTabFromParam(null)).toBe("spFruit");
    expect(codexTabFromParam("unknown")).toBe("spFruit");
  });
});

describe("모험의 서 사냥터 표시", () => {
  it("각 사냥터는 세 단계 중 심부를 대표 깊이로 사용한다", () => {
    expect(codexThemeDeepDepth(1)).toBe(6);
    expect(codexThemeDeepDepth(7)).toBe(12);
    expect(codexThemeDeepDepth(67)).toBe(72);
  });

  it("정규 드랍을 일반 장비와 세트 장비로 분리한다", () => {
    expect(
      classifyCodexEquipmentIds([
        "v2_canyon_greatsword",
        "v2_canyon_set_armor",
      ]),
    ).toEqual({
      common: ["v2_canyon_greatsword"],
      set: ["v2_canyon_set_armor"],
    });
  });
});
