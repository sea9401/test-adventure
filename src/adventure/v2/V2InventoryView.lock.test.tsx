// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_BULK_LOCK_COUNT,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";
import type {
  EquipmentCompareSelection,
  EquipmentLockSelection,
} from "./inventory/EquipmentTab";
import { V2InventoryView } from "./V2InventoryView";

// 선택 잠금·유니크 전부 잠금(건의 #859) — 인벤토리 화면이 선택 상태와 잠금 요청을 잇는지 본다.
//   장비 탭은 자체 테스트가 있으므로 여기서는 받은 props 만 확인한다.

const mocks = vi.hoisted(() => ({
  lock: null as EquipmentLockSelection | null,
  lockUniques: null as ((iids: string[]) => void) | null,
  compare: null as EquipmentCompareSelection | null,
  sale: null as { active: boolean; onStart: () => void } | null,
  instances: [] as V2EquipInstance[],
  lockBodies: [] as Array<{ iids: string[]; locked: boolean }>,
  lockResponse: null as (() => Response) | null,
  notifySystem: vi.fn(),
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
  useSystemToast: () => ({ notifySystem: mocks.notifySystem }),
}));

vi.mock("./inventory/EquipmentTab", () => ({
  EquipmentTab: ({
    instances,
    compare,
    selection,
    lockSelection,
    onLockUniques,
  }: {
    instances: V2EquipInstance[];
    compare: EquipmentCompareSelection;
    selection: { active: boolean; onStart: () => void };
    lockSelection: EquipmentLockSelection;
    onLockUniques: (iids: string[]) => void;
  }) => {
    mocks.instances = instances;
    mocks.compare = compare;
    mocks.sale = selection;
    mocks.lock = lockSelection;
    mocks.lockUniques = onLockUniques;
    return <div>장비 탭</div>;
  },
}));

let owned: V2EquipInstance[] = [];

function inst(iid: string): V2EquipInstance {
  return owned.find((o) => o.iid === iid)!;
}

async function renderView() {
  render(<V2InventoryView onBack={() => {}} />);
  await screen.findByText("장비 탭");
}

