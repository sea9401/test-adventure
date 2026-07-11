import { describe, expect, it } from "vitest";
import { WORLD_ACTIVITY_REGIONS } from "./worldRumors";

describe("생활 지도 지역", () => {
  it("마을 없이 낚시터 6곳과 벌목지 6곳을 제공한다", () => {
    expect(WORLD_ACTIVITY_REGIONS).toHaveLength(12);
    expect(WORLD_ACTIVITY_REGIONS.some((region) => String(region.id) === "village")).toBe(false);
    expect(WORLD_ACTIVITY_REGIONS.filter((region) => region.kind === "fishing")).toHaveLength(6);
    expect(WORLD_ACTIVITY_REGIONS.filter((region) => region.kind === "woodcutting")).toHaveLength(6);
  });

  it("모든 벌목지는 해당 숲을 선택하는 벌목장 링크를 가진다", () => {
    for (const region of WORLD_ACTIVITY_REGIONS.filter(
      (candidate) => candidate.kind === "woodcutting",
    )) {
      expect(region.action.href).toBe(`/town/logging?spot=${region.id}`);
      expect(region.action.label).toBe("벌목하러 가기");
    }
  });
});
