// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./GameStateRefreshContext", () => ({ useRefreshGameState: () => vi.fn() }));
vi.mock("./ReplayBattleScene", () => ({ ReplayBattleScene: () => <div>전투 기록</div> }));
import { V2SanctuaryDungeonView } from "./V2SanctuaryDungeonView";
import { createSanctuaryActive, parseSanctuaryState } from "@/adventure/data/v2/sanctuaryDungeon";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const response = (state: unknown) => ({ ok: true, json: async () => ({ ok: true, unlocked: true, attemptsLeft: 2, state }) });
describe("sanctuary play screen", () => {
  it("opens entry and battle actions by selecting circular map nodes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(parseSanctuaryState({}))).mockResolvedValueOnce(response({ ...parseSanctuaryState({}), revision: 1, active: createSanctuaryActive(1000, 300) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);
    fireEvent.click(await screen.findByRole("button", { name: /성소 외곽, 이동 가능/ }));
    fireEvent.click(screen.getByRole("button", { name: "성소 입장" }));
    await screen.findByRole("button", { name: /성소 외곽, 현재/ });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "전투 시작" })).toBeNull();
    const map = screen.getByRole("region", { name: "성소 진행 경로" });
    expect(within(map).getAllByRole("button")).toHaveLength(9);
    fireEvent.click(screen.getByRole("button", { name: /성소 외곽, 현재/ }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "전투 시작" })).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "start", expectedRevision: 0 });
  });
  it("shows checkpoint effects and requires confirmation before withdrawal", async () => {
    const active = { ...createSanctuaryActive(1000, 300), currentNodeId: "supply", visitedNodeIds: ["wreckage_outer", "supply"] };
    const fetchMock = vi.fn().mockResolvedValue(response({ ...parseSanctuaryState({}), revision: 7, active }));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);
    fireEvent.click(await screen.findByRole("button", { name: /탐험대 보급품, 현재/ }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: /응급 식량/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(screen.queryByRole("button", { name: "전투 시작" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "귀환" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "보상 받고 귀환" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "withdraw", expectedRevision: 7 });
  });
  it("finishes the current battle and waits for the next node selection", async () => {
    const active = { ...createSanctuaryActive(1000, 300), encounterIndex: 1 };
    const next = { ...active, currentNodeId: "supply", encounterIndex: 0, visitedNodeIds: ["wreckage_outer", "supply"], completedNodeIds: ["wreckage_outer"] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ...parseSanctuaryState({}), revision: 3, active }))
      .mockResolvedValueOnce(response({ ...parseSanctuaryState({}), revision: 4, active: next }));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);
    fireEvent.click(await screen.findByRole("button", { name: /성소 외곽, 현재/ }));
    fireEvent.click(screen.getByRole("button", { name: "전투 시작" }));
    await screen.findByRole("button", { name: /탐험대 보급품, 현재/ });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "fight", expectedRevision: 3 });
    fireEvent.click(screen.getByRole("button", { name: /탐험대 보급품, 현재/ }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: /응급 식량/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("future and completed nodes only open information without making requests", async () => {
    const active = { ...createSanctuaryActive(1000, 300), currentNodeId: "supply", visitedNodeIds: ["wreckage_outer", "supply"], completedNodeIds: ["wreckage_outer"] };
    const fetchMock = vi.fn().mockResolvedValue(response({ ...parseSanctuaryState({}), revision: 7, active }));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);
    fireEvent.click(await screen.findByRole("button", { name: /태초의 문지기, 잠김/ }));
    expect(screen.getByRole("dialog").textContent).toContain("앞선 지점을 완료");
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "전투 시작" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    fireEvent.click(screen.getByRole("button", { name: /성소 외곽, 완료/ }));
    expect(screen.getByRole("dialog").textContent).toContain("완료한 지점");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
