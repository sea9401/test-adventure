import { describe, expect, it } from "vitest";
import { MANUAL_CONTENT } from "./content";
import { MANUAL_SECTIONS } from "./sections";

describe("게임 안내서 구성", () => {
  it("목차 슬러그는 중복되지 않고 모든 본문과 연결된다", () => {
    const slugs = MANUAL_SECTIONS.map((section) => section.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(Object.keys(MANUAL_CONTENT).sort()).toEqual([...slugs].sort());
  });

  it("현재 생활 콘텐츠와 퀘스트 안내를 목차에 포함한다", () => {
    expect(
      MANUAL_SECTIONS.find((section) => section.slug === "pastimes"),
    ).toMatchObject({
      title: "생활 콘텐츠",
      group: "world",
    });
    expect(
      MANUAL_SECTIONS.find((section) => section.slug === "quests"),
    ).toMatchObject({
      title: "퀘스트와 업적",
      group: "growth",
    });
    expect(
      MANUAL_SECTIONS.some((section) => section.slug === "outpost"),
    ).toBe(false);
  });

  it("목차에서 도감 숙련·월간 연구와 트로피 전시를 찾을 수 있다", () => {
    expect(
      MANUAL_SECTIONS.find((section) => section.slug === "compendium")?.summary,
    ).toContain("도감 숙련");
    expect(
      MANUAL_SECTIONS.find((section) => section.slug === "compendium")?.summary,
    ).toContain("월간 연구");
    expect(
      MANUAL_SECTIONS.find((section) => section.slug === "quests")?.summary,
    ).toContain("트로피");
  });

  it("전투 계산식을 독립된 전투 안내 페이지로 제공한다", () => {
    expect(
      MANUAL_SECTIONS.find((section) => section.slug === "combat-formulas"),
    ).toMatchObject({
      title: "전투 계산식",
      group: "combat",
    });
    expect(MANUAL_CONTENT["combat-formulas"]).toBeTypeOf("function");
  });
});
