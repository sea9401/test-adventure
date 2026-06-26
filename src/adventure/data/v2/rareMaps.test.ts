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

  it("newRareMapInstance — 종류 정의대로 판수 세팅(만료 없음)", () => {
    const m = newRareMapInstance("worn_map", 17, NOW, "rm_test");
    expect(m).toMatchObject({
      iid: "rm_test",
      kind: "worn_map",
      depth: 17,
      runsLeft: RARE_MAP_KINDS.worn_map.runs,
      foundAt: NOW,
    });
  });

  it("parseRareMaps — 소진/형식불량만 purge, 옛 expiresAt 가 박혀도 무시하고 보존", () => {
    const ok = newRareMapInstance("worn_map", 5, NOW, "rm_ok");
    // 옛 데이터: 과거 expiresAt(폐지된 필드)가 박혀 있어도 더는 만료시키지 않는다(소모품·시간무제한).
    const oldExpiry = {
      ...newRareMapInstance("worn_map", 5, NOW, "rm_old"),
      expiresAt: NOW - 1,
    };
    const used = { ...newRareMapInstance("worn_map", 5, NOW, "rm_used"), runsLeft: 0 };
    const junk = [{ iid: 1 }, null, "x", { ...ok, kind: "unknown_kind" }];
    const parsed = parseRareMaps([ok, oldExpiry, used, ...junk], NOW);
    // ok + oldExpiry 둘 다 보존(만료 무시), used(소진)·junk 만 purge.
    expect(parsed.map((m) => m.iid).sort()).toEqual(["rm_ok", "rm_old"]);
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
