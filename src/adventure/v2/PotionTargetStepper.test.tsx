// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PotionTargetStepper } from "./PotionTargetStepper";

afterEach(cleanup);

function renderStepper(value: number, onChange = vi.fn()) {
  render(
    <PotionTargetStepper
      id="hp-potion-target"
      label="HP 충전약 사용 목표"
      unit="체력"
      value={value}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("PotionTargetStepper", () => {
  it("스크롤 중 손가락이 닿아도 값이 바뀌는 슬라이더를 쓰지 않는다", () => {
    renderStepper(60);

    expect(document.querySelector('input[type="range"]')).toBeNull();
    expect(screen.getByText("체력 60%")).toBeTruthy();
  });

  it("버튼을 눌러야만 5% 단위로 목표를 바꾼다", () => {
    const onChange = renderStepper(60);

    fireEvent.click(screen.getByRole("button", { name: "HP 충전약 사용 목표 높이기" }));
    fireEvent.click(screen.getByRole("button", { name: "HP 충전약 사용 목표 낮추기" }));

    expect(onChange.mock.calls).toEqual([[65], [55]]);
  });

  it("5의 배수가 아닌 저장값은 가까운 5% 칸으로 맞춘다", () => {
    const onChange = renderStepper(49);

    fireEvent.click(screen.getByRole("button", { name: "HP 충전약 사용 목표 높이기" }));
    fireEvent.click(screen.getByRole("button", { name: "HP 충전약 사용 목표 낮추기" }));

    expect(onChange.mock.calls).toEqual([[50], [45]]);
  });

  it("끝값에서는 더 올리거나 내릴 수 없고 0%로 내려가지 않는다", () => {
    cleanup();
    renderStepper(100);
    expect(
      (screen.getByRole("button", { name: "HP 충전약 사용 목표 높이기" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    cleanup();
    renderStepper(5);
    expect(
      (screen.getByRole("button", { name: "HP 충전약 사용 목표 낮추기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("사용 안 함을 체크하면 0으로 끄고 조절 버튼을 잠근다", () => {
    const onChange = renderStepper(70);

    fireEvent.click(screen.getByRole("checkbox", { name: "사용 안 함" }));
    expect(onChange).toHaveBeenLastCalledWith(0);

    cleanup();
    renderStepper(0);
    expect((screen.getByRole("checkbox", { name: "사용 안 함" }) as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByRole("button", { name: "HP 충전약 사용 목표 높이기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getAllByText("사용 안 함").length).toBeGreaterThan(0);
  });

  it("사용 안 함을 풀면 끄기 전 목표로 되돌린다", () => {
    function Harness() {
      const [value, setValue] = useState(70);
      return (
        <PotionTargetStepper
          id="hp-potion-target"
          label="HP 충전약 사용 목표"
          unit="체력"
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<Harness />);

    const toggle = screen.getByRole("checkbox", { name: "사용 안 함" });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(screen.getByText("체력 70%")).toBeTruthy();
  });

  it("처음부터 꺼져 있던 목표를 켜면 100%로 시작한다", () => {
    const onChange = renderStepper(0);

    fireEvent.click(screen.getByRole("checkbox", { name: "사용 안 함" }));

    expect(onChange).toHaveBeenLastCalledWith(100);
  });
});
