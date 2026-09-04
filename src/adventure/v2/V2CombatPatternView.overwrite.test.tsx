// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const currentBlocks = [
  {
    condition: { kind: "always" as const },
    action: { kind: "role" as const, role: "main_attack" as const },
  },
];

vi.mock("./fetchGameState", () => ({
  fetchGameState: vi.fn(async () =>
    new Response(
      JSON.stringify({
        ok: true,
        skills: {
          equipped: [],
          library: [],
          pattern: { blocks: currentBlocks },
          presets: [
            {
              name: "보스용",
              pattern: {
                blocks: [
                  {
                    condition: { kind: "self_hp", op: "below", pct: 50 },
                    action: { kind: "basic_attack" },
                  },
                ],
              },
            },
          ],
        },
      }),
      { headers: { "content-type": "application/json" } },
    ),
  ),
}));

vi.mock("./presetConfirmation", () => ({
  confirmPresetOverwrite: vi.fn(
    async ({ onConfirm }: { onConfirm: () => void | Promise<void> }) => {
      await onConfirm();
      return true;
    },
  ),
}));

import { V2CombatPatternView } from "./V2CombatPatternView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("스킬 패턴 프리셋 덮어쓰기", () => {
  it("현재 패턴으로 선택한 프리셋을 확인 후 덮어쓴다", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          presets: [{ name: "보스용", pattern: { blocks: currentBlocks } }],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<V2CombatPatternView onBack={vi.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "보스용 프리셋을 현재 패턴으로 덮어쓰기",
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/me/combat-pattern/presets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          presets: [{ name: "보스용", pattern: { blocks: currentBlocks } }],
        }),
      }),
    );
    expect(await screen.findByText("✓ 프리셋 '보스용' 덮어쓰기 완료")).toBeTruthy();
  });
});
