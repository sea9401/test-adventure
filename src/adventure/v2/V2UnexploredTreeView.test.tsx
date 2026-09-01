// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V2UnexploredTreeView } from "./V2UnexploredTreeView";
import type { UnexploredClientSnapshot } from "./unexploredTreeModel";
import { SUMMON_SCROLL_MATERIAL_ID } from "@/adventure/data/v2/coopBosses";
import { shortestUnexploredPath } from "@/adventure/data/v2/unexploredTree";
import {
  UNEXPLORED_BOSS_CORE_MATERIAL,
  UNEXPLORED_BOSSES,
  UNEXPLORED_SUMMON_STONE_GOLD_COST,
  UNEXPLORED_SUMMON_STONE_SCROLL_COST,
} from "@/adventure/data/v2/unexploredBosses";

const mocks = vi.hoisted(() => ({
  notifySystem: vi.fn(),
  confirmGameAction: vi.fn(async () => true),
}));

vi.mock("@/adventure/v2/RewardToastProvider", () => ({
  useSystemToast: () => ({ notifySystem: mocks.notifySystem }),
}));
vi.mock("@/components/ui/gameDialog", () => ({
  confirmGameAction: mocks.confirmGameAction,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.notifySystem.mockClear();
  mocks.confirmGameAction.mockReset().mockResolvedValue(true);
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
  summonStoneCraftCost: {
    baseGoldCost: UNEXPLORED_SUMMON_STONE_GOLD_COST,
    goldCost: UNEXPLORED_SUMMON_STONE_GOLD_COST,
    liberationDiscountPct: 0,
  },
};

function openUnexploredTab(
  name: "탐사망" | "탐사 업적" | "흔적 보관함" | "우두머리 핵 제작소",
) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

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

  it("탐사망·탐사 업적·흔적 보관함·우두머리 핵 제작소를 독립 탭으로 표시한다", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<V2UnexploredTreeView initialSnapshot={SNAPSHOT} onBack={vi.fn()} />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "탐사망",
      "탐사 업적",
      "흔적 보관함",
      "우두머리 핵 제작소",
    ]);
    expect(
      screen.getByRole("tab", { name: "탐사망" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "탐사망" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "초기화" })).toBeTruthy();

    openUnexploredTab("탐사 업적");

    expect(screen.getByRole("tabpanel", { name: "탐사 업적" })).toBeTruthy();
    expect(document.getElementById("unexplored-panel-tree")?.hidden).toBe(true);
    expect(screen.queryByRole("button", { name: "초기화" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("활성 공용 풀 카드에 공유 재료와 개척자 무기의 일반·집중 드랍률을 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2UnexploredTreeView
        initialSnapshot={{
          ...SNAPSHOT,
          encounterShares: [
            { kind: "base", share: 70 },
            { kind: "pool", poolId: "iron_legion", share: 30 },
          ],
        }}
        onBack={vi.fn()}
      />,
    );

    expect(html).toContain("강화 철편");
    expect(html).toContain("재료 1% · 집중 1.5%");
    expect(html).toContain("철성 파쇄검");
    expect(html).toContain("무기 0.1% · 집중 0.2%");
  });

  it("shows all ten exploration achievements with their completion state and reward", () => {
    render(
      <V2UnexploredTreeView
        initialSnapshot={{
          ...SNAPSHOT,
          achievementIds: ["first_personal_boss"],
        }}
        onBack={vi.fn()}
      />,
    );

    openUnexploredTab("탐사 업적");

    const list = screen.getByRole("list", { name: "탐사 업적" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    expect(
      within(list).getByRole("listitem", {
        name: "미개척지 보스 첫 처치 완료",
      }),
    ).toBeTruthy();
    expect(
      within(list).getByRole("listitem", {
        name: "추적 병기 처치 미완료",
      }),
    ).toBeTruthy();
    expect(within(list).getAllByText("탐사 포인트 +1")).toHaveLength(10);
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
    fireEvent.click(
      screen.getByRole("button", {
        name: "탐사 포인트 1 사용 · 1개 활성화",
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/unexplored",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "activate_path", nodeId: "inner-0-1" }),
      }),
    );
    await waitFor(() => expect(screen.getByText("3 / 3")).toBeTruthy());
    expect(mocks.notifySystem).toHaveBeenCalledWith(
      "✓ 탐사 노드 1개를 활성화했습니다.",
      "success",
    );
  });

  it("selects and activates every missing node on a distant shortest route", async () => {
    const selectedNodeIds = shortestUnexploredPath("pool-iron_legion");
    const ready = {
      ...SNAPSHOT,
      earnedPoints: 9,
    } satisfies UnexploredClientSnapshot;
    const nextSnapshot = {
      ...ready,
      spentPoints: selectedNodeIds.length,
      selectedNodeIds,
    } satisfies UnexploredClientSnapshot;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, snapshot: nextSnapshot }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <V2UnexploredTreeView initialSnapshot={ready} onBack={vi.fn()} />,
    );

    fireEvent.click(
      container.querySelector('[data-unexplored-node="pool-iron_legion"]')!,
    );

    expect(
      container.querySelectorAll('[data-unexplored-plan="activate"]'),
    ).toHaveLength(7);
    fireEvent.click(
      screen.getByRole("button", {
        name: "탐사 포인트 7 사용 · 7개 활성화",
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/unexplored",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "activate_path",
          nodeId: "pool-iron_legion",
        }),
      }),
    );
    await waitFor(() => expect(screen.getByText("9 / 9")).toBeTruthy());
  });

  it("selects and refunds the minimum disconnected active route in one request", async () => {
    const selectedNodeIds = shortestUnexploredPath("route-b-0");
    const ready = {
      ...SNAPSHOT,
      earnedPoints: 30,
      spentPoints: selectedNodeIds.length,
      selectedNodeIds,
      gold: 100_000,
    } satisfies UnexploredClientSnapshot;
    const nextSnapshot = {
      ...ready,
      spentPoints: selectedNodeIds.length - 2,
      selectedNodeIds: selectedNodeIds.slice(0, -2),
      gold: 0,
    } satisfies UnexploredClientSnapshot;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, snapshot: nextSnapshot }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <V2UnexploredTreeView initialSnapshot={ready} onBack={vi.fn()} />,
    );

    fireEvent.click(
      container.querySelector('[data-unexplored-node="route-a-0"]')!,
    );

    expect(
      container.querySelectorAll('[data-unexplored-plan="refund"]'),
    ).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "100,000G로 2개 반환" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/unexplored",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "refund_path",
          nodeId: "route-a-0",
        }),
      }),
    );
    await waitFor(() => expect(screen.getByText("9 / 30")).toBeTruthy());
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

  it("소환석 제작의 기본 비용·해방 할인·실제 비용을 서버 값으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2UnexploredTreeView
        initialSnapshot={{
          ...SNAPSHOT,
          summonStoneCraftCost: {
            baseGoldCost: UNEXPLORED_SUMMON_STONE_GOLD_COST,
            goldCost: UNEXPLORED_SUMMON_STONE_GOLD_COST * 0.9,
            liberationDiscountPct: 10,
          },
        }}
        onBack={vi.fn()}
      />,
    );

    expect(html).toContain(`기본 ${UNEXPLORED_SUMMON_STONE_GOLD_COST.toLocaleString()}G`);
    expect(html).toContain(`실제 ${(UNEXPLORED_SUMMON_STONE_GOLD_COST * 0.9).toLocaleString()}G`);
    expect(html).toContain("해방 할인 10%");
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

    openUnexploredTab("흔적 보관함");

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

    openUnexploredTab("흔적 보관함");

    const craftButton = screen.getByRole("button", {
      name: "추적 병기 소환석 제작",
    });
    const summonButton = screen.getByRole("button", { name: "추적 병기 소환" });
    expect(craftButton.hasAttribute("disabled")).toBe(true);
    expect(summonButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(summonButton);
    await waitFor(() => expect(onOpenSession).toHaveBeenCalledWith("personal-session"));
  });

  it("우두머리 핵 제작소는 일반 고유 6종과 드롭 전용 초희귀 3종을 구분한다", () => {
    const html = renderToStaticMarkup(
      <V2UnexploredTreeView
        initialSnapshot={{
          ...SNAPSHOT,
          materials: {
            [UNEXPLORED_BOSS_CORE_MATERIAL.id]: 25,
            v2_unexplored_runaway_machines_material: 75,
            v2_unexplored_shadow_stalkers_material: 75,
          },
        }}
        onBack={vi.fn()}
      />,
    );

    expect(html).toContain("우두머리 핵 제작소");
    expect(html).toContain("보유 우두머리 핵 25개");
    for (const name of [
      "추적날 단검",
      "허상 가속화",
      "독혈 발톱",
      "응고독 반지",
      "빙하 파쇄망치",
      "얼어붙은 거갑",
    ]) {
      expect(html).toContain(name);
    }
    for (const name of [
      "무한궤도 심장",
      "부패하지 않는 심장",
      "절대영도의 핵",
    ]) {
      expect(html).toContain(name);
    }
    expect(html.match(/0\.5% · 토벌 드롭 전용/g)).toHaveLength(3);
    expect(html.match(/aria-label="[^"]+ 확정 제작"/g)).toHaveLength(6);
    expect(html).toContain("25 / 8");
    expect(html).toContain("25 / 25");
    expect(html).toContain("75 / 25");
    expect(html).toContain("75 / 75");
  });

  it.each([
    ["핵", { v2_unexplored_runaway_machines_material: 25, v2_unexplored_shadow_stalkers_material: 25 }],
    ["첫 연결 재료", { [UNEXPLORED_BOSS_CORE_MATERIAL.id]: 8, v2_unexplored_shadow_stalkers_material: 25 }],
    ["둘째 연결 재료", { [UNEXPLORED_BOSS_CORE_MATERIAL.id]: 8, v2_unexplored_runaway_machines_material: 25 }],
  ])("%s 부족이면 일반 고유 확정 제작을 비활성화한다", (_label, materials) => {
    render(
      <V2UnexploredTreeView
        initialSnapshot={{ ...SNAPSHOT, materials }}
        onBack={vi.fn()}
      />,
    );

    openUnexploredTab("우두머리 핵 제작소");

    expect(
      screen.getByRole("button", { name: "추적날 단검 확정 제작" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("확인을 취소하면 장비 제작 요청을 보내지 않는다", async () => {
    mocks.confirmGameAction.mockResolvedValueOnce(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <V2UnexploredTreeView
        initialSnapshot={{
          ...SNAPSHOT,
          materials: {
            [UNEXPLORED_BOSS_CORE_MATERIAL.id]: 8,
            v2_unexplored_runaway_machines_material: 25,
            v2_unexplored_shadow_stalkers_material: 25,
          },
        }}
        onBack={vi.fn()}
      />,
    );

    openUnexploredTab("우두머리 핵 제작소");

    fireEvent.click(
      screen.getByRole("button", { name: "추적날 단검 확정 제작" }),
    );

    await waitFor(() => expect(mocks.confirmGameAction).toHaveBeenCalledOnce());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("확인한 장비를 제작하고 서버 재료 스냅샷과 획득 알림을 반영한다", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          idempotent: false,
          equipmentId: "v2_unexplored_tracking_blade_dagger",
          equipmentIid: "crafted-equipment-iid",
          materials: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "equipment-craft-request-1"),
    });
    render(
      <V2UnexploredTreeView
        initialSnapshot={{
          ...SNAPSHOT,
          materials: {
            [UNEXPLORED_BOSS_CORE_MATERIAL.id]: 8,
            v2_unexplored_runaway_machines_material: 25,
            v2_unexplored_shadow_stalkers_material: 25,
          },
        }}
        onBack={vi.fn()}
      />,
    );

    openUnexploredTab("우두머리 핵 제작소");

    fireEvent.click(
      screen.getByRole("button", { name: "추적날 단검 확정 제작" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(mocks.confirmGameAction).toHaveBeenCalledWith({
      title: "추적날 단검 확정 제작",
      message: "우두머리 핵 8개\n과열 동력핵 25개\n그림자 피막 25개",
      confirmLabel: "확정 제작",
      tone: "warning",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/unexplored/equipment-craft",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          equipmentId: "v2_unexplored_tracking_blade_dagger",
          requestId: "equipment-craft-request-1",
        }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("보유 우두머리 핵 0개")).toBeTruthy()
    );
    expect(mocks.notifySystem).toHaveBeenCalledWith(
      "✓ 추적날 단검을 제작했습니다.",
      "success",
    );
  });

  it("네트워크 오류 뒤 장비 제작 재시도에 같은 requestId를 사용한다", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            idempotent: true,
            equipmentId: "v2_unexplored_tracking_blade_dagger",
            equipmentIid: "crafted-equipment-iid",
            materials: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "equipment-retry-request"),
    });
    render(
      <V2UnexploredTreeView
        initialSnapshot={{
          ...SNAPSHOT,
          materials: {
            [UNEXPLORED_BOSS_CORE_MATERIAL.id]: 8,
            v2_unexplored_runaway_machines_material: 25,
            v2_unexplored_shadow_stalkers_material: 25,
          },
        }}
        onBack={vi.fn()}
      />,
    );

    openUnexploredTab("우두머리 핵 제작소");

    const button = screen.getByRole("button", {
      name: "추적날 단검 확정 제작",
    });
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(
      fetchMock.mock.calls.map((call) =>
        JSON.parse((call[1] as RequestInit).body as string)
      ),
    ).toEqual([
      {
        equipmentId: "v2_unexplored_tracking_blade_dagger",
        requestId: "equipment-retry-request",
      },
      {
        equipmentId: "v2_unexplored_tracking_blade_dagger",
        requestId: "equipment-retry-request",
      },
    ]);
  });

  it("서버가 거절한 장비 제작은 다음 시도에 새 requestId를 사용한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, error: "insufficient_boss_cores" }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            idempotent: false,
            equipmentId: "v2_unexplored_tracking_blade_dagger",
            equipmentIid: "crafted-equipment-iid",
            materials: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce("rejected-equipment-request")
      .mockReturnValueOnce("replacement-equipment-request");
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID });
    render(
      <V2UnexploredTreeView
        initialSnapshot={{
          ...SNAPSHOT,
          materials: {
            [UNEXPLORED_BOSS_CORE_MATERIAL.id]: 8,
            v2_unexplored_runaway_machines_material: 25,
            v2_unexplored_shadow_stalkers_material: 25,
          },
        }}
        onBack={vi.fn()}
      />,
    );

    openUnexploredTab("우두머리 핵 제작소");

    const button = screen.getByRole("button", {
      name: "추적날 단검 확정 제작",
    });
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(
      fetchMock.mock.calls.map((call) =>
        JSON.parse((call[1] as RequestInit).body as string).requestId
      ),
    ).toEqual([
      "rejected-equipment-request",
      "replacement-equipment-request",
    ]);
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
