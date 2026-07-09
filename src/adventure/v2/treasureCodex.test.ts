import { describe, it, expect } from "vitest";
import { ANTIQUES, ANTIQUE_IDS } from "@/adventure/data/v2/antique";
import {
  antiqueTierCompletions,
  countDiscoveredAntiques,
  discoveredAntiqueIds,
  emptyTreasureCodex,
  parseTreasureCodex,
  recordFind,
  treasureCodexSpBonus,
} from "./treasureCodex";

describe("parseTreasureCodex", () => {
  it("손상 입력 → 빈 도감", () => {
    expect(parseTreasureCodex(null)).toEqual(emptyTreasureCodex());
    expect(parseTreasureCodex("x")).toEqual(emptyTreasureCodex());
    expect(parseTreasureCodex(42)).toEqual(emptyTreasureCodex());
  });

  it("nested {antiques} 형태와 flat {id:entry} 형태 모두 수용", () => {
    const entry = {
      discovered: true,
      bestCondition: 80,
      totalFound: 3,
      firstFoundAt: 1,
      bestFoundAt: 2,
    };
    const nested = parseTreasureCodex({ antiques: { gold_coin: entry } });
    const flat = parseTreasureCodex({ gold_coin: entry });
    expect(nested.antiques.gold_coin).toEqual(entry);
    expect(flat.antiques.gold_coin).toEqual(entry);
  });

  it("알 수 없는 id 항목은 버린다", () => {
    const c = parseTreasureCodex({
      antiques: {
        gold_coin: { discovered: true, bestCondition: 50, totalFound: 1 },
        not_a_thing: { discovered: true, bestCondition: 99, totalFound: 1 },
      },
    });
    expect(Object.keys(c.antiques)).toEqual(["gold_coin"]);
  });

  it("discovered 누락이어도 기록(>0)이 있으면 발견으로 복원", () => {
    const c = parseTreasureCodex({ antiques: { silver_coin: { bestCondition: 40 } } });
    expect(c.antiques.silver_coin?.discovered).toBe(true);
  });

  it("오염된 bestCondition(999/-1/3.14)은 0 으로, totalFound 로만 복원", () => {
    const c = parseTreasureCodex({
      antiques: {
        gold_coin: { bestCondition: 999, totalFound: 2 },
        silver_coin: { bestCondition: 3.14, totalFound: 1 },
        // 오염 best 뿐이고 totalFound 도 없으면 발견 신호 자체가 없어 drop.
        copper_coin: { bestCondition: -1 },
      },
    });
    expect(c.antiques.gold_coin.bestCondition).toBe(0);
    expect(c.antiques.gold_coin.discovered).toBe(true);
    expect(c.antiques.silver_coin.bestCondition).toBe(0);
    expect(c.antiques.copper_coin).toBeUndefined();
  });
});

describe("recordFind", () => {
  it("신규 종류 등재", () => {
    const c = recordFind(emptyTreasureCodex(), "clay_shard", 30, 100);
    expect(c.antiques.clay_shard).toEqual({
      discovered: true,
      bestCondition: 30,
      totalFound: 1,
      firstFoundAt: 100,
      bestFoundAt: 100,
    });
  });

  it("더 높은 보존상태만 best 갱신 + totalFound 누적", () => {
    let c = recordFind(emptyTreasureCodex(), "clay_shard", 30, 100);
    c = recordFind(c, "clay_shard", 20, 200); // 더 낮음 → best 유지
    expect(c.antiques.clay_shard.bestCondition).toBe(30);
    expect(c.antiques.clay_shard.bestFoundAt).toBe(100);
    expect(c.antiques.clay_shard.totalFound).toBe(2);
    c = recordFind(c, "clay_shard", 88, 300); // 더 높음 → 갱신
    expect(c.antiques.clay_shard.bestCondition).toBe(88);
    expect(c.antiques.clay_shard.bestFoundAt).toBe(300);
    expect(c.antiques.clay_shard.totalFound).toBe(3);
    expect(c.antiques.clay_shard.firstFoundAt).toBe(100);
  });
});

describe("discovered 헬퍼", () => {
  it("발견 종류만 카탈로그 순서로", () => {
    let c = emptyTreasureCodex();
    c = recordFind(c, "gold_coin", 50, 1);
    c = recordFind(c, "clay_shard", 50, 1);
    // 카탈로그 순서(clay_shard 가 gold_coin 보다 앞)대로.
    expect(discoveredAntiqueIds(c)).toEqual(["clay_shard", "gold_coin"]);
    expect(countDiscoveredAntiques(c)).toBe(2);
  });
});

describe("유물 도감 — SP 보상 없음", () => {
  it("등급별 전종 발견 시에도 SP 를 지급하지 않는다", () => {
    const commonIds = ANTIQUE_IDS.filter(
      (id) => ANTIQUES[id].tier === "common",
    );
    let codex = emptyTreasureCodex();
    for (const [i, id] of commonIds.entries()) {
      codex = recordFind(codex, id, 30 + i, 1000 + i);
    }
    expect(treasureCodexSpBonus(codex)).toBe(0);
    expect(
      antiqueTierCompletions(codex).find((tier) => tier.tier === "common"),
    ).toMatchObject({
      discovered: commonIds.length,
      total: commonIds.length,
      complete: true,
      sp: 0,
    });

    const firstCommon = commonIds[0];
    expect(firstCommon).toBeDefined();
    const partial = recordFind(emptyTreasureCodex(), firstCommon!, 30, 1);
    expect(treasureCodexSpBonus(partial)).toBe(0);
  });
});
