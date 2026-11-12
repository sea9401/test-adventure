// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BattlePrepSection } from "./BattlePrepSection";

afterEach(cleanup);

describe("인벤토리 전투 준비물", () => {
  it("보유한 준비물만 보여 주고 사용을 전달한다", () => {
    const onUse = vi.fn();
    render(
      <BattlePrepSection
        materials={{ v2_prep_whetstone_3: 2, v2_prep_brace_1: 0 }}
        busy={null}
        onUse={onUse}
      />,
    );

    expect(screen.getByText("상급 숫돌")).toBeTruthy();
    expect(screen.getByText("×2")).toBeTruthy();
    expect(screen.getByText("무기 손질 · 공격력·마법공격력 +130 · 12시간")).toBeTruthy();
    expect(screen.queryByText("초급 보강재")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "상급 숫돌 사용" }));
    expect(onUse).toHaveBeenCalledWith("v2_prep_whetstone_3");
  });

  it("사용 요청 중인 품목의 버튼은 잠긴다", () => {
    render(
      <BattlePrepSection
        materials={{ v2_prep_whetstone_3: 1, v2_prep_brace_master: 1 }}
        busy="battle_prep_v2_prep_whetstone_3"
        onUse={vi.fn()}
      />,
    );

    expect((screen.getByRole("button", { name: "상급 숫돌 사용" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "명장의 보강재 사용" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("방어구 손질 · 방어력·마법방어력 +90 · 최대 HP +1,400 · 24시간")).toBeTruthy();
  });

  it("하나도 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<BattlePrepSection materials={{ v2_timber: 5 }} busy={null} onUse={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
