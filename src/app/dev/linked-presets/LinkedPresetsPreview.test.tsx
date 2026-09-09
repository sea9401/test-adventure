// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { LinkedPresetsPreview } from "./LinkedPresetsPreview";

afterEach(cleanup);

it("공유 스킬을 수정하면 다음 조합 적용에 반영하고 현재 적용 상태는 유지한다", () => {
  render(<LinkedPresetsPreview />);
  fireEvent.click(screen.getByRole("tab", { name: "스킬" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "맹독 IV" }));
  fireEvent.click(screen.getByRole("button", { name: "프리셋 저장" }));
  expect(within(screen.getByTestId("applied-loadout")).getByText(/맹독 IV/)).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "전투 조합" }));
  fireEvent.click(screen.getByRole("button", { name: "저장 후 적용" }));
  expect(within(screen.getByTestId("applied-loadout")).queryByText(/맹독 IV/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "일반 사냥 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "저장 후 적용" }));
  expect(within(screen.getByTestId("applied-loadout")).queryByText(/맹독 IV/)).toBeNull();
});

it("연결된 스킬 삭제 영향을 알리고 삭제 후 조합 적용을 막는다", () => {
  render(<LinkedPresetsPreview />);
  fireEvent.click(screen.getByRole("tab", { name: "스킬" }));
  fireEvent.click(screen.getByRole("button", { name: "프리셋 삭제" }));
  const notice = screen.getByRole("alert");
  expect(notice.textContent).toContain("독 토벌");
  expect(notice.textContent).toContain("일반 사냥");
  fireEvent.click(within(notice).getByRole("button", { name: "삭제" }));
  fireEvent.click(screen.getByRole("tab", { name: "전투 조합" }));
  expect((screen.getByRole("button", { name: "저장 후 적용" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getAllByText("스킬 프리셋 다시 선택").length).toBeGreaterThan(0);
});

it("기존 저장 방식은 연결형 전환 후에도 저장된 구성을 그대로 적용한다", () => {
  render(<LinkedPresetsPreview />);
  fireEvent.click(screen.getByRole("button", { name: "예전 토벌 세팅 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "연결형으로 전환" }));
  fireEvent.click(screen.getByRole("button", { name: "저장 후 적용" }));
  expect(within(screen.getByTestId("applied-loadout")).getByText("독왕진 · 맹독 IV")).toBeTruthy();
});
