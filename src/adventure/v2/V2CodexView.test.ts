import { describe, expect, it } from "vitest";
import {
  classifyCodexEquipmentIds,
  codexTabFromParam,
  codexThemeDeepDepth,
  shouldShowCodexTutorial,
  spFruitCodexSource,
} from "./V2CodexView";
import {
  commonIdsForDepthRange,
  SKY_RIFT_WEAPON_IDS,
} from "@/adventure/data/v2/dungeonUniqueDrops";

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

  it("요리 도감 링크를 요리 탭으로 연다", () => {
    expect(codexTabFromParam("cooking")).toBe("cooking");
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
    expect(codexThemeDeepDepth(73)).toBe(78);
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

  it("상위 사냥터의 태그 세트 장비도 세트로 분류한다", () => {
    expect(
      classifyCodexEquipmentIds([
        "v2_throne_greatsword",
        "v2_throne_black_armor",
      ]),
    ).toEqual({
      common: [],
      set: ["v2_throne_greatsword", "v2_throne_black_armor"],
    });
  });

  it("마지막 지역의 정규 드랍은 모두 세트 장비로 표시한다", () => {
    const ids = [
      ...commonIdsForDepthRange(73, 78),
      ...SKY_RIFT_WEAPON_IDS,
    ];

    const classified = classifyCodexEquipmentIds(ids);

    expect(classified.common).toEqual([]);
    expect(classified.set).toEqual(ids);
  });
});

describe("모험의 서 SP 열매 획득처", () => {
  it("SP 열매 IV에 협동 보스와 폭풍 원정 완주를 함께 표시한다", () => {
    expect(spFruitCodexSource(4)).toBe(
      "공허의 대사제 보상 · 폭풍 원정 완주 보상",
    );
  });

  it("나머지 SP 열매는 기존 협동 보스 획득처만 표시한다", () => {
    expect(spFruitCodexSource(1)).toBe("산군 보상");
  });
});
