// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dangerousBossMaterialId } from "@/adventure/data/v2/dangerousFishing";
import { DANGEROUS_FISHING_EXCHANGE_ENTRIES } from "./dangerousFishingExchange";
import { emptyDangerousFishingState } from "./dangerousFishingState";
import {
  DangerousFishingCatchSaleConfirmDialog,
  DangerousFishingExchangeConfirmDialog,
  DangerousFishingExchangeSection,
} from "./DangerousFishingExchangeSection";
import {
  dangerousFishingExchangeMessage,
  type DangerousFishingExchangeViewModel,
  useDangerousFishingExchange,
} from "./useDangerousFishingExchange";

const mocks = vi.hoisted(() => ({
  applyResourcePatch: vi.fn(),
}));

vi.mock("./GameStateProvider", () => ({
  useGameState: () => ({ applyResourcePatch: mocks.applyResourcePatch }),
}));

beforeEach(() => {
  mocks.applyResourcePatch.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function exchangeModel(): DangerousFishingExchangeViewModel {
  const tidalToken = dangerousBossMaterialId("tidal_colossus");
  return {
    ok: true,
    unlocked: true,
    requiredLevel: 15,
    fishingLevel: 25,
    materials: {
      danger_catch_ironjaw_tuna: 3,
      danger_catch_thunder_ray: 5,
      danger_catch_razor_sardine: 6,
      danger_catch_tempest_swordfish: 8,
      danger_catch_voidfin_coelacanth: 5,
      danger_catch_abyssal_crownfish: 3,
      [tidalToken]: 12,
    },
    fishingCoins: 50_000,
    state: {
      baitCounts: emptyDangerousFishingState().baitCounts,
      ownedGear: {
        rods: ["starter_rod", "breaker_rod"],
        reels: ["starter_reel"],
        lines: ["starter_line", "braided_line"],
      },
      gearEnhancements: {
        rods: { breaker_rod: 1 },
        reels: { starter_reel: 2 },
        lines: { starter_line: 3, braided_line: 1 },
      },
    },
    enhancementCosts: {
      1: { materials: { common: 6, rare: 4 }, fishingCoins: 1_000 },
      2: { materials: { rare: 8, epic: 5 }, fishingCoins: 3_000 },
      3: { materials: { epic: 8, legendary: 3 }, fishingCoins: 8_000 },
    },
    enhancementItems: [
      {
        gearKind: "rod",
        gearId: "starter_rod",
        level: 0,
        nextEnhancement: {
          level: 1,
          cost: { materials: { common: 6, rare: 4 }, fishingCoins: 1_000 },
          affordable: true,
        },
      },
      {
        gearKind: "rod",
        gearId: "breaker_rod",
        level: 1,
        nextEnhancement: {
          level: 2,
          cost: { materials: { rare: 8, epic: 5 }, fishingCoins: 3_000 },
          affordable: false,
        },
      },
      {
        gearKind: "reel",
        gearId: "starter_reel",
        level: 2,
        nextEnhancement: {
          level: 3,
          cost: { materials: { epic: 8, legendary: 3 }, fishingCoins: 8_000 },
          affordable: true,
        },
      },
      {
        gearKind: "line",
        gearId: "starter_line",
        level: 3,
        nextEnhancement: null,
      },
      {
        gearKind: "line",
        gearId: "braided_line",
        level: 1,
        nextEnhancement: {
          level: 2,
          cost: { materials: { rare: 8, epic: 5 }, fishingCoins: 3_000 },
          affordable: true,
        },
      },
    ],
    ownedTitleIds: [],
    ownedCosmeticIds: [],
    entries: DANGEROUS_FISHING_EXCHANGE_ENTRIES.map((entry) => ({
      ...entry,
      alreadyOwned: entry.id === "token_maelstrom_reel",
      maxBatches:
        entry.id === "catch_rare_to_blood_bait"
          ? 2
          : entry.id === "token_tidal_to_luminous_bait"
            ? 12
            : 0,
    })),
  };
}

function enhancedStarterRodModel(): DangerousFishingExchangeViewModel {
  const initial = exchangeModel();
  return {
    ...initial,
    materials: {
      danger_catch_thunder_ray: 5,
      danger_catch_tempest_swordfish: 8,
      danger_catch_voidfin_coelacanth: 5,
      danger_catch_abyssal_crownfish: 3,
      [dangerousBossMaterialId("tidal_colossus")]: 12,
    },
    fishingCoins: 49_000,
    state: {
      ...initial.state,
      gearEnhancements: {
        ...initial.state.gearEnhancements,
        rods: { ...initial.state.gearEnhancements.rods, starter_rod: 1 },
      },
    },
    enhancementItems: initial.enhancementItems.map((item) =>
      item.gearKind === "rod" && item.gearId === "starter_rod"
        ? {
            ...item,
            level: 1,
            nextEnhancement: {
              level: 2,
              cost: {
                materials: { rare: 8, epic: 5 },
                fishingCoins: 3_000,
              },
              affordable: false,
            },
          }
        : item,
    ),
  };
}

describe("위험 해역 교환 UI", () => {
  it("보유 장비마다 현재·다음 강화 효과와 정확한 비용·가능 상태·최대 단계를 표시한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingExchangeSection
        model={exchangeModel()}
        loading={false}
        error={null}
        exchanging={null}
        sellingCatch={null}
        onRefresh={vi.fn(async () => true)}
        onExchange={vi.fn(async () => ({ ok: true, message: "완료" }))}
        onEnhanceGear={vi.fn(async () => ({ ok: true, message: "강화 완료" }))}
        onSellCatch={vi.fn(async () => ({ ok: true, message: "판매 완료" }))}
      />,
    );

    expect(html).toContain("전용 장비 영구 강화");
    expect(html).toContain("해역 입문 낚싯대 +0");
    expect(html).toContain("어체력 피해 +0%");
    expect(html).toContain("어체력 피해 +6%");
    expect(html).toContain("파도 절단 낚싯대 +1");
    expect(html).toContain("희귀 어획물 8개");
    expect(html).toContain("영웅 어획물 5개");
    expect(html).toContain("3,000");
    expect(html).toContain("해역 입문 릴 +2");
    expect(html).toContain("거리 회수량 +10%");
    expect(html).toContain("거리 회수량 +15%");
    expect(html).toContain("영웅 어획물 8개");
    expect(html).toContain("전설 어획물 3개");
    expect(html).toContain("8,000");
    expect(html).toContain("삼중 합사줄 +1");
    expect(html).toContain("안전 구간 폭 +3%p");
    expect(html).toContain("화물 보호 +2%p");
    expect(html).toContain("안전 구간 폭 +6%p");
    expect(html).toContain("화물 보호 +4%p");
    expect(html).toContain("해역 입문 낚싯줄 +3");
    expect(html).toContain("최대 강화 완료");
    expect(html).toContain("재료 또는 코인 부족");
    expect(html).not.toMatch(/bg-[^" ]+\/(40|70)/);
  });

  it("강화 확인은 확정 때만 UUID를 만들고 실패 재시도에는 재사용하며 취소 뒤 새 의도에는 새 ID를 쓴다", async () => {
    const ids = [
      "11aa10ea-1980-4e96-8857-91f3f77836ea",
      "22bb20ea-1980-4e96-8857-91f3f77836eb",
    ];
    const uuid = vi.spyOn(globalThis.crypto, "randomUUID");
    uuid.mockImplementation(() => ids.shift() as `${string}-${string}-${string}-${string}-${string}`);
    const onEnhanceGear = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "네트워크 오류" })
      .mockResolvedValueOnce({ ok: true, message: "이미 처리된 강화를 확인했다.", alreadyProcessed: true })
      .mockResolvedValueOnce({ ok: true, message: "강화 완료" });

    render(
      <DangerousFishingExchangeSection
        model={exchangeModel()}
        loading={false}
        error={null}
        exchanging={null}
        sellingCatch={null}
        onRefresh={vi.fn(async () => true)}
        onExchange={vi.fn(async () => ({ ok: true, message: "완료" }))}
        onEnhanceGear={onEnhanceGear}
      />,
    );

    const open = screen.getByRole("button", { name: "해역 입문 낚싯대 +1 강화" });
    expect((open as HTMLButtonElement).disabled).toBe(false);
    expect(
      (screen.getByRole("button", { name: "파도 절단 낚싯대 +2 강화" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(open);
    expect(uuid).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "해역 입문 낚싯대 강화 확인" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(dialog.textContent).toContain("+0 → +1");
    expect(dialog.textContent).toContain("영구 적용");
    expect(dialog.textContent).toContain("100% 성공");
    expect(dialog.textContent).toContain("파괴·하락·초기화 없음");
    expect(dialog.textContent).toContain("일반 어획물 6개");
    expect(dialog.textContent).toContain("희귀 어획물 4개");
    expect(dialog.textContent).toContain("낚시 코인 1,000");

    fireEvent.click(screen.getByRole("button", { name: "+1 강화 확정" }));
    await waitFor(() => expect(onEnhanceGear).toHaveBeenCalledOnce());
    expect(onEnhanceGear.mock.calls[0][0]).toEqual({
      operationId: "11aa10ea-1980-4e96-8857-91f3f77836ea",
      gearKind: "rod",
      gearId: "starter_rod",
      expectedCurrentLevel: 0,
      expectedNextLevel: 1,
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+1 강화 다시 시도" }));
    await waitFor(() => expect(onEnhanceGear).toHaveBeenCalledTimes(2));
    expect(onEnhanceGear.mock.calls[1][0].operationId).toBe(
      "11aa10ea-1980-4e96-8857-91f3f77836ea",
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    open.focus();
    fireEvent.click(open);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(open);
    fireEvent.click(screen.getByRole("button", { name: "삼중 합사줄 +2 강화" }));
    fireEvent.click(screen.getByRole("button", { name: "+2 강화 확정" }));
    await waitFor(() => expect(onEnhanceGear).toHaveBeenCalledTimes(3));
    expect(onEnhanceGear.mock.calls[2][0]).toEqual({
      operationId: "22bb20ea-1980-4e96-8857-91f3f77836eb",
      gearKind: "line",
      gearId: "braided_line",
      expectedCurrentLevel: 1,
      expectedNextLevel: 2,
    });
    expect(uuid).toHaveBeenCalledTimes(2);
  });

  it("강화 확정 더블 클릭은 한 요청만 보낸다", async () => {
    let finish!: (value: { ok: boolean; message: string }) => void;
    const onEnhanceGear = vi.fn(
      () => new Promise<{ ok: boolean; message: string }>((resolve) => { finish = resolve; }),
    );
    render(
      <DangerousFishingExchangeSection
        model={exchangeModel()}
        loading={false}
        error={null}
        exchanging={null}
        onRefresh={vi.fn(async () => true)}
        onExchange={vi.fn(async () => ({ ok: true, message: "완료" }))}
        onEnhanceGear={onEnhanceGear}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "해역 입문 낚싯대 +1 강화" }));
    const confirm = screen.getByRole("button", { name: "+1 강화 확정" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onEnhanceGear).toHaveBeenCalledOnce();
    await act(async () => finish({ ok: true, message: "완료" }));
  });
  it("어획물·장비·수집·반복 교환을 불투명 표면과 상태로 표시한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingExchangeSection
        model={exchangeModel()}
        loading={false}
        error={null}
        exchanging={null}
        sellingCatch={null}
        onRefresh={vi.fn(async () => true)}
        onExchange={vi.fn(async () => ({ ok: true, message: "완료" }))}
        onSellCatch={vi.fn(async () => ({ ok: true, message: "판매 완료" }))}
      />,
    );
    expect(html).toContain("위험 해역 교환");
    expect(html).toContain("어획물 납품");
    expect(html).toContain("증표 장비 교환");
    expect(html).toContain("수집 보상");
    expect(html).toContain("반복 미끼 교환");
    expect(html).toContain("어획물 NPC 판매");
    expect(html).toContain("교환 가능 2회");
    expect(html).toContain("최대 2회 교환");
    expect(html).toContain("보유 중");
    expect(html).toContain("bg-white");
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toMatch(/bg-[^" ]+\/(40|70)/);
  });

  it("판매 확인창에 어종·보유/잔량·단가·총액·은행 입금을 표시한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingCatchSaleConfirmDialog
        pending={{
          materialId: "danger_catch_ironjaw_tuna",
          name: "철턱 참치",
          amount: 2,
          owned: 3,
          unitPrice: 2_100,
        }}
        selling={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("철턱 참치");
    expect(html).toContain("보유 3개");
    expect(html).toContain("판매 후 1개");
    expect(html).toContain("개당 2,100 G");
    expect(html).toContain("4,200 G");
    expect(html).toContain("은행에 입금");
  });

  it("보유한 일반 어획물만 판매 목록에 두고 양의 보유 이내 정수만 확인한다", () => {
    const onSellCatch = vi.fn(async () => ({ ok: true, message: "판매 완료" }));
    render(
      <DangerousFishingExchangeSection
        model={exchangeModel()}
        loading={false}
        error={null}
        exchanging={null}
        sellingCatch={null}
        onRefresh={vi.fn(async () => true)}
        onExchange={vi.fn(async () => ({ ok: true, message: "완료" }))}
        onSellCatch={onSellCatch}
      />,
    );

    expect(screen.getByRole("button", { name: "철턱 참치 NPC 판매" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "뇌광 가오리 NPC 판매" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /해일의 거신.*NPC 판매/ })).toBeNull();

    const input = screen.getByRole("spinbutton", { name: "철턱 참치 판매 수량" });
    const openButton = screen.getByRole("button", { name: "철턱 참치 NPC 판매" });
    for (const invalid of ["0", "2.5", "4"]) {
      fireEvent.change(input, { target: { value: invalid } });
      expect((openButton as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.change(input, { target: { value: "2" } });
    expect((openButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(openButton);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("판매 후 1개")).toBeTruthy();
    expect(onSellCatch).not.toHaveBeenCalled();
  });

  it("판매 확인을 취소하거나 Escape로 닫고 모달 안으로 포커스를 옮긴다", async () => {
    const onSellCatch = vi.fn(async () => ({ ok: true, message: "판매 완료" }));
    render(
      <DangerousFishingExchangeSection
        model={exchangeModel()}
        loading={false}
        error={null}
        exchanging={null}
        sellingCatch={null}
        onRefresh={vi.fn(async () => true)}
        onExchange={vi.fn(async () => ({ ok: true, message: "완료" }))}
        onSellCatch={onSellCatch}
      />,
    );

    const open = screen.getByRole("button", { name: "철턱 참치 NPC 판매" });
    fireEvent.click(open);
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSellCatch).not.toHaveBeenCalled();

    fireEvent.click(open);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSellCatch).not.toHaveBeenCalled();
  });

  it("확정한 부분 판매를 한 번만 전달하고 성공하면 확인창을 닫는다", async () => {
    const onSellCatch = vi.fn(async () => ({
      ok: true,
      message: "철턱 참치 2개 판매 완료",
      sold: { id: "danger_catch_ironjaw_tuna", count: 2, gold: 4_200 },
    }));
    render(
      <DangerousFishingExchangeSection
        model={exchangeModel()}
        loading={false}
        error={null}
        exchanging={null}
        sellingCatch={null}
        onRefresh={vi.fn(async () => true)}
        onExchange={vi.fn(async () => ({ ok: true, message: "완료" }))}
        onSellCatch={onSellCatch}
      />,
    );

    fireEvent.change(
      screen.getByRole("spinbutton", { name: "철턱 참치 판매 수량" }),
      { target: { value: "2" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "철턱 참치 NPC 판매" }));
    fireEvent.click(screen.getByRole("button", { name: "2개 판매 확정" }));

    await waitFor(() => expect(onSellCatch).toHaveBeenCalledOnce());
    expect(onSellCatch).toHaveBeenCalledWith("danger_catch_ironjaw_tuna", 2);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("확인창에 혼합 납품의 어종별 소모와 교환 후 잔량을 표시한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingExchangeConfirmDialog
        pending={{
          operationId: "4fd3980e-0d2f-4f0d-8214-0b7e51bd52f4",
          entryId: "catch_rare_to_blood_bait",
          entryName: "희귀 어획물 납품",
          batches: 2,
          selectedMaterials: {
            danger_catch_thunder_ray: 5,
            danger_catch_ironjaw_tuna: 3,
          },
          costMaterials: {
            danger_catch_thunder_ray: 5,
            danger_catch_ironjaw_tuna: 3,
          },
          materialBalances: {
            danger_catch_thunder_ray: 5,
            danger_catch_ironjaw_tuna: 3,
          },
          coinCost: 0,
          fishingCoins: 50_000,
          outputLabel: "핏빛 미끼 10개",
        }}
        exchanging={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("희귀 어획물 납품 2회");
    expect(html).toContain("뇌광 가오리 5개");
    expect(html).toContain("교환 후 0개");
    expect(html).toContain("철턱 참치 3개");
    expect(html).toContain("핏빛 미끼 10개");
  });

  it("교환 오류를 다음 행동이 드러나는 문장으로 바꾼다", () => {
    expect(dangerousFishingExchangeMessage(false, "insufficient_materials")).toContain("재료");
    expect(dangerousFishingExchangeMessage(false, "insufficient_coins")).toContain("코인");
    expect(dangerousFishingExchangeMessage(false, "already_owned")).toContain("보유");
    expect(dangerousFishingExchangeMessage(true, undefined, true)).toContain("이미 처리");
  });

  it("수락된 판매 응답을 먼저 반영하고 후속 교환 새로고침 실패를 재판매 실패로 바꾸지 않는다", async () => {
    const initial = exchangeModel();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(initial))
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          gold: 100,
          bankedGold: 4_400,
          materials: {
            ...initial.materials,
            danger_catch_ironjaw_tuna: 1,
            unrelated_material: 7,
          },
          sold: {
            id: "danger_catch_ironjaw_tuna",
            count: 2,
            gold: 4_200,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ ok: false, error: "temporary" }, { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const hook = renderHook(() => useDangerousFishingExchange());
    await waitFor(() => expect(hook.result.current.model).not.toBeNull());

    let result: Awaited<ReturnType<typeof hook.result.current.sellCatch>> | undefined;
    await act(async () => {
      result = await hook.result.current.sellCatch(
        "danger_catch_ironjaw_tuna",
        2,
      );
    });

    expect(result).toMatchObject({
      ok: true,
      refreshFailed: true,
      gold: 100,
      bankedGold: 4_400,
      sold: { count: 2, gold: 4_200 },
    });
    expect(hook.result.current.model?.materials.danger_catch_ironjaw_tuna).toBe(1);
    expect(hook.result.current.model?.materials.unrelated_material).toBe(7);
    expect(hook.result.current.error).toBeNull();
    expect(mocks.applyResourcePatch).toHaveBeenCalledWith({
      gold: 100,
      bankedGold: 4_400,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v2/shop/material/sell",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          id: "danger_catch_ironjaw_tuna",
          amount: 2,
        }),
      }),
    );
  });

  it("동시 판매 호출과 오래된 잔액 오류에서 POST를 반복하지 않는다", async () => {
    const initial = exchangeModel();
    let releasePost!: (response: Response) => void;
    const pendingPost = new Promise<Response>((resolve) => {
      releasePost = resolve;
    });
    let getCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return pendingPost;
      getCount += 1;
      return Response.json(
        getCount === 1
          ? initial
          : {
              ...initial,
              materials: {
                danger_catch_thunder_ray: 5,
                [dangerousBossMaterialId("tidal_colossus")]: 12,
              },
            },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const hook = renderHook(() => useDangerousFishingExchange());
    await waitFor(() => expect(hook.result.current.model).not.toBeNull());

    let first!: ReturnType<typeof hook.result.current.sellCatch>;
    let second!: Awaited<ReturnType<typeof hook.result.current.sellCatch>>;
    act(() => {
      first = hook.result.current.sellCatch("danger_catch_ironjaw_tuna", 1);
    });
    await act(async () => {
      second = await hook.result.current.sellCatch("danger_catch_ironjaw_tuna", 1);
    });
    expect(second).toMatchObject({ ok: false });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);

    releasePost(
      Response.json(
        { ok: false, error: "not_owned" },
        { status: 400 },
      ),
    );
    let firstResult!: Awaited<typeof first>;
    await act(async () => {
      firstResult = await first;
    });
    expect(firstResult).toMatchObject({ ok: false });
    expect(hook.result.current.model?.materials.danger_catch_ironjaw_tuna).toBeUndefined();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  });

  it("강화 훅은 Task2 action을 보내고 응답의 장비·재료·코인 view를 권위값으로 교체한다", async () => {
    const initial = exchangeModel();
    const updated = enhancedStarterRodModel();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(initial))
      .mockResolvedValueOnce(
        Response.json({
          ...updated,
          alreadyProcessed: true,
          operationId: "be9ed32e-4541-4de3-874a-f5cc7a3d1571",
          gearKind: "rod",
          gearId: "starter_rod",
          nextLevel: 1,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const hook = renderHook(() => useDangerousFishingExchange());
    await waitFor(() => expect(hook.result.current.model).not.toBeNull());

    let result!: Awaited<ReturnType<typeof hook.result.current.enhanceGear>>;
    await act(async () => {
      result = await hook.result.current.enhanceGear({
        operationId: "be9ed32e-4541-4de3-874a-f5cc7a3d1571",
        gearKind: "rod",
        gearId: "starter_rod",
        expectedCurrentLevel: 0,
        expectedNextLevel: 1,
      });
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v2/dangerous-fishing/exchange",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "enhance",
          operationId: "be9ed32e-4541-4de3-874a-f5cc7a3d1571",
          gearKind: "rod",
          gearId: "starter_rod",
          expectedCurrentLevel: 0,
          expectedNextLevel: 1,
        }),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      alreadyProcessed: true,
      fishingCoins: 49_000,
      nextLevel: 1,
    });
    expect(result.message).toContain("이미 처리");
    expect(hook.result.current.model).toMatchObject({
      fishingCoins: 49_000,
      state: { gearEnhancements: { rods: { starter_rod: 1 } } },
    });
    expect(hook.result.current.model?.materials.danger_catch_razor_sardine).toBeUndefined();
    expect(hook.result.current.model?.materials.danger_catch_ironjaw_tuna).toBeUndefined();
  });

  it("강화 프로토콜 응답이 불완전하면 기존 view를 보존하고 같은 확인에서 재시도할 수 있게 실패한다", async () => {
    const initial = exchangeModel();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(initial))
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          operationId: "6a4d5642-1861-45d1-a8ff-d2ea34d90c0b",
          gearKind: "rod",
          gearId: "starter_rod",
          nextLevel: 1,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const hook = renderHook(() => useDangerousFishingExchange());
    await waitFor(() => expect(hook.result.current.model).not.toBeNull());

    let result!: Awaited<ReturnType<typeof hook.result.current.enhanceGear>>;
    await act(async () => {
      result = await hook.result.current.enhanceGear({
        operationId: "6a4d5642-1861-45d1-a8ff-d2ea34d90c0b",
        gearKind: "rod",
        gearId: "starter_rod",
        expectedCurrentLevel: 0,
        expectedNextLevel: 1,
      });
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.message).toContain("같은 확인창");
    expect(hook.result.current.model).toEqual(initial);
  });

  it.each([
    ["단계 비용의 materials 누락", (view: Record<string, unknown>) => {
      const costs = view.enhancementCosts as Record<string, Record<string, unknown>>;
      delete costs[2].materials;
    }],
    ["카탈로그와 다른 entries", (view: Record<string, unknown>) => {
      const entries = view.entries as Array<Record<string, unknown>>;
      (entries[0].cost as Record<string, unknown>).count = 999;
    }],
    ["누락된 강화 state 버킷", (view: Record<string, unknown>) => {
      const state = view.state as Record<string, Record<string, unknown>>;
      delete state.gearEnhancements.lines;
    }],
    ["음수 재료 잔액", (view: Record<string, unknown>) => {
      const materials = view.materials as Record<string, unknown>;
      materials.danger_catch_thunder_ray = -1;
    }],
    ["결과와 target view의 단계 불일치", (view: Record<string, unknown>) => {
      const state = view.state as Record<string, Record<string, Record<string, unknown>>>;
      state.gearEnhancements.rods.starter_rod = 0;
      const items = view.enhancementItems as Array<Record<string, unknown>>;
      items[0].level = 0;
      items[0].nextEnhancement = {
        level: 1,
        cost: (view.enhancementCosts as Record<string, unknown>)[1],
        affordable: true,
      };
    }],
  ])("강화 성공의 %s 응답은 기존 view를 보존하고 재시도 가능한 실패로 처리한다", async (_label, mutate) => {
    const initial = exchangeModel();
    const responseView = structuredClone(enhancedStarterRodModel()) as unknown as Record<string, unknown>;
    mutate(responseView);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(initial))
      .mockResolvedValueOnce(Response.json({
        ...responseView,
        operationId: "d01db57a-4c88-4dfc-8362-8b7eef79a589",
        gearKind: "rod",
        gearId: "starter_rod",
        nextLevel: 1,
      }));
    vi.stubGlobal("fetch", fetchMock);
    const hook = renderHook(() => useDangerousFishingExchange());
    await waitFor(() => expect(hook.result.current.model).not.toBeNull());

    let result!: Awaited<ReturnType<typeof hook.result.current.enhanceGear>>;
    await act(async () => {
      result = await hook.result.current.enhanceGear({
        operationId: "d01db57a-4c88-4dfc-8362-8b7eef79a589",
        gearKind: "rod",
        gearId: "starter_rod",
        expectedCurrentLevel: 0,
        expectedNextLevel: 1,
      });
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.message).toContain("같은 확인창");
    expect(hook.result.current.model).toEqual(initial);
  });

  it("표시 view가 오래돼 강화가 거부되면 POST를 반복하지 않고 권위 GET을 한 번 반영한다", async () => {
    const initial = exchangeModel();
    const refreshed = {
      ...initial,
      fishingCoins: 700,
      materials: { [dangerousBossMaterialId("tidal_colossus")]: 12 },
      enhancementItems: initial.enhancementItems.map((item) =>
        item.gearKind === "rod" && item.gearId === "starter_rod"
          ? {
              ...item,
              nextEnhancement: item.nextEnhancement
                ? { ...item.nextEnhancement, affordable: false }
                : null,
            }
          : item,
      ),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(initial))
      .mockResolvedValueOnce(
        Response.json(
          { ok: false, error: "insufficient_materials", materials: {} },
          { status: 402 },
        ),
      )
      .mockResolvedValueOnce(Response.json(refreshed));
    vi.stubGlobal("fetch", fetchMock);
    const hook = renderHook(() => useDangerousFishingExchange());
    await waitFor(() => expect(hook.result.current.model).not.toBeNull());

    let result!: Awaited<ReturnType<typeof hook.result.current.enhanceGear>>;
    await act(async () => {
      result = await hook.result.current.enhanceGear({
        operationId: "164637fe-fe6a-484a-b3e0-3d5c01f3c090",
        gearKind: "rod",
        gearId: "starter_rod",
        expectedCurrentLevel: 0,
        expectedNextLevel: 1,
      });
    });

    expect(result).toMatchObject({ ok: false });
    expect(hook.result.current.model).toMatchObject({
      fishingCoins: 700,
      materials: {},
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("다른 클라이언트가 먼저 강화한 stale 응답은 POST를 반복하지 않고 포함된 권위 view를 반영한다", async () => {
    const initial = exchangeModel();
    const authoritative = enhancedStarterRodModel();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(initial))
      .mockResolvedValueOnce(Response.json(
        { ...authoritative, ok: false, error: "stale_enhancement" },
        { status: 409 },
      ));
    vi.stubGlobal("fetch", fetchMock);
    const hook = renderHook(() => useDangerousFishingExchange());
    await waitFor(() => expect(hook.result.current.model).not.toBeNull());

    let result!: Awaited<ReturnType<typeof hook.result.current.enhanceGear>>;
    await act(async () => {
      result = await hook.result.current.enhanceGear({
        operationId: "2c2a01e6-e67c-4daf-8b25-31af426f0b79",
        gearKind: "rod",
        gearId: "starter_rod",
        expectedCurrentLevel: 0,
        expectedNextLevel: 1,
      });
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.message).toContain("최신 상태");
    expect(hook.result.current.model).toEqual(authoritative);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
