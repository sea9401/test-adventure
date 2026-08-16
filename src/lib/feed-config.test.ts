import { describe, expect, it } from "vitest";
import {
  FEED_CATEGORY_TYPES,
  FEED_HIDDEN_TYPES,
  FEED_RETENTION_MS,
  FEED_TYPES,
  WAR_FEED_TYPES,
  parseFeedBeforeId,
} from "@/lib/feed-config";

describe("feed visibility config", () => {
  it("레어맵 발견은 전체 소식 노출 묶음에서 제외한다", () => {
    expect(FEED_TYPES).toContain("rare_map_drop");
    expect(FEED_HIDDEN_TYPES).toContain("rare_map_drop");
    expect(WAR_FEED_TYPES).not.toContain("rare_map_drop");
    for (const types of Object.values(FEED_CATEGORY_TYPES)) {
      expect(types).not.toContain("rare_map_drop");
    }
  });

  it("전체 소식을 30일 보관한다", () => {
    expect(FEED_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1_000);
  });

  it("수행 각성은 전체 소식과 전광판에 노출한다", () => {
    expect(FEED_TYPES).toContain("cultivation_awakening");
    expect(WAR_FEED_TYPES).toContain("cultivation_awakening");
    expect(FEED_HIDDEN_TYPES).not.toContain("cultivation_awakening");
  });

  it("유니크 획득은 획득 분류에서 보이되 전광판에는 올리지 않는다", () => {
    expect(FEED_CATEGORY_TYPES.acquisition).toContain("unique_drop");
    expect(WAR_FEED_TYPES).not.toContain("unique_drop");
  });

  it("수행 각성은 전체 소식과 전광판에 노출한다", () => {
    expect(FEED_TYPES).toContain("cultivation_awakening");
    expect(WAR_FEED_TYPES).toContain("cultivation_awakening");
    expect(FEED_HIDDEN_TYPES).not.toContain("cultivation_awakening");
  });

  it("과거 페이지 cursor는 양의 안전 정수만 허용한다", () => {
    expect(parseFeedBeforeId("42")).toBe(42);
    expect(parseFeedBeforeId("0")).toBeNull();
    expect(parseFeedBeforeId("-1")).toBeNull();
    expect(parseFeedBeforeId("1.5")).toBeNull();
    expect(parseFeedBeforeId("2147483648")).toBeNull();
    expect(parseFeedBeforeId("9007199254740992")).toBeNull();
  });
});
