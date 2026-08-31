// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EquippedItemSummaryGrid } from "./EquippedItemSummaryGrid";

afterEach(cleanup);

describe("장착 장비 요약 그리드", () => {
  it("비세트·정규 세트·태그 세트 장비의 세트 정보를 카드 하단에 표시한다", () => {
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

    expect(screen.getAllByTestId("equipped-set-label")).toHaveLength(3);
    expect(screen.getByText("세트 없음")).toBeTruthy();
    expect(screen.getByText("세트 · 공허 성벽")).toBeTruthy();
    expect(screen.getByText("세트 · 수호각인 장비")).toBeTruthy();
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
    expect(equippedButton.className).toContain("focus-visible:ring-violet-500");
    expect(equippedButton.className).toContain("dark:bg-zinc-950");
    fireEvent.click(equippedButton);
    expect(onOpen).toHaveBeenCalledWith(owned[0], expect.any(Object));
  });
});
