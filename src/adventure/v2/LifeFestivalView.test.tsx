// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeFestivalViewData } from "./lifeFestivalClient";
import { LifeFestivalView } from "./LifeFestivalView";

function baseView(overrides: Partial<LifeFestivalViewData> = {}): LifeFestivalViewData {
  return {
    weekId: "2026-10-12",
    endsAt: "2026-10-18T15:00:00.000Z",
    theme: {
      id: "harvest",
      name: "수확제",
      activity: "farming",
      activityName: "농사",
      effectText: "수확량 +10% · 농사 경험치 +25%",
    },
    tokens: 42,
    weeklyScore: 360,
    myRank: 4,
    orders: [
      {
        id: "harvest_egg",
        pool: "harvest",
        requirement: { kind: "ranch", itemId: "egg", quantity: 10 },
        label: "달걀 10개",
        baseTokens: 4,
        delivered: 0,
        nextMultiplier: 1,
        held: 25,
      },
      {
        id: "harvest_milk",
        pool: "harvest",
        requirement: { kind: "ranch", itemId: "milk", quantity: 6 },
        label: "우유 6개",
        baseTokens: 5,
        delivered: 5,
        nextMultiplier: 0.5,
        held: 2,
      },
      {
        id: "general_offense_dish",
        pool: "general",
        requirement: { kind: "dish", quantity: 3, minTier: 2, tag: "offense" },
        label: "공격 요리 (2등급 이상) 3개",
        baseTokens: 6,
        delivered: 0,
        nextMultiplier: 1,
        held: 4,
      },
    ],
    dishOptions: {
      general_offense_dish: [
        { foodId: "food2:a:normal:o0:s0", name: "구운 고기 (일반)", tier: 2, quality: "normal", count: 2 },
        { foodId: "food2:b:masterpiece:o0:s0", name: "왕실 스테이크 (걸작)", tier: 3, quality: "masterpiece", count: 2 },
      ],
    },
    shop: [
      { id: "feed_bundle", name: "배합 사료 5개", description: "목장 동물에게 먹이는 사료입니다.", tokenCost: 12, weeklyLimit: 5, purchased: 5, owned: false },
      { id: "fertilizer_bundle", name: "유기질 거름 3개", description: "밭의 재배 시간을 줄입니다.", tokenCost: 15, weeklyLimit: 5, purchased: 1, owned: false },
    ],
    ...overrides,
  };
}

type FetchCall = { url: string; method: string; body: unknown };
let calls: FetchCall[] = [];
let postResponse: { status: number; body: unknown } = { status: 200, body: {} };

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  calls = [];
  postResponse = { status: 200, body: {} };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url: input, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (input.startsWith("/api/v2/life-festival/ranking")) {
        const previous = input.includes("week=previous");
        return respond({
          ok: true,
          weekId: previous ? "2026-10-05" : "2026-10-12",
          top: [{ rank: 1, userId: "x", name: previous ? "지난주왕" : "이번주왕", score: 900 }],
          me: previous ? { rank: 41, score: 10 } : { rank: 4, score: 360 },
        });
      }
      if (method === "POST") return respond(postResponse.body, postResponse.status);
      return respond({ ok: true, ...baseView() });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderLoaded() {
  render(<LifeFestivalView onBack={vi.fn()} />);
  await screen.findByText("수확제");
}

describe("생활 축제 화면", () => {
  it("테마·효과·내 현황과 주문을 보여 준다", async () => {
    await renderLoaded();
    expect(screen.getByText("수확량 +10% · 농사 경험치 +25%")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("360")).toBeTruthy();
    expect(screen.getByText("달걀 10개")).toBeTruthy();
    expect(screen.getByText("우유 6개")).toBeTruthy();
  });

  it("보유가 부족한 주문은 납품할 수 없고, 6회째부터 보상 비율을 알려 준다", async () => {
    await renderLoaded();
    const milk = screen.getByTestId("festival-order-harvest_milk");
    expect((within(milk).getByRole("button", { name: "납품" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(milk).getByText(/다음 납품 보상 50%/)).toBeTruthy();
    const egg = screen.getByTestId("festival-order-harvest_egg");
    expect((within(egg).getByRole("button", { name: "납품" }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(egg).getByRole("button", { name: "2회 모두 납품" })).toBeTruthy();
  });

  it("납품에 성공하면 응답 현황으로 갱신하고 얻은 증표를 알린다", async () => {
    await renderLoaded();
    postResponse = {
      status: 200,
      body: { ok: true, gained: { tokens: 4, score: 40 }, view: baseView({ tokens: 46 }) },
    };
    fireEvent.click(
      within(screen.getByTestId("festival-order-harvest_egg")).getByRole("button", { name: "납품" }),
    );
    await screen.findByText(/증표 \+4/);
    expect(screen.getByText("46")).toBeTruthy();
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      action: "deliver",
      orderId: "harvest_egg",
      times: 1,
    });
  });

  it("오류 코드를 플레이어 문구로 보여 준다", async () => {
    await renderLoaded();
    postResponse = { status: 409, body: { ok: false, error: "not_enough_items" } };
    fireEvent.click(
      within(screen.getByTestId("festival-order-harvest_egg")).getByRole("button", { name: "납품" }),
    );
    await screen.findByText("재료가 부족합니다.");
  });

  it("요리 주문은 고르기 창에서 걸작을 빼고 기본 선택한다", async () => {
    await renderLoaded();
    fireEvent.click(
      within(screen.getByTestId("festival-order-general_offense_dish")).getByRole("button", { name: "요리 고르기" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("2 / 3개 선택")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "왕실 스테이크 (걸작) 1개 더" }));
    expect(within(dialog).getByText("3 / 3개 선택")).toBeTruthy();
    postResponse = { status: 200, body: { ok: true, gained: { tokens: 6, score: 60 }, view: baseView() } };
    fireEvent.click(within(dialog).getByRole("button", { name: "선택한 요리 납품" }));
    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      action: "deliver",
      orderId: "general_offense_dish",
      times: 1,
      foodIds: { "food2:a:normal:o0:s0": 2, "food2:b:masterpiece:o0:s0": 1 },
    });
  });

  it("주간 한도에 닿은 상품은 교환할 수 없다", async () => {
    await renderLoaded();
    const feed = screen.getByTestId("festival-shop-feed_bundle");
    expect(within(feed).getByText("이번 주 구매 완료")).toBeTruthy();
    expect((within(feed).getByRole("button", { name: "교환" }) as HTMLButtonElement).disabled).toBe(true);
    const fertilizer = screen.getByTestId("festival-shop-fertilizer_bundle");
    expect(within(fertilizer).getByText("이번 주 1/5")).toBeTruthy();
  });

  it("순위는 이번 주로 시작하고 지난 주로 바꿀 수 있다", async () => {
    await renderLoaded();
    await screen.findByText("이번주왕");
    fireEvent.click(screen.getByRole("button", { name: "지난 주" }));
    await screen.findByText("지난주왕");
    expect(screen.getByText("내 순위 41위")).toBeTruthy();
    expect(calls.map((call) => call.url)).toContain("/api/v2/life-festival/ranking?week=previous");
  });

  it("불투명 표면 토큰만 쓰고 반투명 배경을 만들지 않는다", async () => {
    const { container } = render(<LifeFestivalView onBack={vi.fn()} />);
    await screen.findByText("수확제");
    const html = container.innerHTML;
    expect(html).toContain("ui-surface-card");
    expect(html).toContain("ui-surface-inset");
    expect(html).not.toMatch(/bg-[a-z]+-\d+\/\d+/);
  });
});
