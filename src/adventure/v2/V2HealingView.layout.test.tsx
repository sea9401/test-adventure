import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/v2/GameStateProvider", () => ({
  useGameResourceState: () => ({ coreLoopOn: true, applyResourcePatch: vi.fn() }),
}));
vi.mock("./RewardToastProvider", () => ({
  useSystemToast: () => ({ notifySystem: vi.fn() }),
}));
vi.mock("./fetchGameState", () => ({
  fetchGameState: () => new Promise(() => undefined),
}));

import { Button } from "@/components/ui/Button";
import { FullChargeButton, V2HealingView } from "./V2HealingView";

describe("치료소 버튼 위계", () => {
  it("전부 회복은 위험 색이 아니라 주 행동 버튼이다", () => {
    const html = renderToStaticMarkup(<V2HealingView onBack={vi.fn()} />);
    const healButton = html.match(/<button[^>]*>(?:(?!<\/button>).)*?\.\.\.(?:(?!<\/button>).)*<\/button>/)?.[0] ?? "";

    expect(healButton).toContain("bg-primary");
    expect(healButton).not.toContain("bg-rose-600");
  });

  it("가득 충전은 공용 버튼을 쓴다", () => {
    const element = FullChargeButton({ kind: "hp", current: 0, gold: 10, busy: false, onBuy: vi.fn() });

    expect(element.type).toBe(Button);
  });
});
