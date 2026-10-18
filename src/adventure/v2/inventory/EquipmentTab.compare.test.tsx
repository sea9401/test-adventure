// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { EquipmentTab, type EquipmentCompareSelection } from "./EquipmentTab";

afterEach(cleanup);

const instances: V2EquipInstance[] = [
  { iid: "equipped", id: "v2_iron_sword" },
  { iid: "locked", id: "v2_greatsword", locked: true },
  { iid: "a", id: "v2_horn_bow" },
  { iid: "b", id: "v2_wooden_bow" },
];

function compareSelection(
  overrides: Partial<EquipmentCompareSelection> = {},
): EquipmentCompareSelection {
  return {
    active: false,
    selectedIids: new Set<string>(),
    max: 4,
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onToggle: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
}

function props(
  compare: EquipmentCompareSelection,
  equippedIid: string | null = "equipped",
): ComponentProps<typeof EquipmentTab> {
  return {
    slot: "weapon",
    instances,
    equippedIid,
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
    selection: {
      active: false,
      selectedIids: new Set(),
      selectedCount: 0,
      selectedGold: 0,
      onStart: vi.fn(),
      onCancel: vi.fn(),
      onToggle: vi.fn(),
      onConfirm: vi.fn(),
    },
    compare,
  };
}

describe("인벤토리 비교 선택", () => {
  it("비교 선택 버튼으로 선택 모드를 시작한다", () => {
    const compare = compareSelection();
    render(<EquipmentTab {...props(compare)} />);

    fireEvent.click(screen.getByRole("button", { name: "비교 선택" }));
    expect(compare.onStart).toHaveBeenCalledOnce();
  });

  it("잠금 장비도 고를 수 있고 장착 장비는 기준이라 고를 수 없다", () => {
    const compare = compareSelection({ active: true });
    render(<EquipmentTab {...props(compare)} />);

    expect(screen.getByText(/장착 중인 장비는 자동으로 함께 비교됩니다/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "철검 비교 선택 불가: 장착 중" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "한타검 비교 선택 안 됨" }));
    expect(compare.onToggle).toHaveBeenCalledWith(instances[1]);
    expect(screen.queryByRole("button", { name: "일괄 작업" })).toBeNull();
  });

  it("장착 장비가 있으면 1개만 골라도 비교할 수 있다", () => {
    const compare = compareSelection({ active: true, selectedIids: new Set(["a"]) });
    render(<EquipmentTab {...props(compare)} />);

    expect(screen.getByText("선택 1/4개")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "비교하기" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(compare.onConfirm).toHaveBeenCalledOnce();
  });

  it("장착 장비가 없으면 2개 이상 골라야 비교할 수 있다", () => {
    const compare = compareSelection({ active: true, selectedIids: new Set(["a"]) });
    render(<EquipmentTab {...props(compare, null)} />);

    expect(
      (screen.getByRole("button", { name: "비교하기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("상한에 닿으면 고르지 않은 장비는 더 고를 수 없다", () => {
    const compare = compareSelection({
      active: true,
      max: 2,
      selectedIids: new Set(["a", "b"]),
    });
    render(<EquipmentTab {...props(compare)} />);

    expect(
      (
        screen.getByRole("button", {
          name: "한타검 비교 선택 불가: 최대 2개",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "각궁 비교 선택됨" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