describe("인벤토리 일괄 잠금 연결", () => {
  beforeEach(() => {
    owned = [
      { iid: "equipped", id: "v2_iron_sword" },
      { iid: "a", id: "v2_greatsword", locked: true },
      { iid: "b", id: "v2_horn_bow" },
    ];
    mocks.lock = null;
    mocks.lockUniques = null;
    mocks.compare = null;
    mocks.sale = null;
    mocks.lockBodies = [];
    mocks.lockResponse = null;
    mocks.notifySystem.mockClear();
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
        if (url.endsWith("/api/v2/me/equipment/lock")) {
          const body = JSON.parse(String(init?.body)) as { iids: string[]; locked: boolean };
          mocks.lockBodies.push(body);
          if (mocks.lockResponse) return mocks.lockResponse();
          const targets = new Set(body.iids);
          let changedCount = 0;
          owned = owned.map((o) => {
            if (!targets.has(o.iid) || (o.locked === true) === body.locked) return o;
            changedCount += 1;
            return body.locked ? { ...o, locked: true } : { iid: o.iid, id: o.id };
          });
          return Response.json({ ok: true, owned, equipped: { weapon: "equipped" }, changedCount });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("고른 장비를 한 번에 잠그고 선택을 끝낸다", async () => {
    await renderView();
    expect(mocks.lock?.active).toBe(false);

    act(() => mocks.lock!.onStart());
    expect(mocks.lock?.active).toBe(true);
    act(() => mocks.lock!.onToggle(inst("equipped")));
    act(() => mocks.lock!.onToggle(inst("a")));
    act(() => mocks.lock!.onToggle(inst("b")));
    act(() => mocks.lock!.onToggle(inst("a")));
    expect([...mocks.lock!.selectedIids]).toEqual(["equipped", "b"]);

    await act(async () => mocks.lock!.onApply(true));

    expect(mocks.lockBodies).toEqual([{ iids: ["equipped", "b"], locked: true }]);
    expect(mocks.instances.every((o) => o.locked === true)).toBe(true);
    expect(mocks.lock?.active).toBe(false);
    expect(mocks.notifySystem).toHaveBeenLastCalledWith("✓ 장비 2개를 잠갔습니다");
  });

  it("고른 장비의 잠금을 한 번에 푼다", async () => {
    await renderView();
    act(() => mocks.lock!.onStart());
    act(() => mocks.lock!.onToggle(inst("a")));

    await act(async () => mocks.lock!.onApply(false));

    expect(mocks.lockBodies).toEqual([{ iids: ["a"], locked: false }]);
    expect(mocks.instances.some((o) => o.locked === true)).toBe(false);
    expect(mocks.notifySystem).toHaveBeenLastCalledWith("✓ 장비 1개의 잠금을 풀었습니다");
  });

  it("이미 모두 잠겨 있으면 바뀐 것이 없다고 알린다", async () => {
    await renderView();
    act(() => mocks.lock!.onStart());
    act(() => mocks.lock!.onToggle(inst("a")));

    await act(async () => mocks.lock!.onApply(true));

    expect(mocks.notifySystem).toHaveBeenLastCalledWith("✓ 고른 장비는 이미 잠겨 있습니다");
    expect(mocks.lock?.active).toBe(false);
  });

  it("선택 상한을 넘겨 고를 수 없다", async () => {
    await renderView();
    act(() => mocks.lock!.onStart());
    const max = mocks.lock!.max;
    for (let i = 0; i < max + 5; i += 1) {
      act(() => mocks.lock!.onToggle({ iid: `x${i}`, id: "v2_iron_sword" }));
    }

    expect(mocks.lock!.selectedIids.size).toBe(max);
  });

  it("잠금에 실패하면 선택을 남기고 이유를 알린다", async () => {
    await renderView();
    act(() => mocks.lock!.onStart());
    act(() => mocks.lock!.onToggle(inst("b")));
    mocks.lockResponse = () =>
      Response.json({ ok: false, error: "not_owned" }, { status: 400 });

    await act(async () => mocks.lock!.onApply(true));

    expect(mocks.lock?.active).toBe(true);
    expect([...mocks.lock!.selectedIids]).toEqual(["b"]);
    expect(mocks.notifySystem).toHaveBeenLastCalledWith("✗ not_owned");
  });

  it("선택 잠금은 선택 판매·비교 선택과 동시에 켜지지 않는다", async () => {
    await renderView();
    act(() => mocks.lock!.onStart());
    act(() => mocks.sale!.onStart());
    expect(mocks.lock?.active).toBe(false);
    expect(mocks.sale?.active).toBe(true);

    act(() => mocks.lock!.onStart());
    expect(mocks.sale?.active).toBe(false);
    expect(mocks.lock?.active).toBe(true);

    act(() => mocks.compare!.onStart());
    expect(mocks.lock?.active).toBe(false);
    expect(mocks.compare?.active).toBe(true);

    act(() => mocks.lock!.onStart());
    expect(mocks.compare?.active).toBe(false);
  });

  it("유니크 전부 잠금은 받은 장비를 잠그고 수를 알린다", async () => {
    await renderView();

    await act(async () => mocks.lockUniques!(["b"]));

    expect(mocks.lockBodies).toEqual([{ iids: ["b"], locked: true }]);
    expect(mocks.notifySystem).toHaveBeenLastCalledWith("✓ 유니크 장비 1개를 잠갔습니다");
  });

  it("유니크가 한 번에 보낼 수 있는 수보다 많으면 나누어 보낸다", async () => {
    await renderView();
    const iids = Array.from({ length: MAX_BULK_LOCK_COUNT + 3 }, (_, i) => `u${i}`);
    mocks.lockResponse = () =>
      Response.json({ ok: true, owned, equipped: { weapon: "equipped" }, changedCount: 1 });

    await act(async () => mocks.lockUniques!(iids));

    expect(mocks.lockBodies.map((body) => body.iids.length)).toEqual([MAX_BULK_LOCK_COUNT, 3]);
    expect(mocks.notifySystem).toHaveBeenLastCalledWith("✓ 유니크 장비 2개를 잠갔습니다");
  });
});
