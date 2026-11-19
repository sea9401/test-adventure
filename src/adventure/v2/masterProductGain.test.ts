import { describe, expect, it } from "vitest";
import {
  addMasterProductGain,
  masterProductGainText,
  parseMasterProductGain,
} from "./masterProductGain";

describe("명장 산물 획득 표시", () => {
  it("생활 응답의 lifeMajor.masterProduct 를 읽는다", () => {
    expect(
      parseMasterProductGain({
        lifeMajor: {
          masteryXpGained: 10,
          masterProduct: { materialId: "v2_master_alloy", name: "명장 합금", count: 2 },
        },
      }),
    ).toEqual({ name: "명장 합금", count: 2 });
  });

  it("산물이 없거나 응답이 이상하면 null 이다", () => {
    expect(parseMasterProductGain({ lifeMajor: { masterProduct: null } })).toBeNull();
    expect(parseMasterProductGain({})).toBeNull();
    expect(parseMasterProductGain(null)).toBeNull();
    expect(
      parseMasterProductGain({ lifeMajor: { masterProduct: { name: "명장 합금", count: 0 } } }),
    ).toBeNull();
  });

  it("여러 번 얻은 산물을 합친다", () => {
    const one = { name: "명장 작물", count: 1 };
    expect(addMasterProductGain(null, null)).toBeNull();
    expect(addMasterProductGain(null, one)).toEqual(one);
    expect(addMasterProductGain(one, null)).toEqual(one);
    expect(addMasterProductGain(one, { name: "명장 작물", count: 2 })).toEqual({
      name: "명장 작물",
      count: 3,
    });
  });

  it("이름과 개수를 한 줄로 만든다", () => {
    expect(masterProductGainText({ name: "명장 목재", count: 1234 })).toBe("명장 목재 +1,234");
  });
});
