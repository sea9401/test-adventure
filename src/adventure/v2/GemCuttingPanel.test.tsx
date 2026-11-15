// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GemCuttingPanel } from "./GemCuttingPanel";
import type { GemCuttingView } from "./gemCuttingClient";

function view(overrides: Partial<GemCuttingView> = {}): GemCuttingView {
  return {
    miningLevel: 60,
    masterUnlocked: false,
    roughGems: 310,
    masterAlloy: 7,
    cutGems: { polished: 4, refined: 1, flawless: 0 },
    ...overrides,
  };
}

function toResponse(value: GemCuttingView, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    miningLevel: value.miningLevel,
    masterUnlocked: value.masterUnlocked,
    roughGems: value.roughGems,
    masterAlloy: value.masterAlloy,
    cutGems: {
      v2_cut_gem_polished: value.cutGems.polished,
      v2_cut_gem_refined: value.cutGems.refined,
      v2_cut_gem_flawless: value.cutGems.flawless,
    },
    ...extra,
  };
}

let current: GemCuttingView;
let posted: unknown[];
let nextError: string | null;

beforeEach(() => {
  current = view();
  posted = [];
  nextError = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") return new Response(JSON.stringify(toResponse(current)));
      const body = JSON.parse(String(init.body)) as { mode: string; count: number };
      posted.push(body);
      if (nextError) {
        return new Response(JSON.stringify({ ok: false, error: nextError }), { status: 409 });
      }
      current = view({
        roughGems: current.roughGems - 60 * body.count,
        cutGems: { polished: 6, refined: 2, flawless: 0 },
      });
      return new Response(
        JSON.stringify(
          toResponse(current, {
            result: { mode: body.mode, count: body.count, results: { polished: 2, refined: 1, flawless: 0 } },
          }),
        ),
      );
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GemCuttingPanel", () => {
  it("보유 재료와 세공 보석, 두 세공 방식의 확률과 비용을 보여 준다", async () => {
    render(<GemCuttingPanel />);
    await screen.findByText("원석 보석 310");
    expect(screen.getByText("명장 합금 7")).toBeTruthy();
    expect(screen.getByText("다듬은 보석 4")).toBeTruthy();
    expect(screen.getByText("정교한 보석 1")).toBeTruthy();
    expect(screen.getByText("완벽한 보석 0")).toBeTruthy();

    const normal = screen.getByTestId("gem-cut-normal");
    expect(within(normal).getByText("다듬은 70% · 정교한 25% · 완벽한 5%")).toBeTruthy();
    expect(within(normal).getByText("1개에 원석 보석 60")).toBeTruthy();
    const master = screen.getByTestId("gem-cut-master");
    expect(within(master).getByText("다듬은 50% · 정교한 38% · 완벽한 12%")).toBeTruthy();
    expect(within(master).getByText("1개에 원석 보석 60, 명장 합금 3")).toBeTruthy();
    expect(within(master).getByText("채광 주전공 명장 3단계부터 할 수 있습니다.")).toBeTruthy();
    expect((within(master).getByRole("button", { name: "명장 세공" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("수량은 가진 재료로 만들 수 있는 만큼까지 고르고 세공 결과를 알린다", async () => {
    const onChanged = vi.fn();
    render(<GemCuttingPanel onChanged={onChanged} />);
    const normal = await screen.findByTestId("gem-cut-normal");
    const quantity = within(normal).getByRole("spinbutton", { name: "일반 세공 수량" }) as HTMLInputElement;
    // 원석 보석 310개 → 5개까지.
    expect(quantity.max).toBe("5");
    fireEvent.change(quantity, { target: { value: "9" } });
    expect(quantity.value).toBe("5");
    fireEvent.change(quantity, { target: { value: "3" } });
    fireEvent.click(within(normal).getByRole("button", { name: "일반 세공" }));

    await waitFor(() => expect(posted).toEqual([{ mode: "normal", count: 3 }]));
    expect(await screen.findByText("3개 세공: 다듬은 보석 2, 정교한 보석 1")).toBeTruthy();
    expect(screen.getByText("원석 보석 130")).toBeTruthy();
    expect(screen.getByText("다듬은 보석 6")).toBeTruthy();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("명장 세공이 열리면 명장 합금까지 따져 수량을 정한다", async () => {
    current = view({ masterUnlocked: true, masterAlloy: 7 });
    render(<GemCuttingPanel />);
    const master = await screen.findByTestId("gem-cut-master");
    // 원석 보석으로는 5개, 명장 합금 7개로는 2개.
    expect((within(master).getByRole("spinbutton", { name: "명장 세공 수량" }) as HTMLInputElement).max).toBe("2");
    expect((within(master).getByRole("button", { name: "명장 세공" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("채광 레벨이 모자라거나 실패하면 이유를 알린다", async () => {
    current = view({ miningLevel: 12 });
    const { unmount } = render(<GemCuttingPanel />);
    await screen.findByText("채광 Lv.30부터 세공할 수 있습니다. 지금 Lv.12입니다.");
    expect((screen.getByRole("button", { name: "일반 세공" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();

    current = view();
    nextError = "not_enough_rough_gems";
    render(<GemCuttingPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "일반 세공" }));
    expect(await screen.findByText("원석 보석이 모자랍니다.")).toBeTruthy();
  });
});
