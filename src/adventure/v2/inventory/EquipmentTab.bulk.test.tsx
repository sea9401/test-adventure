// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EquipmentTab } from "./EquipmentTab";

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

const props: ComponentProps<typeof EquipmentTab> = {
  slot: "weapon",
  instances: [{ iid: "1", id: "v2_iron_sword" }],
  equippedIid: null,
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
  codexBulk: { registerableCount: 1, onStart: vi.fn() },
  selection,
};

describe("인벤토리 일괄 작업 메뉴", () => {
  it("도구 줄에는 잠금만 보기·정렬·일괄 작업만 두고 판매 버튼은 메뉴 안에 둔다", () => {
    render(<EquipmentTab {...props} />);

    const toggle = screen.getByRole("button", { name: "일괄 작업" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: "잠금만 보기 (0)" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "장비 정렬 기준" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "미장착 전부 판매" })).toBeNull();
    expect(screen.queryByRole("button", { name: "도감 일괄 등록 (1)" })).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "도감 일괄 등록 (1)" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "일괄 판매 품질 임계값(%)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /이하 판매/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "미장착 전부 판매" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "선택 판매" })).toBeTruthy();
  });

  it("검색 중이면 일괄 작업이 검색 결과와 관계없이 적용된다고 메뉴 안에서 알린다", () => {
    render(<EquipmentTab {...props} search="철" />);

    expect(screen.queryByText(/검색 결과와 관계없이/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "일괄 작업" }));
    expect(screen.getByText(/검색 결과와 관계없이/)).toBeTruthy();
  });

  it("선택 판매 중에는 일괄 작업 메뉴 대신 선택 안내를 보여 준다", () => {
    render(<EquipmentTab {...props} selection={{ ...selection, active: true }} />);

    expect(screen.getByText("판매할 장비를 선택하세요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "일괄 작업" })).toBeNull();
  });
});
