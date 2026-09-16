// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
import { V2DungeonSelectionView } from "./V2DungeonSelectionView";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockReset(); });
it("shows independent attempts and keeps both destinations reachable", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ ok: true, unlocked: true, attemptsLeft: url.includes("storm") ? 1 : 3, state: { active: null } }) })));
  render(<V2DungeonSelectionView />);
  expect(await screen.findByText("남은 입장 1 / 3회")).toBeTruthy();
  expect(screen.getByText("남은 입장 3 / 3회")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "태초의 성소 입장" }));
  expect(push).toHaveBeenCalledWith("/battle/sanctuary");
});
describe("locked dungeon", () => {
  it("explains the unlock requirement and disables entry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, unlocked: false, attemptsLeft: 3 }) })));
    render(<V2DungeonSelectionView />);
    const button = await screen.findByRole("button", { name: "태초의 성소 입장" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/미개척지 해금 이후/)).toBeTruthy();
  });
});
it("keeps storm practice accessible after using its three normal attempts", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, unlocked: true, attemptsLeft: 0, state: { active: null } }) })));
  render(<V2DungeonSelectionView />);
  const storm = await screen.findByRole("button", { name: "폭풍 원정 입장" });
  expect(storm.hasAttribute("disabled")).toBe(false);
  expect(screen.getByRole("button", { name: "태초의 성소 입장" }).hasAttribute("disabled")).toBe(true);
});
