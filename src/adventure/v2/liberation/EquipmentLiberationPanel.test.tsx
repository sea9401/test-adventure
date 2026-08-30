// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { V2EquipInstance, V2EquipSlot } from "@/adventure/data/v2/v2Equipment";
import { EquipmentLiberationPanel } from "./EquipmentLiberationPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const initialItem: V2EquipInstance = {
  iid: "gloves-1",
  id: "v2_boss_catastrophe_gloves",
};
const rerollItem: V2EquipInstance = {
  ...initialItem,
  bound: true,
  liberation: {
    rank: 3,
    lineCount: 2,
    revision: 3,
    options: [
      { id: "base_str_pct", level: 4 },
      { id: "skill_crit_damage_pp", level: 5 },
    ],
  },
};

function renderPanel(
  item: V2EquipInstance,
  overrides: Partial<React.ComponentProps<typeof EquipmentLiberationPanel>> = {},
) {
  return render(
    <EquipmentLiberationPanel
      owned={[item]}
      equipped={{ gloves: item.iid } as Partial<Record<V2EquipSlot, string>>}
      gold={20_000_000}
      bankedGold={10_000_000}
      initialItemIid={item.iid}
      onItemUpdated={() => undefined}
      onWalletUpdated={() => undefined}
      {...overrides}
    />,
  );
}

describe("장비 해방 작업대", () => {
  it("최초 해방의 귀속·영구 줄 수와 50/35/15 확률을 보여준다", () => {
    renderPanel(initialItem);

    expect(screen.getAllByText("재앙독 완갑")).toHaveLength(2);
    expect(screen.getByText(/성공 즉시 귀속/)).toBeTruthy();
    expect(screen.getByText(/줄 수는 영구 고정/)).toBeTruthy();
    expect(screen.getByText("1줄 50%")).toBeTruthy();
    expect(screen.getByText("2줄 35%")).toBeTruthy();
    expect(screen.getByText("3줄 15%")).toBeTruthy();
    expect(screen.getByText(/2·3번째 줄은 이미 선택된 옵션을 제외/)).toBeTruthy();
  });

  it("재해방 전에 기존 옵션 소멸·승급률·단계별 레벨 분포를 확인받는다", () => {
    renderPanel(rerollItem);

    expect(screen.getByText("해방 3 · 2줄")).toBeTruthy();
    expect(screen.getByText(/현재 옵션 전체가 즉시 소멸/)).toBeTruthy();
    expect(screen.getByText(/해방 2 승급 5%/)).toBeTruthy();
    expect(screen.getByText(/해방 1 · Lv.10~20/)).toBeTruthy();
    expect(screen.getByText(/Lv.1 24% · Lv.2 22%/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "재해방" }));
    expect(screen.getByRole("dialog", { name: "재해방 확인" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "15,000,000 G 지불하고 재해방" })).toBeTruthy();
  });

  it("네트워크 재시도만 같은 요청 ID를 쓰고 stale 장비는 즉시 갱신한다", async () => {
    const updated = vi.fn();
    const randomUUID = vi.fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    vi.stubGlobal("crypto", { randomUUID });
    const staleItem = {
      ...rerollItem,
      liberation: { ...rerollItem.liberation!, revision: 4 },
    };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ ok: false, error: "stale_state", item: staleItem }),
      });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel(rerollItem, { onItemUpdated: updated });

    fireEvent.click(screen.getByRole("button", { name: "재해방" }));
    fireEvent.click(screen.getByRole("button", { name: "15,000,000 G 지불하고 재해방" }));
    await screen.findByText(/연결에 실패했습니다/);

    fireEvent.click(screen.getByRole("button", { name: "재해방" }));
    fireEvent.click(screen.getByRole("button", { name: "15,000,000 G 지불하고 재해방" }));
    await waitFor(() => expect(updated).toHaveBeenCalledWith(staleItem));

    const requestIds = fetchMock.mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)).requestId,
    );
    expect(requestIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
    ]);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });
});
