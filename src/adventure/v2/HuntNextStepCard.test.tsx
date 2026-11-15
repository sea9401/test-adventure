// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GrowthGuideStep } from "@/adventure/data/v2/growthGuide";

const { notifyReward, notifySystem, refreshGameState } = vi.hoisted(() => ({
  notifyReward: vi.fn(),
  notifySystem: vi.fn(),
  refreshGameState: vi.fn(async () => {}),
}));

vi.mock("@/adventure/v2/RewardToastProvider", () => ({ useRewardToast: () => ({ notifyReward, notifySystem }) }));
vi.mock("@/adventure/v2/GameStateRefreshContext", () => ({ useOptionalRefreshGameState: () => refreshGameState }));

import { HuntNextStepCard } from "./HuntNextStepCard";

const CLAIMABLE: GrowthGuideStep = {
  id: "g_first_battle",
  title: "첫 발걸음",
  desc: "전투 > 사냥터에서 첫 전투를 치르세요.",
  href: "/battle/dungeon",
  status: "claimable",
  progress: 1,
  goal: 1,
  reward: { staminaPotions: 1, equip: "v2_chain_mail", titleId: "first_blood" },
  stepNumber: 1,
  stepCount: 11,
};
const EQUIP: GrowthGuideStep = {
  id: "g_equip",
  title: "무장하기",
  desc: "첫 전투 보상으로 받은 쇠사슬 갑옷을 캐릭터 > 인벤토리에서 장착하세요.",
  href: "/character/inventory",
  status: "active",
  progress: 0,
  goal: 1,
  reward: { staminaPotions: 1 },
  stepNumber: 2,
  stepCount: 11,
};
const LEVEL: GrowthGuideStep = {
  id: "g_level10",
  title: "성장의 감각",
  desc: "사냥터 전투를 이어가 레벨 10에 도달하세요.",
  href: "/battle/dungeon",
  status: "active",
  progress: 7,
  goal: 10,
  reward: { staminaPotions: 1 },
  stepNumber: 4,
  stepCount: 11,
};

let steps: (GrowthGuideStep | null)[] = [];
let claimResponse: { ok: boolean; error?: string } = { ok: true };
let claimBodies: unknown[] = [];

function stubFetch(queue: (GrowthGuideStep | null)[]) {
  steps = [...queue];
  claimBodies = [];
  claimResponse = { ok: true };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      claimBodies.push(JSON.parse(String(init.body)));
      return { ok: claimResponse.ok, status: claimResponse.ok ? 200 : 400, json: async () => claimResponse };
    }
    const step = steps.length > 1 ? steps.shift() : steps[0];
    return { ok: true, status: 200, json: async () => ({ ok: true, step: step ?? null }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  notifyReward.mockClear();
  notifySystem.mockClear();
  refreshGameState.mockClear();
});

describe("HuntNextStepCard", () => {
  it("직업을 고른 뒤에는 아무것도 보여 주지 않고 조회도 하지 않는다", () => {
    const fetchMock = stubFetch([CLAIMABLE]);
    const { container } = render(<HuntNextStepCard jobId="warrior" refreshKey={1} />);
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("받을 보상이 있으면 보상 내용과 받기 버튼을 보여 준다", async () => {
    stubFetch([CLAIMABLE]);
    render(<HuntNextStepCard jobId="none" refreshKey={1} />);
    expect(await screen.findByText("첫 발걸음 달성")).toBeTruthy();
    expect(screen.getByText(/쇠사슬 갑옷 · 스태미나 회복약 1개/)).toBeTruthy();
    expect(screen.getByText(/성장의 길 1 \/ 11/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "보상 받기" })).toBeTruthy();
  });

  it("보상을 받으면 바로 다음 할 일과 이동 버튼을 보여 준다", async () => {
    stubFetch([CLAIMABLE, EQUIP]);
    render(<HuntNextStepCard jobId="none" refreshKey={1} />);
    fireEvent.click(await screen.findByRole("button", { name: "보상 받기" }));
    await waitFor(() => expect(claimBodies).toEqual([{ questId: "g_first_battle" }]));
    expect(await screen.findByText("무장하기")).toBeTruthy();
    expect(screen.getByText(/쇠사슬 갑옷을 캐릭터 > 인벤토리에서 장착하세요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "인벤토리로 가기" }).getAttribute("href")).toBe("/character/inventory");
    expect(notifyReward).toHaveBeenCalledWith("보상 수령", expect.stringContaining("쇠사슬 갑옷"));
    expect(refreshGameState).toHaveBeenCalled();
  });

  it("사냥터에서 이어 가는 단계는 진행도만 보여 주고 이동 버튼은 없다", async () => {
    stubFetch([LEVEL]);
    render(<HuntNextStepCard jobId="none" refreshKey={1} />);
    expect(await screen.findByText("성장의 감각")).toBeTruthy();
    expect(screen.getByText("7 / 10")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: "보상 받기" })).toBeNull();
  });

  it("사냥 결과가 바뀌면 다시 조회한다", async () => {
    const fetchMock = stubFetch([LEVEL, { ...LEVEL, progress: 8 }]);
    const { rerender } = render(<HuntNextStepCard jobId="none" refreshKey={1} />);
    expect(await screen.findByText("7 / 10")).toBeTruthy();
    rerender(<HuntNextStepCard jobId="none" refreshKey={2} />);
    expect(await screen.findByText("8 / 10")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("남은 단계가 없으면 아무것도 보여 주지 않는다", async () => {
    const fetchMock = stubFetch([null]);
    const { container } = render(<HuntNextStepCard jobId="none" refreshKey={1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("수령에 실패하면 이유를 알리고 카드를 그대로 둔다", async () => {
    stubFetch([CLAIMABLE]);
    claimResponse = { ok: false, error: "not_complete" };
    render(<HuntNextStepCard jobId="none" refreshKey={1} />);
    fireEvent.click(await screen.findByRole("button", { name: "보상 받기" }));
    await waitFor(() => expect(notifySystem).toHaveBeenCalled());
    expect(screen.getByText("첫 발걸음 달성")).toBeTruthy();
    expect(notifyReward).not.toHaveBeenCalled();
  });
});
