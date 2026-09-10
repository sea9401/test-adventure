// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EquipmentTab } from "./EquipmentTab";
import type { ComponentProps } from "react";

afterEach(cleanup);
const props: ComponentProps<typeof EquipmentTab> = {
  slot: "weapon",
  instances: [
    { iid: "1", id: "v2_iron_sword", locked: true },
    { iid: "2", id: "v2_iron_sword" },
    { iid: "3", id: "v2_mithril_sword", locked: true },
  ],
  equippedIid: null, busy: null, sortMode: "default", setSortMode: vi.fn(),
  lockedOnly: false, setLockedOnly: vi.fn(), sellQualityPct: 40,
  setSellQualityPct: vi.fn(), pageSize: 1, frontierDepth: 99,
  onBulkSell: vi.fn(), onOpenCard: vi.fn(), onRegisterCodex: vi.fn(),
  selection: { active: false, selectedIids: new Set(), selectedCount: 0,
    selectedGold: 0, onStart: vi.fn(), onCancel: vi.fn(), onToggle: vi.fn(), onConfirm: vi.fn() },
};

it("뒤 페이지에서 검색하면 첫 페이지로 돌아가고 잠금 필터와 함께 적용된다", () => {
  const { rerender } = render(<EquipmentTab {...props} search="" />);
  fireEvent.click(screen.getByRole("button", { name: "3 페이지" }));
  rerender(<EquipmentTab {...props} search=" 철검 " />);
  expect(screen.getByRole("button", { name: "1 페이지" }).getAttribute("aria-current")).toBe("page");
  expect(screen.queryByText("미스릴검")).toBeNull();
  rerender(<EquipmentTab {...props} search="철검" lockedOnly />);
  expect(screen.queryByRole("navigation", { name: "페이지 네비게이션" })).toBeNull();
  expect(screen.getByText("철검")).toBeTruthy();
  rerender(<EquipmentTab {...props} search="없는장비" />);
  expect(screen.getByText("검색 결과가 없습니다")).toBeTruthy();
  rerender(<EquipmentTab {...props} search="" />);
  expect(screen.getByRole("button", { name: "3 페이지" })).toBeTruthy();
});
