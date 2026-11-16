// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { CodexEquipmentPanel } from "./CodexEquipmentPanel";
import { MARKETPLACE_FAVORITES_KEY } from "./marketplace/marketplaceFavorites";

// 장비 도감 첫 화면(무기 1쪽)에 나오는 두 장비.
const [first, second] = Object.values(V2_EQUIPMENT)
  .filter((item) => item.slot === "weapon")
  .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, "ko"));

function storedFavorites(): string[] {
  return JSON.parse(localStorage.getItem(MARKETPLACE_FAVORITES_KEY) ?? "[]");
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ ok: true, registeredIds: [], owned: [], equipped: {} }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("장비 도감의 거래소 즐겨찾기", () => {
  it("별표를 누르면 거래소 즐겨찾기와 같은 저장소에 장비 종류가 들어간다", async () => {
    render(<CodexEquipmentPanel onShowCard={vi.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: `${first.name} 거래소 즐겨찾기 추가`,
      }),
    );

    expect(storedFavorites()).toEqual([`equip:${first.id}`]);
    expect(
      screen
        .getByRole("button", { name: `${first.name} 거래소 즐겨찾기 해제` })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("거래소에서 단 별표를 보여 주고, 해제해도 다른 품목 즐겨찾기는 남긴다", async () => {
    localStorage.setItem(
      MARKETPLACE_FAVORITES_KEY,
      JSON.stringify(["material:iron_ore", `equip:${first.id}`]),
    );
    render(<CodexEquipmentPanel onShowCard={vi.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: `${first.name} 거래소 즐겨찾기 해제`,
      }),
    );

    expect(storedFavorites()).toEqual(["material:iron_ore"]);
  });

  it("즐겨찾기만 보기를 켜면 별표한 장비만 남는다", async () => {
    localStorage.setItem(
      MARKETPLACE_FAVORITES_KEY,
      JSON.stringify([`equip:${second.id}`]),
    );
    render(<CodexEquipmentPanel onShowCard={vi.fn()} />);
    await screen.findByRole("button", {
      name: `${second.name} 거래소 즐겨찾기 해제`,
    });

    fireEvent.click(screen.getByRole("button", { name: /즐겨찾기만 보기/ }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: `${first.name} 거래소 즐겨찾기 추가`,
        }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("button", {
        name: `${second.name} 거래소 즐겨찾기 해제`,
      }),
    ).toBeTruthy();
  });
});
