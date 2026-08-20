// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillRitualResetAction } from "./V2SkillLearnView";

afterEach(cleanup);

describe("스킬 강화 의식 초기화 확인", () => {
  it("첫 클릭과 취소로는 초기화하지 않고 명시적으로 확정했을 때만 실행한다", () => {
    const onConfirm = vi.fn();

    render(
      <SkillRitualResetAction
        skillName="폭풍 베기"
        mode="power"
        level={3}
        refund={{ gold: 1_500_000, proficiency: 400 }}
        busy={false}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^초기화$/ }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("폭풍 베기의 강화 의식을 초기화할까요?")).toBeTruthy();
    expect(screen.getByText("위력 의식 +3")).toBeTruthy();
    expect(screen.getByText("1,500,000G")).toBeTruthy();
    expect(screen.getByText("400")).toBeTruthy();
    expect(screen.getByText(/누적 비용의 50%만 환급/)).toBeTruthy();
    expect(screen.getByText(/되돌릴 수 없습니다/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^초기화$/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "강화 초기화 확정" }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
