// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkshopDismantlePanel } from "./WorkshopDismantlePanel";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(async () => true),
  notifyReward: vi.fn(),
}));

vi.mock("@/components/ui/gameDialog", () => ({
  confirmGameAction: mocks.confirm,
}));
vi.mock("@/adventure/v2/RewardToastProvider", () => ({
  useRewardToast: () => ({ notifyReward: mocks.notifyReward }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.confirm.mockClear();
  mocks.notifyReward.mockClear();
});

describe("해방 장비 해체 재확인", () => {
  it("서버 경고를 확인한 뒤 같은 iid에 confirmBound를 붙여 다시 요청한다", async () => {
    const candidate = {
      iid: "liberated-craft",
      itemId: "v2_boss_frozen_lake_armor",
      itemName: "빙호 갑주",
      slot: "armor",
      tier: 16,
      craftOnly: true,
      enhanceLevel: 0,
      craftQualityLevel: 1,
      masterwork: false,
      locked: false,
      bound: true,
      liberation: {
        rank: 1,
        lineCount: 2,
        revision: 8,
        options: [],
      },
      equipped: false,
      rewards: { v2_workshop_metal: 3 },
      artisanXp: 5,
      canDismantle: true,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        ok: true,
        materials: {},
        requiredBlacksmithLevel: 6,
        candidates: [candidate],
      }))
      .mockResolvedValueOnce(Response.json(
        { ok: false, error: "bound_confirmation_required", item: candidate },
        { status: 409 },
      ))
      .mockResolvedValueOnce(Response.json({
        ok: true,
        dismantled: candidate,
        materials: {},
        artisan: {},
      }))
      .mockResolvedValueOnce(Response.json({
        ok: true,
        materials: {},
        requiredBlacksmithLevel: 6,
        candidates: [],
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <WorkshopDismantlePanel materials={{}} onWorkshopSync={vi.fn()} />,
    );
    await screen.findByText("빙호 갑주");
    fireEvent.click(screen.getByRole("button", { name: "해체" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("해방 1 · 2줄"),
    }));
    expect(fetchMock.mock.calls.slice(1, 3).map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    )).toEqual([
      { iid: "liberated-craft" },
      { iid: "liberated-craft", confirmBound: true },
    ]);
  });
});
