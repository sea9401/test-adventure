import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { FullChargeButton } from "./V2HealingView";

describe("FullChargeButton", () => {
  it("shows and submits the affordable full-charge amount", () => {
    const onBuy = vi.fn();
    const button = FullChargeButton({
      kind: "hp",
      current: 400_000,
      gold: 140_764,
      busy: false,
      onBuy,
    });

    expect(button.props.children).toBe("가득 (140,764g)");
    expect(button.props.disabled).toBe(false);
    button.props.onClick({} as MouseEvent<HTMLButtonElement>);
    expect(onBuy).toHaveBeenCalledWith("hp", 140_764);
  });

  it("is disabled when no gold can be spent", () => {
    const button = FullChargeButton({
      kind: "mp",
      current: 400_000,
      gold: 0,
      busy: false,
      onBuy: vi.fn(),
    });

    expect(button.props.children).toBe("가득 (0g)");
    expect(button.props.disabled).toBe(true);
  });
});
