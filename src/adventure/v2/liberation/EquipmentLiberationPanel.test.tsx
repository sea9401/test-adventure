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

describe("장비 마법부여 작업대", () => {
  it("상세 확률은 도움말로 분리하고 최초 마법부여의 영구 조건만 확인받는다", () => {
    renderPanel(initialItem);

    expect(screen.getAllByText("재앙독 완갑")).toHaveLength(1);
    expect(screen.queryByText("1줄 50%")).toBeNull();
    expect(screen.queryByText(/2·3번째 줄은 이미 선택된 옵션을 제외/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "마법부여 도움말" }));
    expect(screen.getByRole("dialog", { name: "마법부여 도움말" })).toBeTruthy();
    expect(screen.getByText("1줄 50%")).toBeTruthy();
    expect(screen.getByText("2줄 35%")).toBeTruthy();
    expect(screen.getByText("3줄 15%")).toBeTruthy();
    expect(screen.getByText(/마법부여 1단계 · Lv.1~5/)).toBeTruthy();
    expect(screen.getByText(/2·3번째 줄은 이미 선택된 옵션을 제외/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "도움말 닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "마법부여" }));
    expect(screen.getByRole("dialog", { name: "최초 마법부여 확인" })).toBeTruthy();
    expect(screen.getByText(/즉시 귀속/)).toBeTruthy();
    expect(screen.getByText(/옵션 줄 수는 영구 고정/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "15,000,000 G 지불하고 마법부여" })).toBeTruthy();
  });

  it("긴 후보 목록은 검색 가능한 장비 선택 창에서 고른다", () => {
    const armor: V2EquipInstance = {
      iid: "armor-1",
      id: "v2_boss_frozen_lake_armor",
    };
    renderPanel(initialItem, {
      owned: [initialItem, armor],
      equipped: { gloves: initialItem.iid } as Partial<Record<V2EquipSlot, string>>,
    });

    expect(screen.queryByRole("listbox", { name: "마법부여 대상 장비" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /대상 장비 변경.*2개 선택 가능/ }),
    );
    expect(screen.getByRole("dialog", { name: "마법부여 장비 선택" })).toBeTruthy();
    expect(screen.getByRole("listbox", { name: "마법부여 대상 장비" })).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "장비 이름 검색" }), {
      target: { value: "빙호" },
    });
    expect(screen.queryByRole("option", { name: /재앙독 완갑/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /빙호 갑주/ }));

    expect(screen.queryByRole("dialog", { name: "마법부여 장비 선택" })).toBeNull();
    expect(screen.getByRole("heading", { name: "빙호 갑주" })).toBeTruthy();
  });

  it("재마법부여 안내는 도움말에서 보여주고 확인창 없이 즉시 요청한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, item: rerollItem, gold: 5_000_000, bankedGold: 10_000_000 }),
    });
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel(rerollItem);

    expect(screen.getByText("마법부여 1단계 · 2줄")).toBeTruthy();
    expect(screen.queryByText(/재마법부여하면 현재 옵션 전체가 즉시 소멸/)).toBeNull();
    expect(screen.getByRole("list", { name: "현재 마법부여 옵션" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "마법부여 도움말" }));
    expect(screen.getByText(/재마법부여하면 현재 옵션 전체가 즉시 소멸/)).toBeTruthy();
    expect(
      screen.getByText(/옵션 줄 수는 유지되며, 버튼을 누르면 별도 확인 없이 바로 진행/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "도움말 닫기" }));

    fireEvent.click(screen.getByRole("button", { name: "재마법부여" }));
    expect(screen.queryByRole("dialog", { name: /재마법부여 확인/ })).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("재마법부여가 완료되었습니다.")).toBeTruthy();
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

    fireEvent.click(screen.getByRole("button", { name: "재마법부여" }));
    await screen.findByText(/연결에 실패했습니다/);

    fireEvent.click(screen.getByRole("button", { name: "재마법부여" }));
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
