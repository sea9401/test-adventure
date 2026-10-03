import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const resource = vi.hoisted(() => ({ coreLoopOn: true }));

vi.mock("./GameResourceContext", () => ({
  useGameResourceState: () => ({
    gold: 50,
    bankedGold: 0,
    applyResourcePatch: vi.fn(),
    coreLoopOn: resource.coreLoopOn,
  }),
}));
vi.mock("./RewardToastProvider", () => ({
  useSystemToast: () => ({ notifySystem: vi.fn() }),
}));

import { BankPanel } from "./BankPanel";

function buttonWith(html: string, text: string): string {
  return (
    html
      .split("<button")
      .slice(1)
      .map((chunk) => `<button${chunk.split("</button>")[0]}</button>`)
      .find((button) => button.includes(text)) ?? ""
  );
}

describe("은행 버튼 위계", () => {
  it("전액 입금은 주 행동 버튼이다", () => {
    resource.coreLoopOn = true;
    const html = renderToStaticMarkup(<BankPanel />);

    expect(buttonWith(html, "전액 입금 (50G)")).toContain("bg-primary");
  });

  it("입금은 주 행동, 출금은 보조 버튼이다", () => {
    resource.coreLoopOn = false;
    const html = renderToStaticMarkup(<BankPanel />);

    expect(buttonWith(html, ">입금<")).toContain("bg-primary");
    expect(buttonWith(html, ">출금<")).not.toContain("bg-sky-600");
  });
});
