// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V2UnexploredTreeView } from "./V2UnexploredTreeView";
import type { UnexploredClientSnapshot } from "./unexploredTreeModel";
import { SUMMON_SCROLL_MATERIAL_ID } from "@/adventure/data/v2/coopBosses";
import { shortestUnexploredPath } from "@/adventure/data/v2/unexploredTree";
import {
  UNEXPLORED_BOSSES,
  UNEXPLORED_SUMMON_STONE_GOLD_COST,
  UNEXPLORED_SUMMON_STONE_SCROLL_COST,
} from "@/adventure/data/v2/unexploredBosses";

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
  effects: { traceEnabled: false },
  traces: {},
  gold: 0,
  bankedGold: 0,
  materials: {},
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

  it("흔적 보관함에 보스별 제작식의 현재/필요 수량과 고정 골드를 표시한다", () => {
    const tracking = UNEXPLORED_BOSSES.tracking_weapon;
    const html = renderToStaticMarkup(
      <V2UnexploredTreeView
        initialSnapshot={{
          ...SNAPSHOT,
          selectedNodeIds: ["start", "deep-boss"],
          effects: { traceEnabled: true },
          gold: UNEXPLORED_SUMMON_STONE_GOLD_COST,
          traces: { runaway_machines: 500, shadow_stalkers: 500 },
          materials: {
            v2_unexplored_runaway_machines_material: 10,
            v2_unexplored_shadow_stalkers_material: 10,
            [SUMMON_SCROLL_MATERIAL_ID]: UNEXPLORED_SUMMON_STONE_SCROLL_COST,
            [tracking.summonMaterialId]: 1,
          },
        }}
        onBack={vi.fn()}
      />,
    );

    expect(html).toContain("흔적 보관함");
    expect(html).toContain("추적 병기 소환석");
    expect(html).toContain("폭주 기계 흔적");
    expect(html).toContain("그림자 추적자 흔적");
    expect(html).toContain("500 / 500");
    expect(html).toContain("10 / 10");
    expect(html).toContain("30 / 30");
    expect(html).toContain(
      `${UNEXPLORED_SUMMON_STONE_GOLD_COST.toLocaleString()} / ${UNEXPLORED_SUMMON_STONE_GOLD_COST.toLocaleString()}G`,
    );
  });

  it("네트워크 오류 뒤 제작 재시도에 같은 requestId를 사용한다", async () => {
    const tracking = UNEXPLORED_BOSSES.tracking_weapon;
    const ready = {
      ...SNAPSHOT,
      selectedNodeIds: ["start", "deep-boss"],
      effects: { traceEnabled: true },
      gold: UNEXPLORED_SUMMON_STONE_GOLD_COST,
      traces: { runaway_machines: 500, shadow_stalkers: 500 },
      materials: {
        v2_unexplored_runaway_machines_material: 10,
        v2_unexplored_shadow_stalkers_material: 10,
        [SUMMON_SCROLL_MATERIAL_ID]: UNEXPLORED_SUMMON_STONE_SCROLL_COST,
      },
    } satisfies UnexploredClientSnapshot;
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            idempotent: false,
            gold: 0,
            bankedGold: 0,
            materials: { [tracking.summonMaterialId]: 1 },
            traces: {},
            achievementIds: ["first_summon_stone_craft"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "craft-request-1") });
    render(<V2UnexploredTreeView initialSnapshot={ready} onBack={vi.fn()} />);

    const craftButton = screen.getByRole("button", {
      name: "추적 병기 소환석 제작",
    });
    fireEvent.click(craftButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(craftButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(craftButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const bodies = fetchMock.mock.calls.map((call) =>
      JSON.parse((call[1] as RequestInit).body as string),
    );
    expect(bodies).toEqual([
      { bossId: "tracking_weapon", requestId: "craft-request-1" },
      { bossId: "tracking_weapon", requestId: "craft-request-1" },
    ]);
  });

  it("흔적 노드가 꺼져도 보유 소환석은 사용하고 상세 화면으로 이동한다", async () => {
    const tracking = UNEXPLORED_BOSSES.tracking_weapon;
    const onOpenSession = vi.fn();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          sessionId: "personal-session",
          summonStonesLeft: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <V2UnexploredTreeView
        initialSnapshot={{
          ...SNAPSHOT,
          level: 1,
          eligible: false,
          effects: { traceEnabled: false },
          materials: { [tracking.summonMaterialId]: 1 },
        }}
        onBack={vi.fn()}
        onOpenSession={onOpenSession}
      />,
    );

    const craftButton = screen.getByRole("button", {
      name: "추적 병기 소환석 제작",
    });
    const summonButton = screen.getByRole("button", { name: "추적 병기 소환" });
    expect(craftButton.hasAttribute("disabled")).toBe(true);
    expect(summonButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(summonButton);
    await waitFor(() => expect(onOpenSession).toHaveBeenCalledWith("personal-session"));
  });

  it("보상 전환 노드 충돌을 잠금 이유로 안내한다", () => {
    const selectedNodeIds = [
      ...new Set([
        ...shortestUnexploredPath("deep-gold"),
        ...shortestUnexploredPath("deep-collector").slice(0, -1),
      ]),
    ];
    const { container } = render(
      <V2UnexploredTreeView
        initialSnapshot={{
          ...SNAPSHOT,
          earnedPoints: 160,
          spentPoints: selectedNodeIds.length,
          selectedNodeIds,
        }}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(
      container.querySelector('[data-unexplored-node="deep-collector"]')!,
    );
    expect(
      screen.getByText("보상 전환 노드는 하나만 선택할 수 있습니다."),
    ).toBeTruthy();
  });
});
