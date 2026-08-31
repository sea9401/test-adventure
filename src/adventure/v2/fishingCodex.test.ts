import { describe, it, expect } from "vitest";
import { FISH, FISH_IDS } from "@/adventure/data/v2/fish";
import {
  FISHING_CODEX_SP_MILESTONES,
  countDiscoveredFish,
  caughtFishIds,
  discoveredFishIds,
  emptyFishCodex,
  extractFishRegistration,
  fishBestSizeScoreBonus,
  fishCodexSpBonus,
  fishCodexSpBonusForCount,
  fishCodexScore,
  fishCodexTotalCaught,
  fishTierCompletions,
  nextFishCodexMilestone,
  parseFishCodex,
  recordCatch,
  registerFishSpecimen,
  registeredFishIds,
} from "./fishingCodex";

describe("낚시 도감 — recordCatch", () => {
  it("신규 어종을 등록", () => {
    const codex = recordCatch(emptyFishCodex(), "crucian_carp", 22.5, 1000);
    const e = codex.fish.crucian_carp;
    expect(e.registered).toBe(true);
    expect(e.caughtEver).toBe(true);
    expect(e.bestSize).toBe(22.5);
    expect(e.totalCaught).toBe(1);
    expect(e.firstCaughtAt).toBe(1000);
    expect(e.bestCaughtAt).toBe(1000);
  });

  it("더 큰 사이즈면 최대어·시각 갱신, 마리 수 증가", () => {
    let codex = recordCatch(emptyFishCodex(), "carp", 40, 1000);
    codex = recordCatch(codex, "carp", 80, 2000);
    const e = codex.fish.carp;
    expect(e.bestSize).toBe(80);
    expect(e.bestCaughtAt).toBe(2000);
    expect(e.totalCaught).toBe(2);
    expect(e.firstCaughtAt).toBe(1000);
  });

  it("더 작은 사이즈면 최대어 유지, 마리 수만 증가", () => {
    let codex = recordCatch(emptyFishCodex(), "carp", 80, 1000);
    codex = recordCatch(codex, "carp", 30, 2000);
    const e = codex.fish.carp;
    expect(e.bestSize).toBe(80);
    expect(e.bestCaughtAt).toBe(1000);
    expect(e.totalCaught).toBe(2);
  });

  it("순수 함수 — 입력 코덱스를 변형하지 않음", () => {
    const base = emptyFishCodex();
    recordCatch(base, "trout", 50, 1000);
    expect(base.fish.trout).toBeUndefined();
  });
});

describe("낚시 도감 — parse / count", () => {
  it("손상된 입력은 빈 도감", () => {
    expect(parseFishCodex(null).fish).toEqual({});
    expect(parseFishCodex(42).fish).toEqual({});
    expect(parseFishCodex("nope").fish).toEqual({});
  });

  it("알 수 없는 어종 id 는 버린다", () => {
    const parsed = parseFishCodex({
      fish: {
        carp: { discovered: true, bestSize: 50, totalCaught: 1 },
        not_a_fish: { discovered: true, bestSize: 999, totalCaught: 1 },
      },
    });
    expect(parsed.fish.carp).toBeDefined();
    expect(parsed.fish.not_a_fish).toBeUndefined();
  });

  it("평면 형태({id: entry})도 수용", () => {
    const parsed = parseFishCodex({
      trout: { discovered: true, bestSize: 60, totalCaught: 3 },
    });
    expect(parsed.fish.trout?.bestSize).toBe(60);
  });

  it("discovered 누락 옛 데이터도 기록(>0)이면 발견 처리", () => {
    const parsed = parseFishCodex({ fish: { pike: { bestSize: 120, totalCaught: 2 } } });
    expect(parsed.fish.pike).toMatchObject({ registered: true, caughtEver: true });
  });

  it("레거시 발견 엔트리를 등록권과 포획 기록으로 이관한다", () => {
    const parsed = parseFishCodex({
      fish: {
        carp: {
          discovered: true,
          bestSize: 42,
          totalCaught: 7,
          firstCaughtAt: 10,
          bestCaughtAt: 20,
        },
      },
    });

    expect(parsed.fish.carp).toMatchObject({
      registered: true,
      caughtEver: true,
      bestSize: 42,
      totalCaught: 7,
    });
  });

  it("등록권을 추출해도 개인 포획 기록은 보존한다", () => {
    let codex = emptyFishCodex();
    for (const [index, id] of FISH_IDS.slice(0, 5).entries()) {
      codex = recordCatch(codex, id, 10 + index, 100 + index);
    }

    const fishId = FISH_IDS[0];
    const before = codex.fish[fishId];
    const result = extractFishRegistration(codex, fishId);

    expect(result.extracted).toBe(true);
    expect(result.codex.fish[fishId]).toMatchObject({
      registered: false,
      caughtEver: true,
      bestSize: before.bestSize,
      totalCaught: before.totalCaught,
      firstCaughtAt: before.firstCaughtAt,
      bestCaughtAt: before.bestCaughtAt,
    });
    expect(fishCodexSpBonus(result.codex)).toBe(0);
    expect(registeredFishIds(result.codex)).not.toContain(fishId);
    expect(caughtFishIds(result.codex)).toContain(fishId);
  });

  it("표본 등록만 한 어종은 포획 점수와 기록을 만들지 않는다", () => {
    const result = registerFishSpecimen(emptyFishCodex(), "carp");

    expect(result.registered).toBe(true);
    expect(result.codex.fish.carp).toMatchObject({
      registered: true,
      caughtEver: false,
      bestSize: 0,
      totalCaught: 0,
    });
    expect(fishCodexScore(result.codex)).toBe(0);
    expect(fishCodexTotalCaught(result.codex)).toBe(0);
    expect(registeredFishIds(result.codex)).toContain("carp");
    expect(caughtFishIds(result.codex)).not.toContain("carp");
  });

  it("추출한 어종을 다시 낚으면 등록권을 회복하고 기록을 이어 쓴다", () => {
    const caught = recordCatch(emptyFishCodex(), "carp", 42, 10);
    const extracted = extractFishRegistration(caught, "carp").codex;
    const reacquired = recordCatch(extracted, "carp", 30, 20);

    expect(reacquired.fish.carp).toMatchObject({
      registered: true,
      caughtEver: true,
      bestSize: 42,
      totalCaught: 2,
      firstCaughtAt: 10,
      bestCaughtAt: 10,
    });
  });

  it("기록 없는 미발견 엔트리는 버린다", () => {
    const parsed = parseFishCodex({
      fish: { goby: { discovered: false, bestSize: 0, totalCaught: 0 } },
    });
    expect(parsed.fish.goby).toBeUndefined();
  });

  it("discoveredFishIds / countDiscoveredFish", () => {
    let codex = emptyFishCodex();
    codex = recordCatch(codex, "carp", 50, 1);
    codex = recordCatch(codex, "trout", 40, 2);
    expect(countDiscoveredFish(codex)).toBe(2);
    expect(discoveredFishIds(codex).sort()).toEqual(["carp", "trout"]);
  });
});

