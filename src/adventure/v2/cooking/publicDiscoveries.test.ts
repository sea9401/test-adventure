import { describe, expect, it } from "vitest";
import { publicCookingDiscoveries } from "./publicDiscoveries";

const recipes = [
  { id: "r1", name: "나물", imageSrc: "/r1.webp" },
  { id: "r2", name: "국", imageSrc: "/r2.webp" },
  { id: "r3", name: "빵", imageSrc: "/r3.webp" },
];

const discoveries = [
  { recipeId: "r1", actorName: "하린", discoveredAt: 200 },
  { recipeId: "r2", actorName: "가람", discoveredAt: 300 },
  { recipeId: "r3", actorName: "하린", discoveredAt: 100 },
  { recipeId: "missing", actorName: "누락", discoveredAt: 400 },
];

describe("공개 요리 발견 목록", () => {
  it("최초 발견 기록을 공개 카드 정보로 좁히고 카탈로그 불일치를 제외한다", () => {
    expect(publicCookingDiscoveries(recipes, discoveries, "recent")).toEqual([
      {
        recipeId: "r2",
        recipeName: "국",
        imageSrc: "/r2.webp",
        actorName: "가람",
        discoveredAt: 300,
      },
      {
        recipeId: "r1",
        recipeName: "나물",
        imageSrc: "/r1.webp",
        actorName: "하린",
        discoveredAt: 200,
      },
      {
        recipeId: "r3",
        recipeName: "빵",
        imageSrc: "/r3.webp",
        actorName: "하린",
        discoveredAt: 100,
      },
    ]);
  });

  it.each([
    ["recent", ["r2", "r1", "r3"]],
    ["oldest", ["r3", "r1", "r2"]],
    ["recipe_name", ["r2", "r1", "r3"]],
    ["actor_name", ["r2", "r1", "r3"]],
    ["invalid", ["r2", "r1", "r3"]],
  ])("%s 정렬을 안정적으로 적용한다", (sort, expected) => {
    expect(
      publicCookingDiscoveries(recipes, discoveries, sort).map(
        (entry) => entry.recipeId,
      ),
    ).toEqual(expected);
  });
});
