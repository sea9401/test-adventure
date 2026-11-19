// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeddlerView } from "./PeddlerView";
import type { PeddlerPostResult, PeddlerViewData } from "./peddlerClient";

vi.mock("@/components/ui/gameDialog", () => ({ confirmGameAction: vi.fn(async () => true) }));

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function viewData(overrides: Partial<PeddlerViewData> = {}): PeddlerViewData {
  return {
    now: NOW,
    weekId: "2026-11-16",
    weekEndsAt: new Date(NOW + 5 * 24 * HOUR).toISOString(),
    unlocked: true,
    tokens: 120,
    tokenCarry: 0,
    totalRank: 3,
    routes: [
      {
        id: "river",
        name: "강나루 장터",
        unlocked: true,
        rank: 3,
        standingPoints: 40_000,
        nextRankAt: 56_000,
        capacity: 2_600,
        preferred: [
          { id: "farm:milk", name: "우유" },
          { id: "material:v2_coal", name: "석탄" },
        ],
        dispatch: null,
      },
      {
        id: "ridge",
        name: "산마루 광산촌",
        unlocked: true,
        rank: 0,
        standingPoints: 0,
        nextRankAt: 6_000,
        capacity: 2_000,
        preferred: [
          { id: "farm:wheat", name: "밀" },
          { id: "fish:catch_fresh", name: "신선한 어획물" },
        ],
        dispatch: { hours: 8, startedAt: NOW - 8 * HOUR, readyAt: NOW, points: 2_000, tokens: 14 },
      },
      {
        id: "harbor",
        name: "남쪽 항구",
        unlocked: false,
        rank: 0,
        standingPoints: 0,
        nextRankAt: 6_000,
        capacity: 2_000,
        preferred: [
          { id: "farm:egg", name: "달걀" },
          { id: "material:v2_iron_ore", name: "철광석" },
        ],
        dispatch: null,
      },
    ],
    cargo: [
      { id: "material:v2_iron_ore", group: "ore", name: "철광석", points: 2, held: 5_000 },
      { id: "farm:milk", group: "ranch", name: "우유", points: 40, held: 20 },
    ],
    shop: [
      { id: "master_alloy", name: "명장 합금", tokenCost: 30, weeklyLimit: 5, purchased: 4 },
      { id: "compound_feed", name: "배합 사료 10개", tokenCost: 10, weeklyLimit: null, purchased: 0 },
    ],
    ...overrides,
  };
}

let posted: Record<string, unknown>[] = [];
let postResult: PeddlerPostResult;

function stubFetch(view: PeddlerViewData) {
  posted = [];
  postResult = { ok: true, view };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => postResult };
      }
      return { ok: true, json: async () => ({ ok: true, ...view }) };
    }),
  );
}

