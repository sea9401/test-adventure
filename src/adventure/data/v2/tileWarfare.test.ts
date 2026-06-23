import { describe, expect, it } from "vitest";
import { OUTPOSTS, OUTPOST_BY_ID } from "./outposts";
import {
  isKnownOutpostId,
  isTileOutpostId,
  parseTileOutpostId,
  resolveOutpostMeta,
  synthTileOutpost,
  tileOutpostId,
  tileTierToOutpostTier,
} from "./tileWarfare";

describe("tile id 헬퍼", () => {
  it("tileOutpostId ↔ parseTileOutpostId 라운드트립", () => {
    expect(tileOutpostId(3, 5)).toBe("tile:3,5");
    expect(parseTileOutpostId("tile:3,5")).toEqual({ col: 3, row: 5 });
    expect(parseTileOutpostId(tileOutpostId(0, 8))).toEqual({ col: 0, row: 8 });
  });

  it("isTileOutpostId — tile id true, 카탈로그 id false", () => {
    expect(isTileOutpostId("tile:1,1")).toBe(true);
    expect(isTileOutpostId("neutral_haven_central")).toBe(false);
    expect(isTileOutpostId("war_central_fort")).toBe(false);
  });

  it("parseTileOutpostId — 카탈로그/손상 id 는 null", () => {
    expect(parseTileOutpostId("neutral_haven_central")).toBeNull();
    expect(parseTileOutpostId("tile:")).toBeNull();
    expect(parseTileOutpostId("tile:3")).toBeNull();
    expect(parseTileOutpostId("tile:a,b")).toBeNull();
  });
});

describe("tileTierToOutpostTier — 단조 매핑", () => {
  it("frontier→1, village→2, city→3, metropolis→4", () => {
    expect(tileTierToOutpostTier("frontier")).toBe(1);
    expect(tileTierToOutpostTier("village")).toBe(2);
    expect(tileTierToOutpostTier("city")).toBe(3);
    expect(tileTierToOutpostTier("metropolis")).toBe(4);
  });
});

describe("synthTileOutpost", () => {
  it("정착지 → village형 합성 Outpost", () => {
    const o = synthTileOutpost(3, 5, "city");
    expect(o.id).toBe("tile:3,5");
    expect(o.type).toBe("village");
    expect(o.tier).toBe(3);
    expect(o.neutral).toBe(false);
    expect(typeof o.name).toBe("string");
    // position 은 맵 경계 안.
    expect(o.position.x).toBeGreaterThanOrEqual(0);
    expect(o.position.x).toBeLessThanOrEqual(10000);
    expect(o.position.y).toBeGreaterThanOrEqual(0);
    expect(o.position.y).toBeLessThanOrEqual(6000);
  });

  it("name override 우선, 없으면 결정적 기본 이름", () => {
    expect(synthTileOutpost(3, 5, "village", "내정착지").name).toBe("내정착지");
    expect(synthTileOutpost(3, 5, "village").name).toBe(
      synthTileOutpost(3, 5, "metropolis").name, // 이름은 좌표 결정적(티어 무관)
    );
  });
});

describe("resolveOutpostMeta", () => {
  it("카탈로그 id = OUTPOST_BY_ID.get 와 동일 참조(byte-identical)", () => {
    for (const o of OUTPOSTS) {
      expect(resolveOutpostMeta(o.id)).toBe(OUTPOST_BY_ID.get(o.id));
      // 기존 OUTPOSTS.find 패턴과도 동치.
      expect(resolveOutpostMeta(o.id)).toBe(
        OUTPOSTS.find((x) => x.id === o.id),
      );
    }
  });

  it("미존재 카탈로그 id → undefined (.find/.get 시맨틱 보존)", () => {
    expect(resolveOutpostMeta("does_not_exist")).toBeUndefined();
  });

  it("tile id + tile 인자 → 합성, 인자 없으면 undefined", () => {
    expect(resolveOutpostMeta("tile:2,2")).toBeUndefined();
    const o = resolveOutpostMeta("tile:2,2", { tier: "village" });
    expect(o?.id).toBe("tile:2,2");
    expect(o?.tier).toBe(2);
  });
});

describe("isKnownOutpostId", () => {
  it("카탈로그 거점·tile id true, 미존재 false", () => {
    expect(isKnownOutpostId("neutral_haven_central")).toBe(true);
    expect(isKnownOutpostId("tile:9,9")).toBe(true);
    expect(isKnownOutpostId("nope")).toBe(false);
  });

  it("모든 카탈로그 id 에 대해 OUTPOST_BY_ID.has 와 일치", () => {
    for (const o of OUTPOSTS) {
      expect(isKnownOutpostId(o.id)).toBe(OUTPOST_BY_ID.has(o.id));
    }
  });
});
