import { describe, expect, it } from "vitest";
import {
  favoritesFirst,
  parseFavoriteIds,
  readStoredFavoriteIds,
  toggleFavoriteId,
} from "./favoriteIds";

function memoryStorage(entries: Record<string, string>) {
  return { getItem: (key: string) => entries[key] ?? null };
}

describe("즐겨찾기 저장값", () => {
  it("문자열 배열만 읽고 중복과 빈 값을 버린다", () => {
    expect(parseFavoriteIds('["a","b","a","",3]')).toEqual(["a", "b"]);
    expect(parseFavoriteIds("not json")).toEqual([]);
    expect(parseFavoriteIds('{"a":1}')).toEqual([]);
    expect(parseFavoriteIds(null)).toEqual([]);
  });

  it("없는 값은 뒤에 추가하고 있는 값은 뺀다", () => {
    expect(toggleFavoriteId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFavoriteId(["a", "b"], "a")).toEqual(["b"]);
  });

  it("즐겨찾기를 앞으로 모으고 나머지는 원래 순서를 지킨다", () => {
    const items = ["wheat", "milk", "egg", "salt"];
    expect(favoritesFirst(items, new Set(["salt", "milk"]), (id) => id)).toEqual([
      "milk",
      "salt",
      "wheat",
      "egg",
    ]);
    expect(favoritesFirst(items, new Set(), (id) => id)).toBe(items);
  });

  it("새 목록이 없으면 예전 단일 목표를 목록으로 옮겨 읽는다", () => {
    expect(
      readStoredFavoriteIds(
        memoryStorage({ legacy: "warrior" }),
        "list",
        "legacy",
      ),
    ).toEqual(["warrior"]);
    expect(
      readStoredFavoriteIds(
        memoryStorage({ list: '["mage","archer"]', legacy: "warrior" }),
        "list",
        "legacy",
      ),
    ).toEqual(["mage", "archer"]);
    expect(
      readStoredFavoriteIds(memoryStorage({ list: "[]", legacy: "warrior" }), "list", "legacy"),
    ).toEqual([]);
  });
});
