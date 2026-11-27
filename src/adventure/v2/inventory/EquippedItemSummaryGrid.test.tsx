// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EquippedItemSummaryGrid } from "./EquippedItemSummaryGrid";

afterEach(cleanup);

describe("장착 장비 요약 그리드", () => {
  it("세트 장비에만 부위 이름 옆에 세트 이름을 붙이고, 세트가 없다는 말은 되풀이하지 않는다", () => {
    render(
      <EquippedItemSummaryGrid
        equipped={{
          weapon: "weapon-1",
          armor: "armor-1",
          gloves: "gloves-1",
        }}
        owned={[
          { iid: "weapon-1", id: "v2_iron_sword" },
          { iid: "armor-1", id: "v2_boss_void_bastion" },
          { iid: "gloves-1", id: "v2_crafted_guard_gauntlets" },
        ]}
        onOpen={vi.fn()}
      />,
    );

    const labels = screen.getAllByTestId("equipped-set-label");
    expect(labels).toHaveLength(2);
    expect(labels.map((label) => label.textContent)).toEqual([
      " · 공허 성벽",
      " · 수호각인 장비",
    ]);
    expect(screen.queryByText("세트 없음")).toBeNull();
    expect(screen.queryByText("세트 효과 없음")).toBeNull();
    expect(screen.getByRole("heading", { name: "장착 중" })).toBeTruthy();
  });

  it("세트 장비가 하나도 없으면 머리에 한 번만 알린다", () => {
    render(
      <EquippedItemSummaryGrid
        equipped={{ weapon: "weapon-1" }}
        owned={[{ iid: "weapon-1", id: "v2_iron_sword" }]}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getAllByText("세트 효과 없음")).toHaveLength(1);
    expect(screen.queryAllByTestId("equipped-set-label")).toHaveLength(0);
    expect(screen.getAllByText("비어 있음")).toHaveLength(5);
  });

  it("모바일 3열·PC 6열로 여섯 슬롯을 표시하고 인라인 해제를 없앤다", () => {
    const onOpen = vi.fn();
    const owned = [
      {
        iid: "weapon-1",
        id: "v2_starter_staff" as const,
        enhance: { level: 9, bonusPct: 15 },
      },
    ];
    const { container } = render(
      <EquippedItemSummaryGrid
        equipped={{ weapon: "weapon-1" }}
        owned={owned}
        onOpen={onOpen}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "해제" })).toBeNull();
    expect(screen.getByText("+9")).toBeTruthy();
    expect(container.querySelector(".grid-cols-3")).toBeTruthy();
    expect(container.querySelector(".sm\\:grid-cols-6")).toBeTruthy();
    const equippedButton = screen.getByRole("button", { name: /무기.*정보/ });
    expect(equippedButton.className).toContain("focus-visible:ring-focus");
    // 칸마다 상자를 두지 않는다.
    expect(equippedButton.className).not.toContain("border");
    fireEvent.click(equippedButton);
    expect(onOpen).toHaveBeenCalledWith(owned[0], expect.any(Object));
  });
});
