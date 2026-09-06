// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as GameStateModule from "./GameStateProvider";
import { useRefreshGameState } from "./GameStateRefreshContext";

vi.mock("next/navigation", () => ({
  usePathname: () => "/adventure",
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/usePresenceHeartbeat", () => ({
  usePresenceHeartbeat: vi.fn(),
}));

type NarrowGameStateModule = typeof GameStateModule & {
  useGameIdentityState: () => { viewerName: string };
  useGameResourceState: () => {
    gold: number;
    applyResourcePatch: (patch: { gold: number }) => void;
  };
};

const narrowGameState = GameStateModule as NarrowGameStateModule;

describe("GameStateProvider narrow contexts", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not let a core response started before a resource patch overwrite gold", async () => {
    let resolveCore!: (response: Response) => void;
    const core = new Promise<Response>((resolve) => { resolveCore = resolve; });
    const fetchMock = vi.fn((url: string) => url === "/api/v2/me/state?view=core"
      ? core : Promise.resolve(new Response(null, { status: 503 })));
    vi.stubGlobal("fetch", fetchMock);
    function Probe() {
      const { gold, applyResourcePatch } = narrowGameState.useGameResourceState();
      return <button onClick={() => applyResourcePatch({ gold: 123 })}>gold:{gold}</button>;
    }
    render(<GameStateModule.GameStateProvider><Probe /></GameStateModule.GameStateProvider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v2/me/state?view=core"));
    fireEvent.click(screen.getByRole("button"));
    await act(async () => {
      resolveCore(Response.json({ character: { gold: 999 } }));
      await core;
    });
    expect(screen.getByText("gold:123")).toBeTruthy();
  });

  it("coalesces refreshes after a mutation and applies a fresh authoritative response", async () => {
    let resolveOld!: (response: Response) => void;
    const old = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const coreRead = vi.fn().mockReturnValueOnce(old)
      .mockResolvedValueOnce(Response.json({ character: { gold: 125 } }));
    vi.stubGlobal("fetch", vi.fn((url: string) => url === "/api/v2/me/state?view=core"
      ? coreRead() : Promise.resolve(new Response(null, { status: 503 }))));
    function Probe() {
      const { gold, applyResourcePatch } = narrowGameState.useGameResourceState();
      const refresh = useRefreshGameState();
      return <button onClick={() => {
        applyResourcePatch({ gold: 123 });
        for (let index = 0; index < 10; index += 1) void refresh();
      }}>gold:{gold}</button>;
    }
    render(<GameStateModule.GameStateProvider><Probe /></GameStateModule.GameStateProvider>);
    await waitFor(() => expect(coreRead).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("gold:123")).toBeTruthy();
    await act(async () => { resolveOld(Response.json({ character: { gold: 999 } })); });
    await waitFor(() => expect(screen.getByText("gold:125")).toBeTruthy());
    expect(coreRead).toHaveBeenCalledTimes(2);
  });

  it("does not rerender an identity-only consumer when gold changes", async () => {
    let identityRenders = 0;

    function IdentityProbe() {
      const { viewerName } = narrowGameState.useGameIdentityState();
      identityRenders += 1;
      return <output data-testid="identity">{viewerName}</output>;
    }

    function ResourceProbe() {
      const { gold, applyResourcePatch } =
        narrowGameState.useGameResourceState();
      return (
        <button onClick={() => applyResourcePatch({ gold: 123 })}>
          gold:{gold}
        </button>
      );
    }

    render(
      <GameStateModule.GameStateProvider>
        <IdentityProbe />
        <ResourceProbe />
      </GameStateModule.GameStateProvider>,
    );

    await waitFor(() => expect(screen.getByText("gold:0")).toBeTruthy());
    await act(async () => Promise.resolve());
    const rendersBeforeGoldChange = identityRenders;

    fireEvent.click(screen.getByRole("button", { name: "gold:0" }));

    expect(screen.getByRole("button", { name: "gold:123" })).toBeTruthy();
    expect(identityRenders).toBe(rendersBeforeGoldChange);
  });
});
