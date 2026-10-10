// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnhanceCatalystToggle } from "./EnhanceCatalystToggle";

afterEach(cleanup);

describe("단련 촉매 사용 선택", () => {
  it("하락이 있는 시도에서 보유 촉매가 있으면 켤 수 있다", () => {
    const onChange = vi.fn();
    render(<EnhanceCatalystToggle level={6} stone="none" held={2} checked={false} onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: /단련 촉매 사용/ }) as HTMLInputElement;
    expect(box.disabled).toBe(false);
    expect(screen.getByText(/보유 2/)).toBeTruthy();
    expect(screen.getByText(/하락 18% → 8%/)).toBeTruthy();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("하락이 없는 시도에서는 안내와 함께 막는다", () => {
    render(<EnhanceCatalystToggle level={3} stone="none" held={2} checked={false} onChange={vi.fn()} />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("이 단계는 하락하지 않아 쓸 필요가 없습니다")).toBeTruthy();
  });

  it("보유 촉매가 없으면 그리지 않는다", () => {
    const { container } = render(
      <EnhanceCatalystToggle level={6} stone="none" held={0} checked={false} onChange={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
