// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V2UnexploredTreeView } from "./V2UnexploredTreeView";
import type { UnexploredClientSnapshot } from "./unexploredTreeModel";

const mocks = vi.hoisted(() => ({ notifySystem: vi.fn() }));

vi.mock("@/adventure/v2/RewardToastProvider", () => ({
  useSystemToast: () => ({ notifySystem: mocks.notifySystem }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.notifySystem.mockClear();
});

const SNAPSHOT: UnexploredClientSnapshot = {
  level: 100,
  eligible: true,
  earnedPoints: 3,
  spentPoints: 2,
  explorationXp: 10,
  xpPoints: 3,
  nextPointCost: 100,
  nextPointRemaining: 90,
  selectedNodeIds: ["start", "inner-0-0"],
  difficulty: 95,
  difficultyIncrease: 0,
  encounterShares: [{ kind: "base", share: 100 }],
  rewardSummary: {
    gold: 0,
    baseMaterial: 0,
    equipment: 0,
    quality: 0,
    specialMaterial: 0,
    rare: 0,
    rareCopyChancePct: 0,
    traceExtraChancePct: 0,
    basePoolRewardPct: 0,
    conversion: null,
  },
  traces: {},
  achievementIds: [],
  refundGoldCost: 50_000,
};

describe("V2UnexploredTreeView", () => {
  it("renders the 160-node graph, point progress and opaque panels", () => {
    const html = renderToStaticMarkup(
      <V2UnexploredTreeView initialSnapshot={SNAPSHOT} onBack={vi.fn()} />,
    );

    expect(html.match(/data-unexplored-node=/g)).toHaveLength(160);
    expect(html).toContain("탐사 포인트");
    expect(html).toContain("2 / 3");
    expect(html).toContain("난이도 95");
    expect(html).toContain("bg-white");
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toMatch(/bg-[^&quot;\s]*\/(40|70)/);
    const bareOpacityClasses = [...html.matchAll(/class="([^"]*)"/g)]
      .flatMap((match) => match[1].split(/\s+/))
      .filter((className) => className.startsWith("opacity-"));
    expect(bareOpacityClasses).toEqual([]);
  });

  it("keeps progress visible but disables editing below level 100", () => {
    const html = renderToStaticMarkup(
      <V2UnexploredTreeView
        initialSnapshot={{ ...SNAPSHOT, level: 42, eligible: false }}
        onBack={vi.fn()}
      />,
    );

    expect(html).toContain("100레벨 달성 후 다시 입장할 수 있습니다");
    expect(html).toContain("2 / 3");
  });

  it("replaces the full snapshot with the server response after activation", async () => {
    const nextSnapshot: UnexploredClientSnapshot = {
      ...SNAPSHOT,
      spentPoints: 3,
      selectedNodeIds: [...SNAPSHOT.selectedNodeIds, "inner-0-1"],
    };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, snapshot: nextSnapshot }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <V2UnexploredTreeView initialSnapshot={SNAPSHOT} onBack={vi.fn()} />,
    );

    fireEvent.click(
      container.querySelector('[data-unexplored-node="inner-0-1"]')!,
    );
    fireEvent.click(screen.getByRole("button", { name: "탐사 포인트 1 사용" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/unexplored",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "activate", nodeId: "inner-0-1" }),
      }),
    );
    await waitFor(() => expect(screen.getByText("3 / 3")).toBeTruthy());
    expect(mocks.notifySystem).toHaveBeenCalledWith(
      "✓ 탐사 노드를 활성화했습니다.",
      "success",
    );
  });
});
