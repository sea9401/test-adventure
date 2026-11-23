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
    fireEvent.click(await screen.findByRole("button", { name: "노말" }));
    fireEvent.click(screen.getByRole("button", { name: /성소 외곽, 이동 가능/ }));
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
    fireEvent.click(screen.getByRole("button", { name: "노말" }));
    fireEvent.click(screen.getByRole("button", { name: "남은 입장 2회 일괄 진행" }));
    await screen.findByText("자동 진행 결과");
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
  it("runs a single attempt automatically and leaves the remaining attempts", async () => {
    const after = { ...parseSanctuaryState({}), revision: 5, attemptsUsed: 2 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ...parseSanctuaryState({}), revision: 4 }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, unlocked: true, attemptsLeft: 1, state: after, auto: { runs: [
        { difficulty: "hard", cleared: true, endedAt: "태초의 문지기", gainedEmblems: [{ iid: "a", kind: "hp", grade: 1 }], lostEmblems: 0 },
      ] } }) });
    vi.stubGlobal("fetch", fetchMock);
    confirmGameAction.mockClear();
    render(<V2SanctuaryDungeonView />);
    const single = (await screen.findByRole("button", { name: "1회만 자동 진행" })) as HTMLButtonElement;
    expect(single.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "하드" }));
    expect(single.disabled).toBe(false);
    fireEvent.click(single);
    await screen.findByText("자동 진행 결과");
    expect(confirmGameAction).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("탐험 1회를") }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ action: "auto", difficulty: "hard", maxRuns: 1, expectedRevision: 4 });
    expect(screen.getByText("1회차 하드 · 클리어 · 문장 1개")).toBeTruthy();
    expect((screen.getByRole("button", { name: "남은 입장 1회 일괄 진행" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("finishes only the in-progress run automatically without choosing a difficulty", async () => {
    const active = createSanctuaryActive(1000, 300);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ...parseSanctuaryState({}), active }))
      .mockResolvedValueOnce(response({ ...parseSanctuaryState({}), revision: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);
    const single = (await screen.findByRole("button", { name: "진행 중인 탐험만 자동 진행" })) as HTMLButtonElement;
    expect(single.disabled).toBe(false);
    fireEvent.click(single);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toMatchObject({ action: "auto", maxRuns: 1 });
    expect(body.difficulty).toBeUndefined();
  });
  it("blocks entry and auto-run until a difficulty is chosen", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(parseSanctuaryState({})));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);
    const rates = await screen.findByTestId("sanctuary-rates");
    expect(rates.textContent).toContain("난이도를 선택");
    expect(screen.getByRole("button", { name: "노말" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "하드" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "노말" }).className).toContain("bg-emerald-50");
    expect(screen.getByRole("button", { name: "하드" }).className).toContain("bg-rose-50");
    expect((screen.getByRole("button", { name: /일괄 진행$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /성소 외곽, 이동 가능/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("난이도를 먼저 선택");
    expect((within(dialog).getByRole("button", { name: "성소 입장" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "확인" }));
    fireEvent.click(screen.getByRole("button", { name: "하드" }));
    expect((screen.getByRole("button", { name: "남은 입장 2회 일괄 진행" }) as HTMLButtonElement).disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("lets an active run continue in batch without choosing a difficulty when no attempts are left", async () => {
    const active = createSanctuaryActive(1000, 300);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, unlocked: true, attemptsLeft: 0, state: { ...parseSanctuaryState({}), active } }) }));
    render(<V2SanctuaryDungeonView />);
    expect((await screen.findByRole("button", { name: "진행 중인 탐험과 남은 입장 0회 일괄 진행" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("enters and auto-runs on the selected difficulty and shows its reward rates", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(parseSanctuaryState({})))
      .mockResolvedValueOnce(response({ ...parseSanctuaryState({}), revision: 1, active: createSanctuaryActive(1000, 300), difficulty: "hard" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);
    const rates = await screen.findByTestId("sanctuary-rates");
    fireEvent.click(screen.getByRole("button", { name: "노말" }));
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
  it("하드를 고르면 열린 심층 단계를 고를 수 있고 그 단계로 입장한다", async () => {
    const deepStatus = (state: unknown, deep: { best: number; maxSelectable: number }) => ({
      ok: true, json: async () => ({ ok: true, unlocked: true, attemptsLeft: 2, state, deep }),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(deepStatus({ ...parseSanctuaryState({}), clears: 9, deepBest: 2 }, { best: 2, maxSelectable: 3 }))
      .mockResolvedValueOnce(deepStatus({ ...parseSanctuaryState({}), revision: 1, difficulty: "hard", active: { ...createSanctuaryActive(1000, 300), deepStage: 3 } }, { best: 2, maxSelectable: 3 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);

    fireEvent.click(await screen.findByRole("button", { name: "노말" }));
    expect(screen.queryByRole("combobox", { name: "심층 단계" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "하드" }));
    const select = screen.getByRole("combobox", { name: "심층 단계" }) as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "심층 없음(하드)",
      "1단계 · 증표 12개",
      "2단계 · 증표 14개",
      "3단계 · 증표 16개",
    ]);
    expect(screen.getByText("최고 완주 2단계")).toBeTruthy();
    fireEvent.change(select, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /성소 외곽, 이동 가능/ }));
    fireEvent.click(screen.getByRole("button", { name: "성소 입장" }));

    await screen.findByRole("button", { name: /성소 외곽, 현재/ });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "start", difficulty: "hard", deepStage: 3, expectedRevision: 0 });
    expect(screen.getByText(/하드 · 심층 3단계 진행 중/)).toBeTruthy();
  });
  it("완주 기록이 없으면 심층이 잠겨 있다고 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, unlocked: true, attemptsLeft: 3, state: parseSanctuaryState({}), deep: { best: 0, maxSelectable: 0 } }),
    }));
    render(<V2SanctuaryDungeonView />);

    fireEvent.click(await screen.findByRole("button", { name: "하드" }));

    expect(screen.queryByRole("combobox", { name: "심층 단계" })).toBeNull();
    expect(screen.getByText("성소를 한 번 완주하면 심층 1단계가 열립니다.")).toBeTruthy();
  });
  it("심층을 완주하면 받은 증표를 알린다", async () => {
    const path = ["wreckage_outer", "supply", "wreckage_middle", "wreckage_camp", "wreckage_elite", "altar", "wreckage_guardian", "final_prep", "storm_heart"];
    const active = { ...createSanctuaryActive(1000, 300), deepStage: 4, currentNodeId: "storm_heart", visitedNodeIds: path, completedNodeIds: path.slice(0, -1) };
    const base = parseSanctuaryState({});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, unlocked: true, attemptsLeft: 0, state: { ...base, revision: 2, difficulty: "hard", active }, deep: { best: 3, maxSelectable: 4 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, unlocked: true, attemptsLeft: 0, state: { ...base, revision: 3, deepBest: 4 }, deep: { best: 4, maxSelectable: 5 }, success: true, finalClear: true, gainedEmblems: [], deepTokensGained: 18, enemyName: "태초의 수호자" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<V2SanctuaryDungeonView />);

    const current = await screen.findByRole("button", { name: /, 현재/ });
    fireEvent.click(current);
    fireEvent.click(screen.getByRole("button", { name: "전투 시작" }));

    expect(await screen.findByText("심층 증표 18개를 받았습니다.")).toBeTruthy();
  });
});
