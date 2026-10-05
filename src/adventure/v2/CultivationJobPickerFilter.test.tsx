// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CultivationJobPickerDialog } from "./CultivationActions";

afterEach(cleanup);

const options = [
  { id: "mage", name: "견습 마법사", summary: "지능 +2 · 정신 +2", profile: { int: 2, spi: 2 } },
  { id: "fortressknight", name: "성채기사", summary: "활력 +4 · 힘 +2", profile: { vit: 4, str: 2 } },
  { id: "warlock", name: "흑마법사", summary: "지능 +4 · 활력 +2", profile: { int: 4, vit: 2 } },
];

function radioNames(): string[] {
  return screen.getAllByRole("radio").map((radio) => radio.textContent ?? "");
}

it("수행 직업 목록을 증가량 합과 포함 스탯으로 거른다", () => {
  render(
    <CultivationJobPickerDialog options={options} value="mage" busy={false} onChange={vi.fn()} onClose={vi.fn()} />,
  );
  expect(screen.getAllByRole("radio")).toHaveLength(3);

  fireEvent.click(screen.getByRole("button", { name: "증가량 합 6" }));
  expect(radioNames().join()).not.toContain("견습 마법사");
  expect(screen.getAllByRole("radio")).toHaveLength(2);

  fireEvent.click(screen.getByRole("button", { name: "지능 포함" }));
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  expect(radioNames()[0]).toContain("흑마법사");

  fireEvent.click(screen.getByRole("button", { name: "힘 포함" }));
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(screen.getByText("조건에 맞는 직업이 없습니다.")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "조건 초기화" }));
  expect(screen.getAllByRole("radio")).toHaveLength(3);
});
