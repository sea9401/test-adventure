// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { V2DungeonSelectionView } from "./V2DungeonSelectionView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("던전 선택 잠금 표시", () => {
  it("잠긴 던전은 입장 버튼 대신 자물쇠와 해금 조건을 보여 준다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(
          url.includes("storm")
            ? { ok: true, unlocked: false, attemptsLeft: 3 }
            : { ok: true, unlocked: true, attemptsLeft: 2 },
        ),
      ),
    );
    render(<V2DungeonSelectionView />);

    const lock = await screen.findByText("심해 폐허 최심부 돌파 후 입장 가능");
    expect(lock.closest("[data-locked='true']")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "폭풍 원정 입장" })).toBeNull();
    expect(screen.getByRole("button", { name: "태초의 성소 입장" })).toBeTruthy();
    expect(screen.getByText("남은 입장 2 / 3회")).toBeTruthy();
  });
});
