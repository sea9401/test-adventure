// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./GameStateRefreshContext", () => ({ useRefreshGameState: () => vi.fn() }));
vi.mock("./ReplayBattleScene", () => ({ ReplayBattleScene: () => <div>전투 기록</div> }));
const confirmGameAction = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/components/ui/gameDialog", () => ({ confirmGameAction }));
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
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "start", difficulty: "normal", expectedRevision: 0 });
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
  it("runs the remaining attempts with the chosen preferences and shows each run", async () => {
    const state = parseSanctuaryState({ autoPreferences: { camp: ["meditation"] } });
    const done = { ...parseSanctuaryState({}), revision: 5, attemptsUsed: 3 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ...state, revision: 4 }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, unlocked: true, attemptsLeft: 0, state: done, auto: { runs: [
        { difficulty: "normal", cleared: true, endedAt: "태초의 문지기", gainedEmblems: [{ iid: "a", kind: "hp", grade: 1 }], lostEmblems: 0 },
        { difficulty: "hard", cleared: false, endedAt: "문장의 파수꾼", gainedEmblems: [], lostEmblems: 4 },
      ] } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);
    const camp = (await screen.findByLabelText("고요한 샘")) as HTMLSelectElement;
    expect(camp.value).toBe("meditation");
    fireEvent.change(screen.getByLabelText("탐험대 보급품"), { target: { value: "storm_oil" } });
    fireEvent.change(screen.getByLabelText("태초의 제단 2순위"), { target: { value: "tempest_might" } });
    expect((screen.getByLabelText("태초의 제단 1순위") as HTMLSelectElement).value).toBe("storm_guard");
    fireEvent.click(screen.getByRole("button", { name: "남은 입장 2회 일괄 진행" }));
    await screen.findByText("일괄 진행 결과");
    expect(confirmGameAction).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toMatchObject({ action: "auto", difficulty: "normal", expectedRevision: 4 });
    expect(body.preferences.supply[0]).toBe("storm_oil");
    expect(body.preferences.camp[0]).toBe("meditation");
    expect(body.preferences.altar.slice(0, 2)).toEqual(["storm_guard", "tempest_might"]);
    expect(screen.getByText("1회차 노말 · 클리어 · 문장 1개")).toBeTruthy();
    expect(screen.getByText("2회차 하드 · 문장의 파수꾼에서 패배 · 임시 문장 4개 잃음")).toBeTruthy();
    expect((screen.getByRole("button", { name: /일괄 진행/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("enters and auto-runs on the selected difficulty and shows its reward rates", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(parseSanctuaryState({})))
      .mockResolvedValueOnce(response({ ...parseSanctuaryState({}), revision: 1, active: createSanctuaryActive(1000, 300), difficulty: "hard" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);
    const rates = await screen.findByTestId("sanctuary-rates");
    expect(rates.textContent).toContain("최종 보스 1개 확정");
    fireEvent.click(screen.getByRole("button", { name: "하드" }));
    expect(rates.textContent).toContain("정예·수호자 30%");
    expect(rates.textContent).toContain("최종 보스 2개 확정");
    expect(rates.textContent).toContain("1등급 70% · 2등급 25% · 3등급 5%");
    fireEvent.click(screen.getByRole("button", { name: /성소 외곽, 이동 가능/ }));
    fireEvent.click(screen.getByRole("button", { name: "성소 입장" }));
    await screen.findByText(/하드 진행 중/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "start", difficulty: "hard", expectedRevision: 0 });
  });
  it("shows the hard boss reward on the final node of a hard run", async () => {
    const active = { ...createSanctuaryActive(1000, 300), currentNodeId: "storm_heart",
      visitedNodeIds: ["wreckage_outer", "supply", "wreckage_middle", "wreckage_camp", "wreckage_elite", "altar", "wreckage_guardian", "final_prep", "storm_heart"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...parseSanctuaryState({}), active, difficulty: "hard" })));
    render(<V2SanctuaryDungeonView />);
    fireEvent.click(await screen.findByRole("button", { name: /태초의 문지기, 현재/ }));
    expect(screen.getByRole("dialog").textContent).toContain("문장 2개 확정");
  });
});
