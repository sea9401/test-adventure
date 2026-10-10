// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("탐사 시작 전 카드는 탐사망으로 안내하고 누르면 탐사망을 연다", () => {
    const onSelect = vi.fn();
    const onOpenNetwork = vi.fn();
    render(
      <UnexploredDungeonCard
        snapshot={{
          level: 100,
          eligible: true,
          selectedNodeIds: [],
          difficulty: 95,
          encounterShares: [{ kind: "base", share: 100 }],
        }}
        onSelect={onSelect}
        onOpenNetwork={onOpenNetwork}
      />,
    );

    const card = screen.getByRole<HTMLButtonElement>("button", { name: /탐사 시작 필요/ });
    expect(card.disabled).toBe(false);
    expect(card.textContent).toContain("탐사망 가운데의 탐사 시작 노드를 켜면 입장할 수 있습니다");
    fireEvent.click(card);
    expect(onOpenNetwork).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("100레벨 미만이면 탐사망 연결이 있어도 카드를 잠근다", () => {
    render(
      <UnexploredDungeonCard
        snapshot={{
          level: 99,
          eligible: false,
          selectedNodeIds: [],
          difficulty: 95,
          encounterShares: [{ kind: "base", share: 100 }],
        }}
        onSelect={vi.fn()}
        onOpenNetwork={vi.fn()}
      />,
    );

    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /100레벨 달성 필요/ }).disabled,
    ).toBe(true);
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

describe("사냥터 지역 그림", () => {
  it("사냥터 목록 카드와 열린 사냥터 머리에 그 지역 그림을 보여 준다", () => {
    const list = renderToStaticMarkup(
      <V2DungeonList frontierDepth={8} onSelectFloor={vi.fn()} onBack={vi.fn()} />,
    );
    const opened = renderToStaticMarkup(
      <V2DungeonList
        frontierDepth={8}
        initialOpenDepth={7}
        onSelectFloor={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(list).toContain("plains.webp");
    expect(list).toContain("canyon.webp");
    expect(opened.split("canyon.webp").length - 1).toBeGreaterThan(0);
    expect(opened).not.toContain("plains.webp");
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

describe("사냥터 PC 2단", () => {
  function wideScreen() {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("1024px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  }

  it("1024px 이상에서는 사냥터 목록과 고른 사냥터 구역을 나란히 보여 주고 도전 구역이 있는 사냥터를 먼저 고른다", () => {
    wideScreen();
    const { container } = render(
      <V2DungeonList frontierDepth={8} onSelectFloor={vi.fn()} onBack={vi.fn()} />,
    );

    const aside = container.querySelector("aside");
    const selected = aside?.querySelector('[aria-current="true"]');
    expect(selected?.textContent).toContain("도전 구역 포함");
    expect(container.querySelector("aside + div")?.textContent).toContain("입장");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("사냥터");
    expect(aside?.className).not.toContain("lg:sticky");
    // 사냥터 이름과 지역 그림은 오른쪽 맨 위 카드 하나에 함께 둔다.
    const main = container.querySelector("aside + div");
    const nameCard = main?.querySelector("h2")?.closest(".ui-surface-card");
    expect(nameCard?.querySelector("img")).toBeTruthy();
    expect(main?.querySelectorAll("img")).toHaveLength(1);
    // 환경 설정에서 사냥터 그림을 끄면 감출 수 있도록 모든 그림 영역에 표식을 단다.
    const images = Array.from(container.querySelectorAll("img"));
    expect(images.length).toBeGreaterThan(1);
    for (const image of images) {
      expect(image.closest(".ui-hunting-ground-image")).toBeTruthy();
    }
  });

  it("고른 사냥터를 표시 설정에서 숨기면 남은 사냥터로 넘어간다", () => {
    wideScreen();
    const { container } = render(
      <V2DungeonList frontierDepth={8} onSelectFloor={vi.fn()} onBack={vi.fn()} />,
    );
    const before = container.querySelector('aside [aria-current="true"]')?.textContent ?? "";
    const name = before.split("입구")[0].replace("도전 구역 포함", "").trim();

    fireEvent.click(screen.getByRole("button", { name: "표시 설정" }));
    const label = Array.from(container.querySelectorAll("label")).find((item) =>
      item.textContent?.startsWith(name),
    );
    fireEvent.click(label!.querySelector("input")!);

    const after = container.querySelector('aside [aria-current="true"]');
    expect(after).toBeTruthy();
    expect(after?.textContent?.startsWith(name)).toBe(false);
  });
});
