// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import type { EquipmentCompareSelection } from "./inventory/EquipmentTab";
import type { V2MultiCompareCandidate } from "./item-card/V2ItemMultiCompareCard";
import { V2InventoryView } from "./V2InventoryView";

// 여러 장비 비교(건의 #792) — 인벤토리 화면이 선택 상태와 비교 창을 잇는지 본다.
//   장비 탭과 비교 창은 각자 테스트가 있으므로 여기서는 받은 props 만 확인한다.

const mocks = vi.hoisted(() => ({
  compare: null as EquipmentCompareSelection | null,
  saleStart: null as (() => void) | null,
  card: null as {
    equipped?: { item: { name: string } };
    candidates: V2MultiCompareCandidate[];
    onClose: () => void;
  } | null,
  equipBody: null as unknown,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=weapon"),
}));

vi.mock("@/adventure/v2/GameStateProvider", () => ({
  useEquipmentCodexContext: () => null,
  useGameState: () => ({
    frontierDepth: 99,
    refreshGameState: vi.fn(async () => {}),
    setGold: vi.fn(),
  }),
}));

vi.mock("./RewardToastProvider", () => ({
  useSystemToast: () => ({ notifySystem: vi.fn() }),
}));

vi.mock("./inventory/EquipmentTab", () => ({
  EquipmentTab: ({
    compare,
    selection,
  }: {
    compare: EquipmentCompareSelection;
    selection: { onStart: () => void };
  }) => {
    mocks.compare = compare;
    mocks.saleStart = selection.onStart;
    return <div>장비 탭</div>;
  },
}));

vi.mock("./item-card/V2ItemMultiCompareCard", () => ({
  V2ItemMultiCompareCard: (props: NonNullable<typeof mocks.card>) => {
    mocks.card = props;
    return <div role="dialog">비교 창</div>;
  },
}));

const owned: V2EquipInstance[] = [
  { iid: "equipped", id: "v2_iron_sword" },
  { iid: "a", id: "v2_greatsword", locked: true },
  { iid: "b", id: "v2_horn_bow" },
];

function inst(iid: string): V2EquipInstance {
  return owned.find((o) => o.iid === iid)!;
}

async function renderView() {
  render(<V2InventoryView onBack={() => {}} />);
  await screen.findByText("장비 탭");
}

describe("인벤토리 여러 장비 비교 연결", () => {
  beforeEach(() => {
    mocks.compare = null;
    mocks.saleStart = null;
    mocks.card = null;
    mocks.equipBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v2/me/inventory")) {
          return Response.json({ ok: true, materials: {} });
        }
        if (url.endsWith("/api/v2/me/equipment")) {
          return Response.json({ ok: true, owned, equipped: { weapon: "equipped" } });
        }
        if (url.endsWith("/api/v2/me/equipment/equip")) {
          mocks.equipBody = JSON.parse(String(init?.body));
          return Response.json({ ok: true, equipped: { weapon: "b" } });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("고른 장비를 장착 장비와 함께 비교 창에 넘기고, 장착 장비는 고르지 않는다", async () => {
    await renderView();
    expect(mocks.compare?.active).toBe(false);
    expect(mocks.compare?.max).toBe(4);

    act(() => mocks.compare!.onStart());
    expect(mocks.compare?.active).toBe(true);

    act(() => mocks.compare!.onToggle(inst("equipped")));
    act(() => mocks.compare!.onToggle(inst("a")));
    act(() => mocks.compare!.onToggle(inst("b")));
    expect([...mocks.compare!.selectedIids]).toEqual(["a", "b"]);

    expect(screen.queryByText("비교 창")).toBeNull();
    act(() => mocks.compare!.onConfirm());
    expect(screen.getByText("비교 창")).toBeTruthy();
    expect(mocks.card?.equipped?.item.name).toBeTruthy();
    expect(mocks.card?.candidates.map((c) => c.iid)).toEqual(["a", "b"]);
  });

  it("비교 창을 닫아도 고른 장비는 남고, 장착에 성공하면 비교를 끝낸다", async () => {
    await renderView();
    act(() => mocks.compare!.onStart());
    act(() => mocks.compare!.onToggle(inst("b")));
    act(() => mocks.compare!.onConfirm());

    act(() => mocks.card!.onClose());
    expect(screen.queryByText("비교 창")).toBeNull();
    expect(mocks.compare?.active).toBe(true);
    expect([...mocks.compare!.selectedIids]).toEqual(["b"]);

    act(() => mocks.compare!.onConfirm());
    const candidate = mocks.card!.candidates[0];
    await act(async () => candidate.equip!.onEquip());
    expect(mocks.equipBody).toEqual({ slot: "weapon", iid: "b" });
    expect(screen.queryByText("비교 창")).toBeNull();
    expect(mocks.compare?.active).toBe(false);
  });

  it("선택 판매를 시작하면 비교 선택을 취소한다", async () => {
    await renderView();
    act(() => mocks.compare!.onStart());
    act(() => mocks.saleStart!());
    expect(mocks.compare?.active).toBe(false);
  });

  it("후보는 최대 4개까지만 고른다", async () => {
    const many: V2EquipInstance[] = Array.from({ length: 6 }, (_, i) => ({
      iid: `w${i}`,
      id: "v2_wooden_bow",
    }));
    owned.push(...many);
    try {
      await renderView();
      act(() => mocks.compare!.onStart());
      for (const m of many) act(() => mocks.compare!.onToggle(m));
      expect(mocks.compare!.selectedIids.size).toBe(4);
    } finally {
      owned.splice(3);
    }
  });
});
