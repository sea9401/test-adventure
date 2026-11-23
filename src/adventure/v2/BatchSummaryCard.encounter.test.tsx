// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  BatchSummaryCard,
  type BatchReplayEntry,
  type BatchSummary,
} from "./BatchSummaryCard";

afterEach(cleanup);

const replay = { enemy: { name: "들거미", hp: 76 }, log: [] } as unknown as ReplayPayload;

function summaryOf(count: number): BatchSummary {
  const replays: BatchReplayEntry[] = Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    enemyName: "들거미",
    won: true,
    turns: 3,
    replay,
  }));
  return {
    attempted: count,
    completed: count,
    wins: count,
    losses: 0,
    totalExp: 225,
    expAfter: 266,
    totalProficiency: 20,
    proficiencyPointsAfter: 66,
    totalMastery: 0,
    totalGold: 114,
    finalGoldAfter: 442,
    levelsGained: 1,
    statGains: { spi: 1 },
    hpGained: 13,
    mpGained: 5,
    drops: {},
    droppedEquipments: [],
    droppedUniques: [],
    replays,
  };
}

describe("여러 번 사냥 요약: 사냥 화면의 칩 모양", () => {
  it("보상을 한 번 사냥과 같은 칩으로, 합계와 종류별 색으로 보여 준다", () => {
    const { container } = render(
      <BatchSummaryCard
        summary={summaryOf(10)}
        gainChips
        onSelectReplay={vi.fn()}
      />,
    );

    const chips = container.querySelector('[aria-label="이번 전투에서 얻은 것"]');
    expect(chips?.textContent).toContain("골드 +114");
    expect(chips?.textContent).toContain("숙달 포인트 +20");
    expect(chips?.textContent).toContain("경험치 +225");
    expect(chips?.textContent).toContain("레벨 업 +1");
    expect(chips?.textContent).not.toContain("직업 숙련도");
    expect(chips?.innerHTML).toContain("text-yellow-700");
    expect(chips?.innerHTML).toContain("text-violet-700");
    expect(chips?.innerHTML).toContain("text-emerald-700");
    // 보유량 네 칸과 예전 레벨 업 상자는 그리지 않는다.
    expect(
      container.querySelector('[aria-label="전투 후 보유량과 이번 변동"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("레벨 업!");
    expect(container.textContent).toContain("10회 사냥");
    expect(container.textContent).toContain("10승");
  });

  it("따로 켜지 않으면 예전처럼 보유량 네 칸을 보여 준다", () => {
    const { container } = render(<BatchSummaryCard summary={summaryOf(10)} />);

    expect(
      container.querySelector('[aria-label="전투 후 보유량과 이번 변동"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="이번 전투에서 얻은 것"]'),
    ).toBeNull();
  });
});

describe("여러 번 사냥 요약: 전투 기록 버튼", () => {
  it("열 번까지는 접지 않고 모두 보여 준다", () => {
    render(<BatchSummaryCard summary={summaryOf(10)} onSelectReplay={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: /^\d+회$/ })).toHaveLength(10);
    expect(screen.queryByRole("button", { name: /나머지/ })).toBeNull();
  });

  it("쉰 번이면 앞의 열 개만 보이고 나머지는 눌러서 펼친다", () => {
    const onSelectReplay = vi.fn();
    render(
      <BatchSummaryCard summary={summaryOf(50)} onSelectReplay={onSelectReplay} />,
    );

    expect(screen.getAllByRole("button", { name: /^\d+회$/ })).toHaveLength(10);
    const more = screen.getByRole("button", { name: "나머지 40개 보기" });
    expect(more.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(more);

    expect(screen.getAllByRole("button", { name: /^\d+회$/ })).toHaveLength(50);
    fireEvent.click(screen.getByRole("button", { name: "50회" }));
    expect(onSelectReplay).toHaveBeenCalledWith(
      expect.objectContaining({ index: 50 }),
    );
    expect(
      screen.getByRole("button", { name: "기록 접기" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });
});