describe("낚시 도감 — 발견 수 마일스톤 SP", () => {
  it("고정 마일스톤마다 1 SP를 지급하고 다음 단계도 반환한다", () => {
    expect(FISHING_CODEX_SP_MILESTONES).toEqual([5, 10, 20, 30, 40, 46, 50]);
    expect(fishCodexSpBonusForCount(4)).toBe(0);
    expect(fishCodexSpBonusForCount(5)).toBe(1);
    expect(fishCodexSpBonusForCount(10)).toBe(2);
    expect(fishCodexSpBonusForCount(39)).toBe(4);
    expect(fishCodexSpBonusForCount(40)).toBe(5);
    expect(fishCodexSpBonusForCount(46)).toBe(6);
    expect(fishCodexSpBonusForCount(49)).toBe(6);
    expect(fishCodexSpBonusForCount(50)).toBe(7);
    expect(fishCodexSpBonusForCount(51)).toBe(7);
    expect(nextFishCodexMilestone(39)).toBe(40);
    expect(nextFishCodexMilestone(46)).toBe(50);
    expect(nextFishCodexMilestone(50)).toBeNull();
  });

  it("발견 어종 수 기준으로 SP를 계산하고 등급 완성은 SP를 주지 않는다", () => {
    const firstTenIds = FISH_IDS.slice(0, 10);
    let codex = emptyFishCodex();
    for (const [i, id] of firstTenIds.entries()) {
      codex = recordCatch(codex, id, 10 + i, 1000 + i);
    }
    expect(fishCodexSpBonus(codex)).toBe(2);

    const legendaryIds = FISH_IDS.filter((id) => FISH[id].tier === "legendary");
    let legendaryCodex = emptyFishCodex();
    for (const [i, id] of legendaryIds.entries()) {
      legendaryCodex = recordCatch(legendaryCodex, id, 10 + i, 1000 + i);
    }
    expect(fishCodexSpBonus(legendaryCodex)).toBe(
      fishCodexSpBonusForCount(legendaryIds.length),
    );
    expect(
      fishTierCompletions(legendaryCodex).find((tier) => tier.tier === "legendary"),
    ).toMatchObject({
      discovered: legendaryIds.length,
      total: legendaryIds.length,
      complete: true,
      sp: 0,
    });

    const firstLegendary = legendaryIds[0];
    expect(firstLegendary).toBeDefined();
    const partial = recordCatch(emptyFishCodex(), firstLegendary!, 10, 1);
    expect(fishCodexSpBonus(partial)).toBe(0);
  });
});

describe("낚시 도감 — 어획 점수", () => {
  it("티어별 마릿수 점수와 개인 최대어 보너스를 합산", () => {
    let codex = emptyFishCodex();
    codex = recordCatch(codex, "crucian_carp", 10, 1);
    codex = recordCatch(codex, "crucian_carp", 45, 2);
    codex = recordCatch(codex, "marlin", 600, 3);

    expect(fishCodexTotalCaught(codex)).toBe(3);
    expect(fishBestSizeScoreBonus("crucian_carp", 45)).toBe(10);
    expect(fishCodexScore(codex)).toBe(2 + 10 + 8 + fishBestSizeScoreBonus("marlin", 600));
  });

  it("마릿수 없는 레거시 발견 기록도 최소 1마리로 계산", () => {
    const codex = parseFishCodex({
      fish: { carp: { discovered: true, bestSize: 50 } },
    });

    expect(fishCodexTotalCaught(codex)).toBe(1);
    expect(fishCodexScore(codex)).toBeGreaterThan(0);
  });
});
