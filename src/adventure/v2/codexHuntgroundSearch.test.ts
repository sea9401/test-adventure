import { describe, expect, it } from "vitest";
import { dungeonThemeCatalog, MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import {
  codexHuntgroundDrops,
  codexHuntgroundSearch,
} from "./codexHuntgroundSearch";

const themes = dungeonThemeCatalog(MAX_FRONTIER_DEPTH);

describe("모험의 서 사냥터 획득처 검색", () => {
  it("검색어가 없으면 모든 사냥터를 그대로 보여 준다", () => {
    const drops = codexHuntgroundDrops(themes[0]);
    expect(codexHuntgroundSearch(drops, "  ")).toBeNull();
  });

  it("장비 이름으로 그 장비를 떨어뜨리는 사냥터만 찾는다", () => {
    const theme = themes.find(
      (candidate) => codexHuntgroundDrops(candidate).uniqueIds.length > 0,
    )!;
    const uniqueId = codexHuntgroundDrops(theme).uniqueIds[0];
    const name = V2_EQUIPMENT[uniqueId].name;

    const matched = themes.filter((candidate) => {
      const result = codexHuntgroundSearch(codexHuntgroundDrops(candidate), name);
      return result !== null && result.matchCount > 0;
    });

    expect(matched.map((candidate) => candidate.name)).toContain(theme.name);
    for (const candidate of matched) {
      const result = codexHuntgroundSearch(codexHuntgroundDrops(candidate), name)!;
      expect(result.equipmentIds.has(uniqueId)).toBe(true);
    }
    expect(matched.length).toBeLessThan(themes.length);
  });

  it("재료 이름으로 지역 재료 드랍을 찾는다", () => {
    const theme = themes.find(
      (candidate) => codexHuntgroundDrops(candidate).materialDrops.length > 0,
    )!;
    const material = codexHuntgroundDrops(theme).materialDrops[0];

    const result = codexHuntgroundSearch(
      codexHuntgroundDrops(theme),
      material.name,
    )!;

    expect(result.materialIds.has(material.id)).toBe(true);
    expect(result.matchCount).toBeGreaterThan(0);
  });

  it("일치하는 아이템이 없으면 결과 수가 0이다", () => {
    const result = codexHuntgroundSearch(
      codexHuntgroundDrops(themes[0]),
      "존재하지않는아이템이름",
    )!;
    expect(result.matchCount).toBe(0);
  });
});
