// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./useSparring", () => ({
  useSparring: () => ({ busy: false, lastResult: null, error: null, spar: vi.fn() }),
}));
vi.mock("./FriendlySparringPanel", () => ({
  FriendlySparringPanel: () => <div>친선전 화면</div>,
}));
vi.mock("./V2CombatPatternView", () => ({
  V2CombatPatternView: ({ embedded }: { embedded?: boolean }) => (
    <div>패턴 편집기{embedded ? " (끼움)" : ""}</div>
  ),
}));
vi.mock("./V2SkillLearnView", () => ({
  V2SkillLearnView: ({ embedded, section }: { embedded?: boolean; section?: string }) => (
    <div>스킬 화면 {section}{embedded ? " (끼움)" : ""}</div>
  ),
}));

import { V2SparringView } from "./V2SparringView";

function open() {
  return render(<V2SparringView playerName="나" gender="male1" onBack={vi.fn()} />);
}

afterEach(cleanup);

describe("대련장 스킬 설정 탭 (#852)", () => {
  it("허수아비 연습, 유저 친선전, 스킬 설정 세 탭을 보여 준다", () => {
    open();
    const tabs = within(screen.getByRole("tablist", { name: "대련장 탭" }));
    expect(tabs.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "허수아비 연습",
      "유저 친선전",
      "스킬 설정",
    ]);
  });

  it("스킬 설정 탭은 스킬 패턴 편집기를 먼저 보여 주고 스킬 장착으로 바꿀 수 있다", async () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: "스킬 설정" }));

    expect(await screen.findByText("패턴 편집기 (끼움)")).toBeTruthy();
    expect(screen.queryByText("허수아비치기 시작")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "스킬 장착" }));

    expect(await screen.findByText("스킬 화면 loadout (끼움)")).toBeTruthy();
    expect(screen.queryByText("패턴 편집기 (끼움)")).toBeNull();
  });

  it("바꾼 설정이 다음 대련부터 적용된다고 알려 준다", async () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: "스킬 설정" }));

    expect(await screen.findByText("바꾼 내용은 바로 저장되고 다음 대련부터 적용됩니다.")).toBeTruthy();
  });

  it("스킬 설정 탭을 다녀와도 직접 입력한 허수아비 수치가 남는다", async () => {
    open();
    const hp = screen.getByLabelText("HP") as HTMLInputElement;
    fireEvent.change(hp, { target: { value: "2500000" } });

    fireEvent.click(screen.getByRole("tab", { name: "스킬 설정" }));
    await screen.findByText("패턴 편집기 (끼움)");
    fireEvent.click(screen.getByRole("tab", { name: "허수아비 연습" }));

    expect((screen.getByLabelText("HP") as HTMLInputElement).value).toBe("2500000");
    expect(screen.getByRole("button", { name: "허수아비치기 시작" })).toBeTruthy();
  });
});
