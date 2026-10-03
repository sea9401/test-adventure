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
});
