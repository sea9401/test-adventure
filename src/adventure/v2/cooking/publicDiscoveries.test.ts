import { describe, expect, it } from "vitest";
import { publicCookingDiscoveries } from "./publicDiscoveries";

const discoveries = [
  { recipeName: "나물", imageSrc: "/r1.webp", actorName: "하린", discoveredAt: 200, codexRegistered: true },
  { recipeName: "국", imageSrc: "/r2.webp", actorName: "가람", discoveredAt: 300, codexRegistered: false },
  { recipeName: "빵", imageSrc: "/r3.webp", actorName: "하린", discoveredAt: 100, codexRegistered: false },
];

describe("공개 요리 발견 목록", () => {
  it("서버에서 정제한 공개 카드 정보를 최근 발견순으로 정렬한다", () => {
    expect(publicCookingDiscoveries(discoveries, "recent")).toEqual([
      {
        recipeName: "국",
        imageSrc: "/r2.webp",
        actorName: "가람",
        discoveredAt: 300,
        codexRegistered: false,
      },
      {
        recipeName: "나물",
        imageSrc: "/r1.webp",
        actorName: "하린",
        discoveredAt: 200,
        codexRegistered: true,
      },
      {
        recipeName: "빵",
        imageSrc: "/r3.webp",
        actorName: "하린",
        discoveredAt: 100,
        codexRegistered: false,
      },
    ]);
  });

  it.each([
    ["recent", ["국", "나물", "빵"]],
    ["oldest", ["빵", "나물", "국"]],
    ["recipe_name", ["국", "나물", "빵"]],
    ["actor_name", ["국", "나물", "빵"]],
    ["invalid", ["국", "나물", "빵"]],
  ])("%s 정렬을 안정적으로 적용한다", (sort, expected) => {
    expect(
      publicCookingDiscoveries(discoveries, sort).map(
        (entry) => entry.recipeName,
      ),
    ).toEqual(expected);
  });

  it("도감 미등록을 고르면 등록된 요리를 빼고 최근 발견순으로 보여준다", () => {
    expect(
      publicCookingDiscoveries(discoveries, "unregistered").map(
        (entry) => entry.recipeName,
      ),
    ).toEqual(["국", "빵"]);
  });
});
