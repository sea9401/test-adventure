import { describe, expect, it } from "vitest";
import {
  FEED_CATEGORY_TYPES,
  FEED_HIDDEN_TYPES,
  FEED_TYPES,
  WAR_FEED_TYPES,
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
});