describe("PeddlerView", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("교역로마다 교역 등급, 적재량, 우대 품목을 보여 준다", async () => {
    stubFetch(viewData());
    render(<PeddlerView onBack={() => {}} />);
    const river = await screen.findByRole("region", { name: "강나루 장터" });
    expect(within(river).getByText(/교역 3등급/)).toBeTruthy();
    expect(within(river).getByText(/적재량 2,600점/)).toBeTruthy();
    expect(within(river).getByText(/우유, 석탄/)).toBeTruthy();
    expect(within(river).getByText(/다음 등급까지 16,000점/)).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();

    const harbor = screen.getByRole("region", { name: "남쪽 항구" });
    expect(within(harbor).getByText("교역 등급 합계 10에 열립니다.")).toBeTruthy();
    expect(within(harbor).queryByRole("button", { name: /짐 싣기/ })).toBeNull();
  });

  it("생활 레벨이 모자라면 조건을 알려 주고 교역로를 보여 주지 않는다", async () => {
    stubFetch(viewData({ unlocked: false }));
    render(<PeddlerView onBack={() => {}} />);
    expect(await screen.findByText(/Lv\.50/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "강나루 장터" })).toBeNull();
  });

  it("짐을 골라 출발하면 고른 품목과 시간을 보낸다", async () => {
    stubFetch(viewData());
    postResult = { ok: true, view: viewData(), dispatched: { routeId: "river", tokens: 21, readyAt: NOW + 12 * HOUR } };
    render(<PeddlerView onBack={() => {}} />);
    const river = await screen.findByRole("region", { name: "강나루 장터" });
    fireEvent.click(within(river).getByRole("button", { name: "짐 싣기" }));

    // 아무것도 싣지 않으면 출발할 수 없다.
    const depart = within(river).getByRole("button", { name: "출발" }) as HTMLButtonElement;
    expect(depart.disabled).toBe(true);

    fireEvent.change(within(river).getByLabelText("철광석 수량"), { target: { value: "500" } });
    fireEvent.click(within(river).getByRole("button", { name: "우유 최대" }));
    // 500×2 + 20×40 = 1,800점. 우유는 우대 품목이라 (1,800 + 400) × 14 ÷ 2,000 = 15.4
    expect(within(river).getByText(/1,800 \/ 2,600점/)).toBeTruthy();
    expect(within(river).getByText(/받을 증표 15개/)).toBeTruthy();

    fireEvent.click(within(river).getByRole("button", { name: "12시간" }));
    expect(within(river).getByText(/받을 증표 18개/)).toBeTruthy();
    fireEvent.click(depart);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      action: "dispatch",
      routeId: "river",
      hours: 12,
      cargo: { "material:v2_iron_ore": 500, "farm:milk": 20 },
    });
    expect(await screen.findByText(/강나루 장터 출발/)).toBeTruthy();
  });

  it("적재량을 넘기면 출발할 수 없다", async () => {
    stubFetch(viewData());
    render(<PeddlerView onBack={() => {}} />);
    const river = await screen.findByRole("region", { name: "강나루 장터" });
    fireEvent.click(within(river).getByRole("button", { name: "짐 싣기" }));
    fireEvent.change(within(river).getByLabelText("철광석 수량"), { target: { value: "1400" } });
    expect(within(river).getByText(/2,800 \/ 2,600점/)).toBeTruthy();
    expect((within(river).getByRole("button", { name: "출발" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("도착한 수레를 받는다", async () => {
    stubFetch(viewData());
    postResult = {
      ok: true,
      view: viewData(),
      claimed: { routeId: "ridge", tokens: 14, points: 2_000, rankBefore: 0, rankAfter: 1, titleNames: [] },
    };
    render(<PeddlerView onBack={() => {}} />);
    const ridge = await screen.findByRole("region", { name: "산마루 광산촌" });
    fireEvent.click(within(ridge).getByRole("button", { name: "받기" }));
    await waitFor(() => expect(posted).toEqual([{ action: "claim", routeId: "ridge" }]));
    expect(await screen.findByText(/증표 \+14 · 교역 점수 \+2,000 · 교역 1등급/)).toBeTruthy();
  });

  it("파견 중인 수레는 남은 시간과 받을 증표를 보여 준다", async () => {
    const data = viewData();
    data.routes[1].dispatch = { hours: 8, startedAt: NOW - HOUR, readyAt: NOW + 7 * HOUR, points: 2_000, tokens: 14 };
    stubFetch(data);
    render(<PeddlerView onBack={() => {}} />);
    const ridge = await screen.findByRole("region", { name: "산마루 광산촌" });
    expect(within(ridge).getByText(/7시간 0분 남음/)).toBeTruthy();
    expect(within(ridge).getByText(/증표 14개/)).toBeTruthy();
    expect(within(ridge).queryByRole("button", { name: "받기" })).toBeNull();
  });

  it("교환 탭에서 증표로 품목을 바꾼다", async () => {
    stubFetch(viewData());
    postResult = { ok: true, view: viewData({ tokens: 90 }), bought: { id: "master_alloy", name: "명장 합금", quantity: 1 } };
    render(<PeddlerView onBack={() => {}} />);
    await screen.findByRole("region", { name: "강나루 장터" });
    fireEvent.click(screen.getByRole("button", { name: "증표 교환" }));
    const alloy = screen.getByTestId("peddler-shop-master_alloy");
    expect(within(alloy).getByText(/이번 주 4 \/ 5/)).toBeTruthy();
    fireEvent.click(within(alloy).getByRole("button", { name: "교환" }));
    await waitFor(() => expect(posted).toEqual([{ action: "buy", itemId: "master_alloy", quantity: 1 }]));
    expect(await screen.findByText("명장 합금 교환 완료")).toBeTruthy();

    const feed = screen.getByTestId("peddler-shop-compound_feed");
    fireEvent.change(within(feed).getByLabelText("배합 사료 10개 수량"), { target: { value: "3" } });
    fireEvent.click(within(feed).getByRole("button", { name: "교환" }));
    await waitFor(() => expect(posted[1]).toEqual({ action: "buy", itemId: "compound_feed", quantity: 3 }));
  });

  it("요청이 실패하면 이유를 보여 준다", async () => {
    stubFetch(viewData());
    postResult = { ok: false, error: "not_ready" };
    render(<PeddlerView onBack={() => {}} />);
    const ridge = await screen.findByRole("region", { name: "산마루 광산촌" });
    fireEvent.click(within(ridge).getByRole("button", { name: "받기" }));
    expect(await screen.findByText("수레가 아직 돌아오지 않았습니다.")).toBeTruthy();
  });
});
