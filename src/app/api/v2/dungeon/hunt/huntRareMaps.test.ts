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

  it("희귀 탐사 패배 시 지도와 남은 보상 횟수를 보존한다", () => {
    // Break caught: one failed compressed battle deletes or devalues the map.
    const map = {
      iid: "rm-loss",
      kind: "worn_map" as const,
      depth: 84,
      runsLeft: 17,
      foundAt: 1_000,
    };

    const result = updateRareMaps({
      activeRareMap: map,
      rareMaps: [map],
      won: false,
      depth: 84,
      now: 2_000,
    });

    expect(result.rareMaps).toEqual([map]);
    expect(result.rareMapRunsLeft).toBe(17);
  });

  it("희귀 탐사 승리 시 남은 횟수와 관계없이 지도를 완전히 소모한다", () => {
    // Break caught: compressed victory leaves a partially consumed map behind.
    const map = {
      iid: "rm-win",
      kind: "relic_map" as const,
      depth: 84,
      runsLeft: 6,
      foundAt: 1_000,
    };

    const result = updateRareMaps({
      activeRareMap: map,
      rareMaps: [map],
      won: true,
      depth: 84,
      now: 2_000,
    });

    expect(result.rareMaps).toEqual([]);
    expect(result.rareMapRunsLeft).toBe(0);
  });
});
