// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FARM_CROP_LIST, emptyFarmState, type FarmState } from "./farm";
import { FarmBreedingPanel } from "./FarmBreedingPanel";

const NOW = 1_800_000_000_000;

function farmWith(
  inventory: FarmState["inventory"],
  breeding?: FarmState["breeding"],
): FarmState {
  return { ...emptyFarmState(NOW), inventory, ...(breeding ? { breeding } : {}) };
}

function renderPanel(
  farm: FarmState,
  options: {
    masterUnlocked?: boolean;
    masterCropHeld?: number;
    busyCropId?: "wheat" | null;
  } = {},
) {
  const onBreed = vi.fn();
  render(
    <FarmBreedingPanel
      farm={farm}
      crops={FARM_CROP_LIST}
      info={{
        masterUnlocked: options.masterUnlocked ?? false,
        masterCropHeld: options.masterCropHeld ?? 0,
      }}
      busyCropId={options.busyCropId ?? null}
      onBreed={onBreed}
    />,
  );
  return { onBreed, wheat: within(screen.getByTestId("farm-breeding-wheat")) };
}

afterEach(() => {
  cleanup();
});

describe("농장 품종 개량 패널", () => {
  it("작물 11종과 단계 합계, 칭호 진행을 보여 준다", () => {
    renderPanel(farmWith({}, { wheat: 3, herb: 6, corn: 5 }));

    expect(screen.getAllByTestId(/^farm-breeding-/)).toHaveLength(11);
    expect(screen.getByText("품종 단계 합계 14")).toBeTruthy();
    expect(screen.getByText("육종가 14 / 22")).toBeTruthy();
    expect(screen.getByText("품종의 대가 2 / 11")).toBeTruthy();
  });

  it("재료가 충분하면 개량을 요청한다", () => {
    const { onBreed, wheat } = renderPanel(farmWith({ wheat: 45, golden_wheat: 2 }));

    expect(wheat.getByText("0단계")).toBeTruthy();
    expect(wheat.getByText("밀 45 / 40")).toBeTruthy();
    expect(wheat.getByText("황금 밀 2 / 2")).toBeTruthy();
    const button = wheat.getByRole("button", { name: "밀 품종 개량" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);

    expect(onBreed).toHaveBeenCalledWith("wheat");
  });

  it("재료가 모자라면 버튼을 끄고 모자란 재료를 표시한다", () => {
    const { onBreed, wheat } = renderPanel(farmWith({ wheat: 10, golden_wheat: 2 }));

    const button = wheat.getByRole("button", { name: "밀 품종 개량" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onBreed).not.toHaveBeenCalled();
    expect(wheat.getByText("밀 10 / 40").className).toContain("text-rose-600");
    expect(wheat.getByText("황금 밀 2 / 2").className).not.toContain("text-rose-600");
  });

  it("현재 단계와 희귀 수확 보너스를 보여 준다", () => {
    const { wheat } = renderPanel(farmWith({}, { wheat: 3 }));

    expect(wheat.getByText("3단계")).toBeTruthy();
    expect(wheat.getByText("희귀 수확 +6%p")).toBeTruthy();
    expect(wheat.getByText("밀 0 / 480")).toBeTruthy();
    expect(wheat.getByText("황금 밀 0 / 18")).toBeTruthy();
  });

  it("명장 품종은 농사 주전공이 아니면 조건을 적고 잠근다", () => {
    const { wheat } = renderPanel(
      farmWith({ wheat: 5_000, golden_wheat: 99 }, { wheat: 5 }),
      { masterCropHeld: 9 },
    );

    expect(wheat.getByText("농사 주전공 명장 3단계부터 올릴 수 있습니다.")).toBeTruthy();
    expect(wheat.getByText("명장 작물 9 / 3")).toBeTruthy();
    expect(
      (wheat.getByRole("button", { name: "밀 품종 개량" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("농사 주전공이면 명장 작물까지 확인해 명장 품종을 연다", () => {
    const short = renderPanel(
      farmWith({ wheat: 5_000, golden_wheat: 99 }, { wheat: 5 }),
      { masterUnlocked: true, masterCropHeld: 2 },
    );
    expect(short.wheat.getByText("명장 작물 2 / 3").className).toContain("text-rose-600");
    expect(
      (short.wheat.getByRole("button", { name: "밀 품종 개량" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    cleanup();

    const enough = renderPanel(
      farmWith({ wheat: 5_000, golden_wheat: 99 }, { wheat: 5 }),
      { masterUnlocked: true, masterCropHeld: 3 },
    );
    expect(enough.wheat.queryByText("농사 주전공 명장 3단계부터 올릴 수 있습니다.")).toBeNull();
    fireEvent.click(enough.wheat.getByRole("button", { name: "밀 품종 개량" }));
    expect(enough.onBreed).toHaveBeenCalledWith("wheat");
  });

  it("최고 단계 작물은 버튼 대신 최고 단계를 적는다", () => {
    const { wheat } = renderPanel(farmWith({ wheat: 5_000 }, { wheat: 6 }));

    expect(wheat.getByText("6단계")).toBeTruthy();
    expect(wheat.getByText("희귀 수확 +13%p")).toBeTruthy();
    expect(wheat.getByText("최고 단계")).toBeTruthy();
    expect(wheat.queryByRole("button")).toBeNull();
  });

  it("요청 중에는 모든 개량 버튼을 끈다", () => {
    renderPanel(
      farmWith({ wheat: 45, golden_wheat: 2, herb: 30, silverleaf: 2 }),
      { busyCropId: "wheat" },
    );

    expect(
      (screen.getByRole("button", { name: "밀 품종 개량" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "허브 품종 개량" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("표면은 불투명한 공용 토큰을 쓴다", () => {
    const { container } = render(
      <FarmBreedingPanel
        farm={farmWith({})}
        crops={FARM_CROP_LIST}
        info={{ masterUnlocked: false, masterCropHeld: 0 }}
        busyCropId={null}
        onBreed={vi.fn()}
      />,
    );

    const html = container.innerHTML;
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-zinc-900");
    expect(html).not.toMatch(/(?<!disabled:)\bopacity-\d/);
    expect(html).not.toMatch(/bg-[a-z]+-\d+\/\d+/);
  });
});
