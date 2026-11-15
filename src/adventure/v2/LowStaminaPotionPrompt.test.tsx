// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameResourceContext, type GameResourceState } from "./GameResourceContext";
import { GameStateRefreshProvider } from "./GameStateRefreshContext";
import { LowStaminaPotionPrompt } from "./LowStaminaPotionPrompt";

const refreshGameState = vi.fn(async () => {});
let bodies: unknown[] = [];

function renderPrompt(staminaPotions: number) {
  bodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return { ok: true, json: async () => ({ ok: true }) };
    }),
  );
  return render(
    <GameResourceContext.Provider value={{ staminaPotions } as GameResourceState}>
      <GameStateRefreshProvider refreshGameState={refreshGameState}>
        <LowStaminaPotionPrompt />
      </GameStateRefreshProvider>
    </GameResourceContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refreshGameState.mockClear();
});

describe("LowStaminaPotionPrompt", () => {
  it("회복약이 없으면 아무것도 보여 주지 않는다", () => {
    expect(renderPrompt(0).container.innerHTML).toBe("");
  });

  it("게임 상태 공급자 밖에서는 아무것도 보여 주지 않는다", () => {
    expect(render(<LowStaminaPotionPrompt />).container.innerHTML).toBe("");
  });

  it("가진 회복약 수와 회복량을 알려 주고 한 개를 쓰면 상태를 새로 읽는다", async () => {
    renderPrompt(7);
    expect(screen.getByText(/스태미나 회복약 7개/)).toBeTruthy();
    expect(screen.getByText(/스태미너 200을 회복/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1개 사용" }));
    await waitFor(() => expect(refreshGameState).toHaveBeenCalled());
    expect(bodies).toEqual([{ count: 1 }]);
  });

  it("여러 개를 가졌으면 한 번에 쓰는 버튼을 함께 보여 준다", async () => {
    renderPrompt(7);
    fireEvent.click(screen.getByRole("button", { name: "7개 사용" }));
    await waitFor(() => expect(bodies).toEqual([{ count: 7 }]));
  });

  it("한 번에 쓰는 수량은 10개까지다", () => {
    renderPrompt(69);
    expect(screen.getByRole("button", { name: "10개 사용" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "69개 사용" })).toBeNull();
  });

  it("한 개뿐이면 버튼도 하나다", () => {
    renderPrompt(1);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
