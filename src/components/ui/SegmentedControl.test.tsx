// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

afterEach(cleanup);

const OPTIONS = [
  { key: "dummy", label: "허수아비 연습" },
  { key: "friendly", label: "유저 친선전" },
] as const;

describe("SegmentedControl", () => {
  it("선택지 묶음에 이름을 붙이고 선택된 칸만 눌린 상태로 표시한다", () => {
    render(<SegmentedControl options={OPTIONS} value="dummy" onChange={vi.fn()} ariaLabel="대련 종류" />);

    const group = screen.getByRole("group", { name: "대련 종류" });
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    expect(buttons.every((button) => button.className.includes("min-h-10"))).toBe(true);
  });

  it("다른 칸을 누르면 그 키로 바꾼다", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="dummy" onChange={onChange} ariaLabel="대련 종류" />);

    fireEvent.click(screen.getByRole("button", { name: "유저 친선전" }));
    expect(onChange).toHaveBeenCalledWith("friendly");
  });

  it("tone을 준 칸은 고르기 전에도 그 색 바탕을 깔고, 고른 칸은 테두리로 구분한다", () => {
    const toned = [
      { key: "normal", label: "노말", tone: "safe" },
      { key: "hard", label: "하드", tone: "danger" },
    ] as const;
    const { rerender } = render(<SegmentedControl options={toned} value={null} onChange={vi.fn()} ariaLabel="난이도" />);

    const normal = screen.getByRole("button", { name: "노말" });
    const hard = screen.getByRole("button", { name: "하드" });
    expect(normal.className).toContain("bg-emerald-50");
    expect(hard.className).toContain("bg-rose-50");
    expect(hard.className).not.toContain("ring-rose-500");

    rerender(<SegmentedControl options={toned} value="hard" onChange={vi.fn()} ariaLabel="난이도" />);
    expect(hard.className).toContain("bg-rose-100");
    expect(hard.className).toContain("ring-rose-500");
    expect(normal.className).toContain("bg-emerald-50");
  });
});
