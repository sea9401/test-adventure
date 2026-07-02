import { describe, expect, it } from "vitest";
import {
  RARE_MAP_KINDS,
  RARE_MAP_KIND_IDS,
  newRareMapInstance,
  parseRareMaps,
  rollRareMapDrop,
} from "./rareMaps";

const NOW = 1_750_000_000_000;

describe("rareMaps", () => {
  it("카탈로그 — 종류별 양수 판수/드랍률", () => {
    for (const id of RARE_MAP_KIND_IDS) {
      const k = RARE_MAP_KINDS[id];
      expect(k.runs).toBeGreaterThan(0);
      // exp_tome 은 테스트 전용 — 사냥 드랍 안 됨(dropPct 0, 관리자 지급 전용)이라 제외.
      if (id === "exp_tome") continue;
      expect(k.dropPct).toBeGreaterThan(0);
      expect(k.dropPct).toBeLessThan(5); // "매우 낮음" 방침 가드
    }
  });

  it("newRareMapInstance — 종류 정의대로 판수 세팅", () => {
    const m = newRareMapInstance("worn_map", 17, NOW, "rm_test");
    expect(m).toMatchObject({
      iid: "rm_test",
      kind: "worn_map",
      depth: 17,
      runsLeft: RARE_MAP_KINDS.worn_map.runs,
      foundAt: NOW,
    });
  });

  it("parseRareMaps — 소진/형식불량만 purge, 옛 expiresAt 값은 무시한다", () => {
    const ok = newRareMapInstance("worn_map", 5, NOW, "rm_ok");
    // 옛 데이터: 과거 expiresAt 값 자체는 무시하고 foundAt 기준 TTL만 적용한다.
    const oldExpiry = {
      ...newRareMapInstance("worn_map", 5, NOW, "rm_old"),
      expiresAt: NOW - 1,
    };
    const used = { ...newRareMapInstance("worn_map", 5, NOW, "rm_used"), runsLeft: 0 };
    const junk = [{ iid: 1 }, null, "x", { ...ok, kind: "unknown_kind" }];
    const parsed = parseRareMaps([ok, oldExpiry, used, ...junk], NOW);
    // ok + oldExpiry 둘 다 보존(expiresAt 무시), used(소진)·junk 만 purge.
    expect(parsed.map((m) => m.iid).sort()).toEqual(["rm_ok", "rm_old"]);
  });

  it("parseRareMaps — 레어맵과 비밀 상점 지도는 발견 후 30분이 지나면 제거된다", () => {
    const freshShop = newRareMapInstance(
      "secret_shop_map",
      5,
      NOW - 29 * 60 * 1000,
      "rm_fresh_shop",
    );
    const expiredShop = newRareMapInstance(
      "secret_shop_map",
      5,
      NOW - 30 * 60 * 1000,
      "rm_expired_shop",
    );
    const freshHuntMap = newRareMapInstance(
      "worn_map",
      5,
      NOW - 29 * 60 * 1000,
      "rm_fresh_hunt",
    );
    const expiredHuntMap = newRareMapInstance(
      "worn_map",
      5,
      NOW - 30 * 60 * 1000,
      "rm_expired_hunt",
    );

    expect(
      parseRareMaps([freshShop, expiredShop, freshHuntMap, expiredHuntMap], NOW).map(
        (m) => m.iid,
      ),
    ).toEqual(["rm_fresh_shop", "rm_fresh_hunt"]);
  });

  it("parseRareMaps — 배열 아님/빈 값은 []", () => {
    expect(parseRareMaps(undefined, NOW)).toEqual([]);
    expect(parseRareMaps({}, NOW)).toEqual([]);
    expect(parseRareMaps([], NOW)).toEqual([]);
  });

  it("rollRareMapDrop — rand 0 이면 첫 종류 당첨, rand 1 이면 null", () => {
    expect(rollRareMapDrop(() => 0)).toBe(RARE_MAP_KIND_IDS[0]);
    expect(rollRareMapDrop(() => 0.9999)).toBeNull();
  });
});
