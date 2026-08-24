// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { V2ItemCard } from "./V2ItemCardPopover";

function rect(top: number, bottom: number): DOMRect {
  return {
    x: 0,
    y: top,
    width: 360,
    height: bottom - top,
    top,
    right: 360,
    bottom,
    left: 0,
    toJSON: () => ({}),
  };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("V2ItemCard 결합형 헤더 회피", () => {
  it("팝오버를 상단 행이 아니라 전체 sticky 게임 헤더 아래에 배치한다", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 640,
    });

    const gameHeader = document.createElement("header");
    gameHeader.dataset.gameHeader = "true";
    vi.spyOn(gameHeader, "getBoundingClientRect").mockReturnValue(rect(0, 128));

    const topBar = document.createElement("div");
    topBar.dataset.gameTopBar = "true";
    vi.spyOn(topBar, "getBoundingClientRect").mockReturnValue(rect(0, 52));
    gameHeader.append(topBar);
    document.body.append(gameHeader);

    render(
      <V2ItemCard
        item={V2_EQUIPMENT.v2_iron_sword}
        anchor={{ top: 20, bottom: 40, left: 30 }}
        onClose={() => undefined}
        codexRegistered
      />,
    );

    expect(screen.getByRole("dialog", { name: "철검 정보" }).style.top).toBe(
      "136px",
    );
  });
});
