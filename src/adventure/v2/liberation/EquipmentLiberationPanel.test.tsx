// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  it("대상 장비와 현재 옵션은 중립 다크 표면에 포인트 테두리를 유지한다", () => {
    renderPanel(rerollItem);

    const target = screen.getByRole("button", { name: /대상 장비 변경/ });
    expect(target.className).toContain("dark:bg-zinc-800");
    expect(target.className).toContain("dark:border-violet-800");

    const optionList = screen.getByRole("list", {
      name: "현재 마법부여 옵션",
    });
    const currentOptions = optionList.parentElement;
    expect(currentOptions?.className).toContain("dark:bg-zinc-800");
    expect(optionList.innerHTML).toContain("dark:border-violet-900");
    expect(optionList.innerHTML).toContain("dark:text-violet-100");
  });

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
    expect(screen.getByText(/옵션 줄 수는 재마법부여로 바꿀 수 없습니다/)).toBeTruthy();
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

  it("같은 이름의 장비를 바꾸면 현재 선택 장비 요약도 해당 개체 정보로 갱신한다", () => {
    const equippedGloves: V2EquipInstance = {
      iid: "gloves-equipped",
      id: "v2_boss_catastrophe_gloves",
      roll: {
        power: 68,
        weight: 0,
        options: { hp: 165, crit: 10, spd: 8, accuracy: 10 },
      },
    };
    const spareGloves: V2EquipInstance = {
      iid: "gloves-spare",
      id: "v2_boss_catastrophe_gloves",
      locked: true,
      roll: {
        power: 82,
        weight: 0,
        options: { hp: 195, crit: 15, spd: 11, accuracy: 13 },
      },
    };
    renderPanel(equippedGloves, {
      owned: [equippedGloves, spareGloves],
      equipped: { gloves: equippedGloves.iid },
    });

    let summary = screen.getByRole("region", { name: "현재 선택 장비" });
    expect(within(summary).getByRole("heading", { name: "재앙독 완갑" })).toBeTruthy();
    expect(within(summary).getByText("위력 68")).toBeTruthy();
    expect(within(summary).getByText(/품질/)).toBeTruthy();
    expect(within(summary).getByText("장착 중")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /대상 장비 변경.*2개 선택 가능/ }),
    );
    fireEvent.click(
      screen.getAllByRole("option", { name: /재앙독 완갑/ })[1],
    );

    summary = screen.getByRole("region", { name: "현재 선택 장비" });
    expect(within(summary).getByRole("heading", { name: "재앙독 완갑" })).toBeTruthy();
    expect(within(summary).getByText("위력 82")).toBeTruthy();
    expect(within(summary).getByText("잠금됨")).toBeTruthy();
    expect(within(summary).queryByText("장착 중")).toBeNull();
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

  it("재마법부여 요청 중 직전 결과 영역을 유지한다", async () => {
    let resolveSecondRequest!: (response: {
      ok: boolean;
      status: number;
      json: () => Promise<{
        ok: boolean;
        item: V2EquipInstance;
        gold: number;
        bankedGold: number;
      }>;
    }) => void;
    const secondRequest = new Promise<Parameters<typeof resolveSecondRequest>[0]>(
      (resolve) => {
        resolveSecondRequest = resolve;
      },
    );
    const successResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        item: rerollItem,
        gold: 5_000_000,
        bankedGold: 10_000_000,
      }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(successResponse)
      .mockReturnValueOnce(secondRequest);
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel(rerollItem);

    fireEvent.click(screen.getByRole("button", { name: "재마법부여" }));
    expect(await screen.findByText("재마법부여가 완료되었습니다.")).toBeTruthy();
    expect(
      screen.getByText("마법부여 1단계 결과가 반영되었습니다."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "재마법부여" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(screen.getByText("재마법부여가 완료되었습니다.")).toBeTruthy();
    expect(
      screen.getByText("마법부여 1단계 결과가 반영되었습니다."),
    ).toBeTruthy();

    resolveSecondRequest(successResponse);
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "재마법부여" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
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

  it("마법부여서가 있으면 골드 대신 마법부여서 1장으로 재마법부여한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        item: { ...rerollItem, liberation: { ...rerollItem.liberation!, revision: 4 } },
        gold: 0,
        bankedGold: 0,
        cashItems: { enchant_scroll: 1 },
      }),
    });
    const onEnchantScrollsUpdated = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel(rerollItem, {
      gold: 0,
      bankedGold: 0,
      enchantScrolls: 2,
      onEnchantScrollsUpdated,
    });

    expect(screen.getByText("마법부여서 2장 보유")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "골드로 재마법부여" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "마법부여서로 재마법부여" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      iid: "gloves-1",
      payment: "enchant_scroll",
    });
    expect(await screen.findByText("재마법부여가 완료되었습니다.")).toBeTruthy();
    expect(onEnchantScrollsUpdated).toHaveBeenCalledWith(1);
  });

  it("최초 마법부여도 마법부여서로 확인받고 진행할 수 있다", () => {
    renderPanel(initialItem, { enchantScrolls: 1 });

    fireEvent.click(screen.getByRole("button", { name: "마법부여서로 마법부여" }));
    const dialog = screen.getByRole("dialog", { name: "최초 마법부여 확인" });
    expect(within(dialog).getByRole("button", { name: "마법부여서 1장 쓰고 마법부여" })).toBeTruthy();
  });

  describe("세공 보석으로 줄 고정", () => {
    const threeLine: V2EquipInstance = {
      ...initialItem,
      bound: true,
      liberation: {
        rank: 2,
        lineCount: 3,
        revision: 9,
        options: [
          { id: "base_str_pct", level: 8 },
          { id: "skill_crit_damage_pp", level: 6 },
          { id: "base_dex_pct", level: 7 },
        ],
      },
    };

    it("2줄 이상인 장비는 남길 줄을 고르고 줄 수보다 하나 적게까지만 고를 수 있다", () => {
      renderPanel(threeLine, { cutGems: { v2_cut_gem_polished: 9, v2_cut_gem_refined: 2 } });
      const toggles = screen.getAllByRole("button", { name: /줄 고정/ });
      expect(toggles).toHaveLength(3);
      // 2단계 장비라 다듬은 보석은 쓸 수 없다.
      expect(screen.getByText("이 장비에 쓸 수 있는 세공 보석 2개")).toBeTruthy();

      fireEvent.click(toggles[0]);
      fireEvent.click(toggles[2]);
      expect(toggles[0].getAttribute("aria-pressed")).toBe("true");
      expect(toggles[2].getAttribute("aria-pressed")).toBe("true");
      // 세 줄을 모두 고정할 수는 없다.
      expect((toggles[1] as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText("2줄 고정: 세공 보석 2개, 골드 10,000,000 G 추가")).toBeTruthy();
      expect(screen.getByText(/비용/).textContent).toContain("25,000,000 G");
    });

    it("1줄 장비와 처음 마법부여하는 장비에는 줄 고정이 없다", () => {
      const oneLine: V2EquipInstance = {
        ...initialItem,
        bound: true,
        liberation: { rank: 3, lineCount: 1, revision: 2, options: [{ id: "base_str_pct", level: 4 }] },
      };
      const { unmount } = renderPanel(oneLine, { cutGems: { v2_cut_gem_polished: 9 } });
      expect(screen.queryByRole("button", { name: /줄 고정/ })).toBeNull();
      unmount();
      renderPanel(initialItem, { cutGems: { v2_cut_gem_polished: 9 } });
      expect(screen.queryByRole("button", { name: /줄 고정/ })).toBeNull();
    });

    it("고정한 줄을 요청에 싣고 남은 보석을 위로 알린다", async () => {
      const onCutGemsUpdated = vi.fn();
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            ok: true,
            item: {
              ...threeLine,
              liberation: { ...threeLine.liberation, revision: 10 },
            },
            gold: 0,
            bankedGold: 10_000_000,
            spentCutGems: { v2_cut_gem_refined: 1 },
            cutGems: { v2_cut_gem_refined: 1 },
            echoedLockedLines: body.lockedLines,
          }),
          { status: 200 },
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      renderPanel(threeLine, { cutGems: { v2_cut_gem_refined: 2 }, onCutGemsUpdated });

      fireEvent.click(screen.getAllByRole("button", { name: /줄 고정/ })[1]);
      fireEvent.click(screen.getByRole("button", { name: "재마법부여" }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(sent.lockedLines).toEqual([1]);
      await waitFor(() => expect(onCutGemsUpdated).toHaveBeenCalledWith({ v2_cut_gem_refined: 1 }));
    });

    it("쓸 수 있는 보석이나 골드가 모자라면 재마법부여를 막고 이유를 알린다", () => {
      const { unmount } = renderPanel(threeLine, { cutGems: { v2_cut_gem_polished: 9 } });
      fireEvent.click(screen.getAllByRole("button", { name: /줄 고정/ })[0]);
      expect(screen.getByText("이 장비에 쓸 수 있는 세공 보석이 모자랍니다.")).toBeTruthy();
      expect((screen.getByRole("button", { name: "재마법부여" }) as HTMLButtonElement).disabled).toBe(true);
      unmount();

      // 기본 비용은 낼 수 있지만 줄 고정 추가분까지는 모자란다.
      renderPanel(threeLine, { cutGems: { v2_cut_gem_refined: 2 }, gold: 16_000_000, bankedGold: 0 });
      expect((screen.getByRole("button", { name: "재마법부여" }) as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(screen.getAllByRole("button", { name: /줄 고정/ })[0]);
      expect((screen.getByRole("button", { name: "재마법부여" }) as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
