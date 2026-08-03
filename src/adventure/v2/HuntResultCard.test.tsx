import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  HuntResultCard,
  type HuntResult,
} from "@/adventure/v2/HuntResultCard";
import {
  BatchSummaryCard,
  type BatchSummary,
} from "@/adventure/v2/BatchSummaryCard";

const BASE_RESULT: HuntResult = {
  floor: 2,
  enemyName: "슬라임",
  won: false,
  expGained: 0,
  goldGained: 0,
  levelsGained: 0,
  turns: 3,
  hpBefore: 100,
  hpAfter: 0,
  maxHp: 100,
};

describe("HuntResultCard 패배 골드 안내", () => {
  it("손실액과 차감 전후 보유 골드를 경고 영역에 표시한다", () => {
    const html = renderToStaticMarkup(
      <HuntResultCard
        result={{ ...BASE_RESULT, lossTax: 1_234, goldAfter: 8_766 }}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("패배 페널티 · 골드 −1,234 G");
    expect(html).toContain("보유 골드 10,000 G");
    expect(html).toContain("8,766 G");
  });

  it("차감액이 0이면 골드를 잃지 않았다고 명시한다", () => {
    const html = renderToStaticMarkup(
      <HuntResultCard
        result={{ ...BASE_RESULT, lossTax: 0, goldAfter: 8_766 }}
      />,
    );

    expect(html).toContain("이번 패배로 잃은 골드는 없습니다.");
  });
});

describe("BatchSummaryCard 패배 골드 안내", () => {
  it("일괄 사냥의 획득 골드와 패배 손실 골드를 함께 표시한다", () => {
    const summary: BatchSummary = {
      attempted: 5,
      completed: 3,
      wins: 2,
      losses: 1,
      totalExp: 100,
      totalProficiency: 4,
      totalMastery: 2,
      totalGold: 300,
      totalLossTax: 120,
      finalGoldAfter: 1_180,
      levelsGained: 0,
      statGains: {},
      drops: {},
      droppedEquipments: [],
      droppedUniques: [],
      stoppedReason: "defeat",
    };

    const html = renderToStaticMarkup(<BatchSummaryCard summary={summary} />);

    expect(html).toContain("패배 페널티 · 골드 −120 G");
    expect(html).toContain("+300");
    expect(html).toContain("−120");
  });
});
