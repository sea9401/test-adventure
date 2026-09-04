// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MiningView } from "./MiningView";
import { WoodcuttingView } from "./WoodcuttingView";

afterEach(cleanup);

const pendingStart = () => new Promise<never>(() => {});
const unusedAsyncHandler = vi.fn(async () => undefined);

describe("채집 작업 중 숙련도 표시", () => {
  it("벌목을 시작한 뒤에도 현재 벌목 레벨과 경험치를 표시한다", () => {
    render(
      <WoodcuttingView
        start={pendingStart}
        finish={pendingStart}
        materials={{}}
        log={{ cuts: 0, xp: 0, timberEarned: 0 }}
        durationReductionPct={0}
        autoSession={null}
        autoResult={null}
        autoLoading={false}
        activeAutoActivity={null}
        startAuto={unusedAsyncHandler}
        claimAuto={unusedAsyncHandler}
        cancelAuto={unusedAsyncHandler}
        onBack={vi.fn()}
        spotId="pine_grove"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "소나무숲에서 벌목 시작" }),
    );

    expect(screen.getByText("벌목 Lv 1 / 100")).toBeDefined();
    expect(screen.getByText("0/40 XP")).toBeDefined();
  });

  it("채광을 시작한 뒤에도 현재 채광 레벨과 경험치를 표시한다", () => {
    render(
      <MiningView
        start={pendingStart}
        finish={pendingStart}
        materials={{}}
        log={{ successes: 0, xp: 0, oreEarned: 0, byproductsEarned: 0 }}
        autoSession={null}
        autoResult={null}
        autoLoading={false}
        activeAutoActivity={null}
        startAuto={unusedAsyncHandler}
        claimAuto={unusedAsyncHandler}
        cancelAuto={unusedAsyncHandler}
        onBack={vi.fn()}
        spotId="iron_quarry"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "철 채석장에서 채광 시작" }),
    );

    expect(screen.getByText("채광 Lv 1 / 100")).toBeDefined();
    expect(screen.getByText("0/40 XP")).toBeDefined();
  });
});
