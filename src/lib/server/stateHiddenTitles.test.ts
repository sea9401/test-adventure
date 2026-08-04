import { describe, expect, it } from "vitest";
import { stateHiddenTitleIds } from "@/lib/server/stateHiddenTitles";

describe("stateHiddenTitleIds", () => {
  it("보유 골드가 정확히 0이면 거지 칭호 대상이다", () => {
    expect(stateHiddenTitleIds({ gold: 0 })).toEqual(["beggar"]);
  });

  it.each([undefined, null, -1, 1, Number.NaN, "0"])(
    "손상되거나 0이 아닌 값(%s)은 대상이 아니다",
    (gold) => {
      expect(stateHiddenTitleIds({ gold })).toEqual([]);
    },
  );
});
