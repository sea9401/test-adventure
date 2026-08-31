import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { newRareMapInstance } from "@/adventure/data/v2/rareMaps";
import { RareMapButton, UnexploredDungeonCard } from "./V2DungeonList";

describe("열린 희귀 탐사 카드", () => {
  it("한 번의 탐사로 정산할 보상 횟수와 남은 시간을 표시한다", () => {
    const map = newRareMapInstance("worn_map", 10, 1_000, "rm-open");
    const html = renderToStaticMarkup(
      <RareMapButton
        map={{ ...map, runsLeft: 4 }}
        serverNow={map.foundAt}
        frontierDepth={10}
        onSelect={vi.fn()}
        onDiscard={vi.fn()}
        discarding={false}
        onExpire={vi.fn()}
      />,
    );

    expect(html).toContain("1회 탐사 · 보상 4회분");
    expect(html).not.toContain("남은 4판");
    expect(html).toContain("30분 동안 개방");
    expect(html).toContain("남은 시간 30:00");
  });
});

describe("미개척지 사냥터 카드", () => {
  it("서버 난이도와 활성 몬스터 풀만 최대 3개까지 표시한다", () => {
    const html = renderToStaticMarkup(
      <UnexploredDungeonCard
        snapshot={{
          level: 100,
          eligible: true,
          selectedNodeIds: ["start"],
          difficulty: 108,
          encounterShares: [
            { kind: "base", share: 30 },
            { kind: "pool", poolId: "iron_legion", share: 25 },
            { kind: "pool", poolId: "mana_barrier", share: 25 },
            { kind: "pool", poolId: "regenerating_swarm", share: 20 },
          ],
        }}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain("미개척지 · 난이도 108");
    expect(html).toContain("철갑 군단 25%");
    expect(html).toContain("마력 방벽체 25%");
    expect(html).toContain("재생 군체 20%");
    expect(html).not.toContain("기본 몬스터 30%");
    expect(html).not.toContain(' disabled=""');
  });

  it("100레벨 미만과 탐사 시작 전에는 입장을 잠근다", () => {
    const underLevel = renderToStaticMarkup(
      <UnexploredDungeonCard
        snapshot={{
          level: 99,
          eligible: false,
          selectedNodeIds: [],
          difficulty: 95,
          encounterShares: [{ kind: "base", share: 100 }],
        }}
        onSelect={vi.fn()}
      />,
    );
    const beforeStart = renderToStaticMarkup(
      <UnexploredDungeonCard
        snapshot={{
          level: 100,
          eligible: true,
          selectedNodeIds: [],
          difficulty: 95,
          encounterShares: [{ kind: "base", share: 100 }],
        }}
        onSelect={vi.fn()}
      />,
    );

    expect(underLevel).toContain("100레벨 달성 필요");
    expect(underLevel).toContain(' disabled=""');
    expect(beforeStart).toContain("탐사 시작 필요");
    expect(beforeStart).toContain(' disabled=""');
  });
});
