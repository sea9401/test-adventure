// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WINTER_ROLLING_ENDS_AT,
  WINTER_SHOP_ENDS_AT,
  type WinterBoardView,
} from "@/adventure/data/v2/winterBoard";
import { WinterBoardContent } from "./V2WinterBoardView";

const BASE: WinterBoardView = {
  ok: true,
  phase: "active",
  rollingEndsAt: WINTER_ROLLING_ENDS_AT,
  shopEndsAt: WINTER_SHOP_ENDS_AT,
  serverNow: Date.parse("2026-11-20T12:00:00+09:00"),
  position: 3,
  laps: 4,
  dice: 2,
  coins: 70,
  today: { visitGranted: true, questDiceGranted: 1, questDiceCap: 4 },
  milestones: [
    { laps: 3, label: "스태미나 회복약 3개", claimed: false, claimable: true },
    { laps: 6, label: "숙련 증서 30개", claimed: false, claimable: false },
  ],
  shop: [
    { id: "mastery_certificate", name: "숙련 증서 10개", cost: 15, limit: 20, purchased: 0 },
    { id: "enchant_scroll", name: "마법부여서 1장", cost: 60, limit: 3, purchased: 3 },
    { id: "title_trailblazer", name: "칭호 ‘눈길의 개척자’", cost: 400, limit: 1, purchased: 0 },
  ],
  recentRolls: [],
  pending: 3,
};

function renderContent(patch: Partial<WinterBoardView> = {}, handlers = {}) {
  const props = {
    onRoll: vi.fn(),
    onRollAll: vi.fn(),
    onClaim: vi.fn(),
    onBuy: vi.fn(),
    ...handlers,
  };
  render(
    <WinterBoardContent view={{ ...BASE, ...patch }} busy={null} lastResult={null} {...props} />,
  );
  return props;
}

afterEach(cleanup);

describe("겨울 말판 화면", () => {
  it("24칸을 그리고 내 위치를 표시한다", () => {
    renderContent();
    const board = screen.getByRole("list", { name: "겨울 말판" });
    const tiles = within(board).getAllByRole("listitem");
    expect(tiles).toHaveLength(24);
    const current = tiles.filter((tile) => tile.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain("3");
    expect(current[0]!.textContent).toContain("주화 5");
    expect(current[0]!.textContent).toContain("내 위치");
  });

  it("칸마다 종류에 맞는 그림을 보여 준다", () => {
    renderContent();
    const board = screen.getByRole("list", { name: "겨울 말판" });
    const tiles = within(board).getAllByRole("listitem");
    const art = (index: number) =>
      decodeURIComponent(tiles[index]!.querySelector("img")?.getAttribute("src") ?? "");
    expect(art(0)).toContain("/images/event/winter-tile-start.webp");
    expect(art(3)).toContain("/images/event/winter-tile-coins.webp");
    expect(art(4)).toContain("/images/event/winter-tile-again.webp");
    expect(art(6)).toContain("/images/event/winter-tile-potion.webp");
    expect(art(8)).toContain("/images/event/winter-tile-forward.webp");
    expect(tiles[8]!.textContent).toContain("앞으로 3칸");
  });

  it("주사위가 있으면 굴리기와 모두 굴리기를 누를 수 있다", () => {
    const props = renderContent();
    fireEvent.click(screen.getByRole("button", { name: "주사위 굴리기" }));
    fireEvent.click(screen.getByRole("button", { name: "모두 굴리기 (2개)" }));
    expect(props.onRoll).toHaveBeenCalledTimes(1);
    expect(props.onRollAll).toHaveBeenCalledTimes(1);
    expect(screen.getByText("주사위 2개")).toBeTruthy();
    expect(screen.getByText("주화 70개")).toBeTruthy();
    expect(screen.getByText("4바퀴")).toBeTruthy();
  });

  it("주사위가 없으면 굴릴 수 없고 얻는 방법을 알려 준다", () => {
    renderContent({ dice: 0 });
    expect(screen.getByRole("button", { name: "주사위 굴리기" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: /모두 굴리기/ })).toBeNull();
    expect(
      screen.getByText("매일 접속하면 1개, 일일 퀘스트를 하나 완료할 때마다 1개(하루 4개까지)를 받습니다."),
    ).toBeTruthy();
    expect(screen.getByText("오늘 받은 주사위: 접속 1/1 · 일일 퀘스트 1/4")).toBeTruthy();
  });

  it("받을 수 있는 바퀴 보상에만 받기 버튼이 있다", () => {
    const props = renderContent();
    const rewards = screen.getByRole("list", { name: "누적 바퀴 보상" });
    const buttons = within(rewards).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(props.onClaim).toHaveBeenCalledWith(3);
    expect(within(rewards).getByText("2바퀴 남음")).toBeTruthy();
  });

  it("한도에 닿았거나 주화가 모자란 품목은 교환할 수 없다", () => {
    const props = renderContent();
    const shop = screen.getByRole("list", { name: "겨울 교환소" });
    const [certificate, scroll, title] = within(shop).getAllByRole("listitem");
    fireEvent.click(within(certificate!).getByRole("button", { name: "교환" }));
    expect(props.onBuy).toHaveBeenCalledWith("mastery_certificate");
    expect(within(scroll!).getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(within(scroll!).getByText("3/3")).toBeTruthy();
    expect(within(title!).getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("굴리기가 끝난 뒤에는 굴리기 대신 교환 기간을 안내한다", () => {
    renderContent({ phase: "shop_only", dice: 5 });
    expect(screen.queryByRole("button", { name: "주사위 굴리기" })).toBeNull();
    expect(
      screen.getByText(
        "주사위 굴리기는 12월 10일에 끝났습니다. 바퀴 보상과 교환소는 12월 14일까지 이용할 수 있습니다.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("list", { name: "겨울 교환소" })).toBeTruthy();
  });

  it("굴린 결과를 요약해 보여 준다", () => {
    render(
      <WinterBoardContent
        view={BASE}
        busy={null}
        lastResult={{
          events: [
            { die: 4, from: 0, landed: 4, to: 4, tile: "again", coins: 0, potions: 0, diceRefund: 1, lapsGained: 0 },
            { die: 2, from: 4, landed: 6, to: 6, tile: "potion", coins: 0, potions: 1, diceRefund: 0, lapsGained: 0 },
            { die: 6, from: 22, landed: 4, to: 4, tile: "again", coins: 10, potions: 0, diceRefund: 1, lapsGained: 1 },
          ],
          coins: 10,
          potions: 1,
          lapsGained: 1,
        }}
        onRoll={vi.fn()}
        onRollAll={vi.fn()}
        onClaim={vi.fn()}
        onBuy={vi.fn()}
      />,
    );
    expect(
      screen.getByText("3번 굴림 · 주화 +10 · 회복약 +1 · 1바퀴 완주"),
    ).toBeTruthy();
  });
});
