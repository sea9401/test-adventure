// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import { GatheringSiteUpkeepPanel } from "./GatheringSiteUpkeepPanel";
import type { GatheringSiteUpkeepView } from "./gatheringSiteUpkeep";
import { LIFE_MAJOR_PRODUCT_ID } from "./lifeMajorProducts";

function view(overrides: Partial<GatheringSiteUpkeepView> = {}): GatheringSiteUpkeepView {
  return {
    stages: { iron: 3, cypress: 5 },
    materials: {
      [MINING_MATERIAL_ID.iron]: 20_000,
      [MINING_MATERIAL_ID.coal]: 90,
      [MINING_MATERIAL_ID.copper]: 1_650,
      [MINING_MATERIAL_ID.stone]: 200,
      [WOODCUTTING_MATERIAL_ID.cypress]: 13_200,
      [MINING_MATERIAL_ID.roughGem]: 600,
      [LIFE_MAJOR_PRODUCT_ID.woodcutting]: 20,
    },
    masterUnlocked: { mining: false, woodcutting: false },
    ...overrides,
  };
}

let current: GatheringSiteUpkeepView;
let posted: unknown[];
let nextError: string | null;

beforeEach(() => {
  current = view();
  posted = [];
  nextError = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") {
        return new Response(JSON.stringify({ ok: true, ...current }), { status: 200 });
      }
      const body = JSON.parse(String(init.body)) as { siteId: string };
      posted.push(body);
      if (nextError) {
        return new Response(JSON.stringify({ ok: false, error: nextError }), { status: 409 });
      }
      current = view({
        stages: { ...current.stages, [body.siteId]: 1 },
        materials: { ...current.materials, [MINING_MATERIAL_ID.copper]: 0 },
      });
      return new Response(
        JSON.stringify({
          ok: true,
          ...current,
          result: { siteId: body.siteId, stage: 1, grantedTitleIds: ["gathering_pioneer"] },
        }),
        { status: 200 },
      );
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GatheringSiteUpkeepPanel", () => {
  it("채집지마다 단계, 느긋한 작업 시간, 다음 단계 비용을 보여 준다", async () => {
    render(<GatheringSiteUpkeepPanel />);
    const iron = await screen.findByTestId("gathering-upkeep-iron");
    expect(within(iron).getByText("철 광맥")).toBeTruthy();
    expect(within(iron).getByText("3단계")).toBeTruthy();
    expect(within(iron).getByText("느긋한 작업 2시간 36분")).toBeTruthy();
    expect(within(iron).getByText("철광석 20,000 / 16,000")).toBeTruthy();
    // 모자란 재료는 색으로 구분한다.
    expect(within(iron).getByText("석탄 90 / 500").className).toContain("rose");
    expect(
      (within(iron).getByRole("button", { name: "철 광맥 정비" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    expect(screen.getByText("정비 단계 합계 8")).toBeTruthy();
    expect(screen.getByText("개척자 8 / 24")).toBeTruthy();
    expect(screen.getByText("산과 숲의 주인 1 / 12")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });

  it("6단계가 잠겨 있으면 주전공 조건을 알리고, 열리면 명장 산물까지 보여 준다", async () => {
    const { unmount } = render(<GatheringSiteUpkeepPanel />);
    const locked = await screen.findByTestId("gathering-upkeep-cypress");
    expect(within(locked).getByText("벌목 주전공 명장 3단계부터 올릴 수 있습니다.")).toBeTruthy();
    expect(
      (within(locked).getByRole("button", { name: "편백나무숲 정비" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    unmount();

    current = view({ masterUnlocked: { mining: false, woodcutting: true } });
    render(<GatheringSiteUpkeepPanel />);
    const open = await screen.findByTestId("gathering-upkeep-cypress");
    expect(within(open).getByText("명장 목재 20 / 20")).toBeTruthy();
    expect(
      (within(open).getByRole("button", { name: "편백나무숲 정비" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("정비를 누르면 요청을 보내고 결과와 얻은 칭호를 알린다", async () => {
    const onChanged = vi.fn();
    render(<GatheringSiteUpkeepPanel onChanged={onChanged} />);
    const copper = await screen.findByTestId("gathering-upkeep-copper");
    fireEvent.click(within(copper).getByRole("button", { name: "구리 광맥 정비" }));

    await waitFor(() => expect(posted).toEqual([{ siteId: "copper" }]));
    expect(
      await screen.findByText(
        "구리 광맥을 1단계로 정비했습니다. 느긋한 작업 2시간 12분 · 칭호 개척자 획득",
      ),
    ).toBeTruthy();
    expect(within(screen.getByTestId("gathering-upkeep-copper")).getByText("1단계")).toBeTruthy();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("실패하면 사유를 알리고 단계를 바꾸지 않는다", async () => {
    nextError = "not_enough_materials";
    render(<GatheringSiteUpkeepPanel />);
    const copper = await screen.findByTestId("gathering-upkeep-copper");
    fireEvent.click(within(copper).getByRole("button", { name: "구리 광맥 정비" }));
    expect(await screen.findByText("원자재가 모자랍니다.")).toBeTruthy();
    expect(within(screen.getByTestId("gathering-upkeep-copper")).getByText("0단계")).toBeTruthy();
  });

  it("미리보기 값을 주면 요청 없이 그리고 정비도 화면 안에서만 반영한다", async () => {
    render(<GatheringSiteUpkeepPanel preview={view()} />);
    const copper = screen.getByTestId("gathering-upkeep-copper");
    fireEvent.click(within(copper).getByRole("button", { name: "구리 광맥 정비" }));
    await waitFor(() =>
      expect(within(screen.getByTestId("gathering-upkeep-copper")).getByText("1단계")).toBeTruthy(),
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
