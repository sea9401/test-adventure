// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EquippedItemSummaryGrid } from "./EquippedItemSummaryGrid";

describe("장착 장비 요약 그리드", () => {
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
    expect(equippedButton.className).toContain("focus-visible:ring-violet-500");
    expect(equippedButton.className).toContain("dark:bg-zinc-950");
    fireEvent.click(equippedButton);
    expect(onOpen).toHaveBeenCalledWith(owned[0], expect.any(Object));
  });
});
