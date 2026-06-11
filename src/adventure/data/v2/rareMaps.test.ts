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
  it("카탈로그 — 종류별 양수 판수/만료/드랍률", () => {
    for (const id of RARE_MAP_KIND_IDS) {
      const k = RARE_MAP_KINDS[id];
      expect(k.runs).toBeGreaterThan(0);
      expect(k.ttlMs).toBeGreaterThan(0);
      expect(k.dropPct).toBeGreaterThan(0);
      expect(k.dropPct).toBeLessThan(5); // "매우 낮음" 방침 가드
    }
  });

  it("newRareMapInstance — 종류 정의대로 판수/만료 세팅", () => {
    const m = newRareMapInstance("worn_map", 17, NOW, "rm_test");
    expect(m).toMatchObject({
      iid: "rm_test",
      kind: "worn_map",
      depth: 17,
      runsLeft: RARE_MAP_KINDS.worn_map.runs,
      foundAt: NOW,
      expiresAt: NOW + RARE_MAP_KINDS.worn_map.ttlMs,
    });
  });

  it("parseRareMaps — 만료/소진/형식불량 purge, 정상 항목 보존", () => {
    const ok = newRareMapInstance("worn_map", 5, NOW, "rm_ok");
    const expired = { ...newRareMapInstance("worn_map", 5, NOW, "rm_exp"), expiresAt: NOW - 1 };
    const used = { ...newRareMapInstance("worn_map", 5, NOW, "rm_used"), runsLeft: 0 };
    const junk = [{ iid: 1 }, null, "x", { ...ok, kind: "unknown_kind" }];
    const parsed = parseRareMaps([ok, expired, used, ...junk], NOW);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].iid).toBe("rm_ok");
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
