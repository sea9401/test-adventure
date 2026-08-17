import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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

describe("HuntResultCard 경험치 음식 안내", () => {
  it("경험치 버프 비율과 실제 추가 EXP를 표시한다", () => {
    const html = renderToStaticMarkup(
      <HuntResultCard
        result={{
          ...BASE_RESULT,
          won: true,
          expGained: 160,
          hpAfter: 100,
          foodExpBuff: {
            name: "깨달음의 허브차",
            expPct: 60,
            expBonus: 60,
          },
        }}
      />,
    );

    expect(html).toContain("깨달음의 허브차");
    expect(html).toContain("사냥 경험치 +60%");
    expect(html).toContain("EXP +60");
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

    const html = renderToStaticMarkup(
      <BatchSummaryCard summary={summary} remainingStamina={37} />,
    );

    expect(html).toContain("패배 페널티 · 골드 −120 G");
    expect(html).toContain("+300");
    expect(html).toContain("−120");
    expect(html).toContain("전투 종료 · 남은 스태미너 37");
    expect(html).toContain("예정보다 일찍 중단 · 전투에서 패배했습니다.");
  });
});

describe("희귀맵 발견 바로가기", () => {
  const map = {
    iid: "rm-new",
    kind: "worn_map" as const,
    depth: 12,
    runsLeft: 30,
    foundAt: 1,
  };

  it("단판 결과에 새 지도 바로가기 버튼을 표시한다", () => {
    const html = renderToStaticMarkup(
      <HuntResultCard
        result={{
          ...BASE_RESULT,
          won: true,
          hpAfter: 100,
          rareMapDrop: map.kind,
          rareMapDropInstance: map,
        }}
        onEnterRareMap={vi.fn()}
      />,
    );

    expect(html).toContain("낡은 탐사로");
    expect(html).toContain(">바로가기</button>");
    expect(html).toContain("30분 동안 개방");
    expect(html).toContain("남은 시간 30:00");
  });

  it("일괄 결과에 발견한 각 지도 바로가기 버튼을 표시한다", () => {
    const summary: BatchSummary = {
      attempted: 50,
      completed: 1,
      wins: 1,
      losses: 0,
      totalExp: 100,
      totalProficiency: 2,
      totalGold: 100,
      levelsGained: 0,
      statGains: {},
      drops: {},
      droppedEquipments: [],
      droppedUniques: [],
      rareMapDrops: [map.kind],
      rareMapDropInstances: [map],
    };
    const html = renderToStaticMarkup(
      <BatchSummaryCard summary={summary} onEnterRareMap={vi.fn()} />,
    );

    expect(html).toContain("낡은 탐사로");
    expect(html.match(/>바로가기<\/button>/g)).toHaveLength(1);
    expect(html).toContain("30분 동안 개방");
    expect(html).toContain("남은 시간 30:00");
  });
});

describe("사냥 장비 획득 분류", () => {
  it("단판에서 정규 세트 장비를 전용 문구로 표시한다", () => {
    const html = renderToStaticMarkup(
      <HuntResultCard
        result={{
          ...BASE_RESULT,
          won: true,
          hpAfter: 100,
          droppedEquipment: "v2_canyon_set_armor",
        }}
      />,
    );

    expect(html).toContain("세트 「황토 흉갑」 획득!");
    expect(html).not.toContain("황토 흉갑을(를) 획득했다!");
  });

  it("유니크 세트는 유니크 분류를 우선한다", () => {
    const html = renderToStaticMarkup(
      <HuntResultCard
        result={{
          ...BASE_RESULT,
          won: true,
          hpAfter: 100,
          droppedUnique: "v2_sanctum_sig_priest_armor",
        }}
      />,
    );

    expect(html).toContain("유니크 세트 「");
    expect(html).toContain("잊힌 사제의 성갑");
  });

  it("일괄 사냥에서도 일반 장비와 세트 장비를 분리한다", () => {
    const summary: BatchSummary = {
      attempted: 50,
      completed: 50,
      wins: 50,
      losses: 0,
      totalExp: 100,
      totalProficiency: 2,
      totalGold: 100,
      levelsGained: 0,
      statGains: {},
      drops: {},
      droppedEquipments: [
        "v2_canyon_greatsword",
        "v2_canyon_set_armor",
      ],
      droppedUniques: [],
    };
    const html = renderToStaticMarkup(<BatchSummaryCard summary={summary} />);

    expect(html).toContain("세트");
    expect(html).toContain("황토 흉갑");
    expect(html).toContain("협곡의 단판을(를) 획득했다!");
  });
});
