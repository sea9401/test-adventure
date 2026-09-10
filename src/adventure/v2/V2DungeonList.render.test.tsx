// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newRareMapInstance } from "@/adventure/data/v2/rareMaps";
import { RareMapButton, UnexploredDungeonCard, V2DungeonList } from "./V2DungeonList";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

describe("사냥터 성장 안내", () => {
  it("단계 선택에서 성장과 정복 기록을 표시하고 스탯 난이도는 숨긴다", () => {
    const html = renderToStaticMarkup(
      <V2DungeonList
        frontierDepth={6}
        initialOpenDepth={1}
        playerLevel={80}
        playerLevelCap={100}
        playerJobTier={2}
        onSelectFloor={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(html).toContain("현재 성장");
    expect(html).toContain("정복 기록 있음");
    expect(html).toContain("입장");
    expect(html).not.toContain("전투력");
    expect(html).not.toContain("스탯 합계");
    expect(html).not.toContain("난이도 지표");
  });
});

describe("사냥터 희귀 지도 요청", () => {
  it("부모가 선택 콜백을 새로 만들어도 희귀 지도 목록을 다시 요청하지 않는다", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, rareMaps: [], serverNow: Date.now() }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const baseProps = {
      frontierDepth: 6,
      onSelectFloor: vi.fn(),
      onBack: vi.fn(),
    };
    const { rerender } = render(
      <V2DungeonList {...baseProps} onSelectRareMap={vi.fn()} />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const initialRequestCount = fetchMock.mock.calls.length;

    await act(async () => {
      rerender(<V2DungeonList {...baseProps} onSelectRareMap={vi.fn()} />);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(initialRequestCount);
  });
});
