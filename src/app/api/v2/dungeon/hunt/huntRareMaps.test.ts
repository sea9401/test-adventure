import { afterEach, describe, expect, it, vi } from "vitest";
import { updateRareMaps } from "./huntRareMaps";

describe("updateRareMaps 신규 지도 응답", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("새로 저장한 희귀맵 인스턴스를 바로가기용 응답에도 그대로 반환한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = updateRareMaps({
      activeRareMap: null,
      rareMaps: [],
      won: true,
      depth: 12,
      now: 1_000,
    });

    expect(result.rareMapDrop).toBe("worn_map");
    expect(result.rareMapDropInstance).toMatchObject({
      kind: "worn_map",
      depth: 12,
      runsLeft: 30,
      foundAt: 1_000,
    });
    expect(result.rareMapDropInstance?.iid).toMatch(/^rm_/);
    expect(result.rareMaps).toEqual([result.rareMapDropInstance]);
  });
});
