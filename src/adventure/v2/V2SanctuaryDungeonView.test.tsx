// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./GameStateRefreshContext", () => ({ useRefreshGameState: () => vi.fn() }));
vi.mock("./ReplayBattleScene", () => ({ ReplayBattleScene: () => <div>전투 기록</div> }));
import { V2SanctuaryDungeonView } from "./V2SanctuaryDungeonView";
import { createSanctuaryActive, parseSanctuaryState } from "@/adventure/data/v2/sanctuaryDungeon";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const response = (state: unknown) => ({ ok: true, json: async () => ({ ok: true, unlocked: true, attemptsLeft: 2, state }) });
describe("sanctuary play screen", () => {
  it("starts with a revision and renders the single next battle", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(parseSanctuaryState({}))).mockResolvedValueOnce(response({ ...parseSanctuaryState({}), revision: 1, active: createSanctuaryActive(1000, 300) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);
    fireEvent.click(await screen.findByRole("button", { name: "성소 입장" }));
    expect(await screen.findByRole("button", { name: "전투 시작" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "start", expectedRevision: 0 });
  });
  it("shows checkpoint effects and requires confirmation before withdrawal", async () => {
    const active = { ...createSanctuaryActive(1000, 300), currentNodeId: "supply", visitedNodeIds: ["wreckage_outer", "supply"] };
    const fetchMock = vi.fn().mockResolvedValue(response({ ...parseSanctuaryState({}), revision: 7, active }));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);
    expect(await screen.findByRole("button", { name: /응급 식량/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "전투 시작" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "귀환" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "보상 받고 귀환" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "withdraw", expectedRevision: 7 });
  });
});
