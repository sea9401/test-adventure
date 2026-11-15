// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentTab, type EquipmentLockSelection } from "./EquipmentTab";

// 선택 잠금·유니크 전부 잠금(건의 #859).

afterEach(cleanup);

const selection = {
  active: false,
  selectedIids: new Set<string>(),
  selectedCount: 0,
  selectedGold: 0,
  onStart: vi.fn(),
  onCancel: vi.fn(),
  onToggle: vi.fn(),
  onConfirm: vi.fn(),
};

const lockSelection: EquipmentLockSelection = {
  active: false,
  selectedIids: new Set<string>(),
  max: 100,
  onStart: vi.fn(),
  onCancel: vi.fn(),
  onToggle: vi.fn(),
  onApply: vi.fn(),
};

const onLockUniques = vi.fn();

const props: ComponentProps<typeof EquipmentTab> = {
  slot: "armor",
  instances: [
    { iid: "plain", id: "v2_leather_armor" },
    { iid: "unique-open", id: "v2_boss_lake_maul" },
    { iid: "unique-locked", id: "v2_boss_lake_maul", locked: true },
    { iid: "unique-equipped", id: "v2_boss_lake_maul" },
  ],
  equippedIid: "unique-equipped",
  busy: null,
  sortMode: "default",
  setSortMode: vi.fn(),
  lockFilter: "all",
  setLockFilter: vi.fn(),
  sellQualityPct: 40,
  setSellQualityPct: vi.fn(),
  pageSize: 20,
  frontierDepth: 99,
  onBulkSell: vi.fn(),
  onOpenCard: vi.fn(),
  onRegisterCodex: vi.fn(),
  selection,
  lockSelection,
  onLockUniques,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("인벤토리 일괄 잠금", () => {
  it("일괄 작업 메뉴에서 선택 잠금을 시작한다", () => {
    render(<EquipmentTab {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "일괄 작업" }));

    fireEvent.click(screen.getByRole("button", { name: "선택 잠금" }));

    expect(lockSelection.onStart).toHaveBeenCalledOnce();
  });

  it("유니크 전부 잠금은 이 부위의 잠기지 않은 유니크를 장착 중인 것까지 넘긴다", () => {
    render(<EquipmentTab {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "일괄 작업" }));

    fireEvent.click(screen.getByRole("button", { name: "유니크 전부 잠금 (2)" }));

    expect(onLockUniques).toHaveBeenCalledWith(["unique-open", "unique-equipped"]);
  });

  it("잠글 유니크가 없으면 유니크 전부 잠금을 누를 수 없다", () => {
    render(
      <EquipmentTab
        {...props}
        instances={[{ iid: "plain", id: "v2_leather_armor" }]}
        equippedIid={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "일괄 작업" }));

    const button = screen.getByRole("button", { name: "유니크 전부 잠금 (0)" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("선택 잠금 중에는 고른 수와 잠금·잠금 해제·취소를 보여 준다", () => {
    render(
      <EquipmentTab
        {...props}
        lockSelection={{
          ...lockSelection,
          active: true,
          selectedIids: new Set(["plain", "unique-locked"]),
        }}
      />,
    );

    expect(screen.getByText("잠그거나 잠금을 풀 장비를 고르세요.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "일괄 작업" })).toBeNull();
    expect(screen.getByText("선택 2개")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "잠금" }));
    expect(lockSelection.onApply).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "잠금 해제" }));
    expect(lockSelection.onApply).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(lockSelection.onCancel).toHaveBeenCalledOnce();
  });

  it("고른 장비가 없으면 잠금과 잠금 해제를 누를 수 없다", () => {
    render(<EquipmentTab {...props} lockSelection={{ ...lockSelection, active: true }} />);

    expect((screen.getByRole("button", { name: "잠금" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "잠금 해제" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("선택 잠금 중에는 잠긴 장비와 장착 중인 장비도 고를 수 있다", () => {
    render(<EquipmentTab {...props} lockSelection={{ ...lockSelection, active: true }} />);

    const cards = screen.getAllByRole("button", { name: /잠금 선택 안 됨$/ });
    expect(cards).toHaveLength(4);
    fireEvent.click(cards[0]);
    expect(lockSelection.onToggle).toHaveBeenCalledOnce();
  });
});
