// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SubViewHeader } from "./SubViewHeader";

afterEach(cleanup);

describe("SubViewHeader 도움말", () => {
  it("도움말을 주지 않으면 도움말 버튼이 없다", () => {
    render(<SubViewHeader title="문장" />);
    expect(screen.queryByRole("button", { name: "도움말" })).toBeNull();
  });

  it("도움말 버튼으로 머리 아래 도움말 패널을 열고 닫는다", () => {
    render(<SubViewHeader title="스킬 패턴" help={<p>위에서부터 조건을 확인합니다.</p>} />);

    const button = screen.getByRole("button", { name: "도움말" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "도움말" })).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "도움말" }).textContent).toContain("위에서부터 조건을 확인합니다.");

    fireEvent.click(button);
    expect(screen.queryByRole("region", { name: "도움말" })).toBeNull();
  });

  it("오른쪽 슬롯과 도움말 버튼을 함께 보여 준다", () => {
    render(<SubViewHeader title="은행" right={<span>보유 50G</span>} help={<p>규칙</p>} />);
    expect(screen.getByText("보유 50G")).toBeTruthy();
    expect(screen.getByRole("button", { name: "도움말" })).toBeTruthy();
  });
});
