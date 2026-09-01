// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { EquipmentEnchantmentPickerDialog } from "./EquipmentEnchantmentPickerDialog";
import { liberationCandidateRows } from "./equipmentLiberationViewModel";

afterEach(cleanup);

const owned: V2EquipInstance[] = [
  {
    iid: "gloves-stage-1",
    id: "v2_boss_catastrophe_gloves",
    roll: {
      power: 68,
      weight: 0,
      options: { hp: 165, crit: 10, spd: 8, accuracy: 10 },
    },
    liberation: {
      rank: 3,
      lineCount: 1,
      revision: 1,
      options: [{ id: "base_str_pct", level: 4 }],
    },
  },
  {
    iid: "armor-plain",
    id: "v2_boss_frozen_lake_armor",
  },
  {
    iid: "gloves-stage-3",
    id: "v2_boss_catastrophe_gloves",
    locked: true,
    roll: {
      power: 82,
      weight: 0,
      options: { hp: 195, crit: 15, spd: 11, accuracy: 13 },
    },
    liberation: {
      rank: 1,
      lineCount: 2,
      revision: 3,
      options: [
        { id: "skill_crit_damage_pp", level: 20 },
        { id: "base_dex_pct", level: 12 },
      ],
    },
  },
];

function renderPicker(onSelect = vi.fn()) {
  render(
    <EquipmentEnchantmentPickerDialog
      candidates={liberationCandidateRows(owned, { gloves: "gloves-stage-1" })}
      selectedIid="gloves-stage-1"
      busy={false}
      onSelect={onSelect}
      onClose={() => undefined}
    />,
  );
  return onSelect;
}

describe("마법부여 장비 선택 창", () => {
  it("부위 탭과 여섯 정렬 기준을 제공하고 검색·탭을 함께 적용한다", () => {
    renderPicker();

    expect(screen.getByRole("tab", { name: "전체 3" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "갑옷 1" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "장갑 2" })).toBeTruthy();
    expect(
      within(screen.getByRole("combobox", { name: "장비 정렬 기준" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "기본 · 장착 우선",
      "최근 획득 · 최신부터",
      "티어 · 높은순",
      "품질 · 높은순",
      "위력 · 높은순",
      "마법부여 단계 · 높은순",
    ]);

    fireEvent.change(screen.getByRole("searchbox", { name: "장비 이름 검색" }), {
      target: { value: "재앙독" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "갑옷 1" }));
    expect(
      within(screen.getByRole("listbox", { name: "마법부여 대상 장비" })).queryAllByRole(
        "option",
      ),
    ).toHaveLength(0);

    fireEvent.change(screen.getByRole("searchbox", { name: "장비 이름 검색" }), {
      target: { value: "빙호" },
    });
    expect(
      within(screen.getByRole("listbox", { name: "마법부여 대상 장비" })).getByRole(
        "option",
      ).textContent,
    ).toContain("빙호 갑주");
  });

  it("같은 이름의 장비를 품질·위력·현재 마법부여 옵션으로 구분한다", () => {
    renderPicker();

    const listbox = screen.getByRole("listbox", { name: "마법부여 대상 장비" });
    expect(within(listbox).getAllByText("재앙독 완갑")).toHaveLength(2);
    expect(within(listbox).getByText("기초 STR +1.8%")).toBeTruthy();
    expect(within(listbox).getByText("스킬 치명타 피해 +40%p")).toBeTruthy();
    expect(within(listbox).getByText("잠금됨")).toBeTruthy();
    expect(within(listbox).getByText("장착 중")).toBeTruthy();
    expect(within(listbox).getAllByText(/위력/).length).toBeGreaterThanOrEqual(2);
    expect(within(listbox).getAllByText(/품질/).length).toBeGreaterThanOrEqual(2);
  });

  it("마법부여 단계 정렬 후 카드 전체를 눌러 장비를 선택한다", () => {
    const onSelect = renderPicker();
    fireEvent.change(screen.getByRole("combobox", { name: "장비 정렬 기준" }), {
      target: { value: "enchantment" },
    });

    const cards = within(
      screen.getByRole("listbox", { name: "마법부여 대상 장비" }),
    ).getAllByRole("option");
    expect(cards[0].textContent).toContain("마법부여 3단계");
    expect(cards[2].textContent).toContain("미마법부여");

    fireEvent.click(cards[0]);
    expect(onSelect).toHaveBeenCalledWith("gloves-stage-3");
  });
});
