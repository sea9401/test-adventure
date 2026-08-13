import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  GameStateRefreshProvider,
  useRefreshGameState,
} from "./GameStateRefreshContext";

describe("GameStateRefreshContext", () => {
  it("provides the stable refresh callback", () => {
    const refreshGameState = vi.fn(async () => {});
    let captured: (() => Promise<void>) | null = null;

    function Consumer() {
      captured = useRefreshGameState();
      return <span>ready</span>;
    }

    const html = renderToStaticMarkup(
      <GameStateRefreshProvider refreshGameState={refreshGameState}>
        <Consumer />
      </GameStateRefreshProvider>,
    );

    expect(html).toContain("ready");
    expect(captured).toBe(refreshGameState);
  });

  it("fails clearly outside the provider", () => {
    function Consumer() {
      useRefreshGameState();
      return null;
    }

    expect(() => renderToStaticMarkup(<Consumer />)).toThrow(
      "useRefreshGameState must be used inside <GameStateProvider>",
    );
  });
});
