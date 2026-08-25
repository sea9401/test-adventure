// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FarmPlotCard } from "./AdventurerFarmPanel";
import { FARM_CROPS } from "./farm";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("농작물 파내기 확인", () => {
  it("손실 안내에 동의한 경우에만 파내기 요청을 보낸다", () => {
    const onUproot = vi.fn();
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(
      <FarmPlotCard
        plot={{
          id: "plot-1",
          cropId: "wheat",
          plantedAt: 1_000,
          readyAt: 10_000,
        }}
        now={2_000}
        crop={FARM_CROPS.wheat}
        selectedCrop={FARM_CROPS.wheat}
        selectedCropLocked={false}
        selectedSeedCount={1}
        busy={false}
        fertilizerBalance={1}
        onPlant={vi.fn()}
        onHarvest={vi.fn()}
        onFertilize={vi.fn()}
        onUproot={onUproot}
      />,
    );

    const button = screen.getByRole("button", { name: "작물 파내기" });
    fireEvent.click(button);
    expect(onUproot).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(onUproot).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("씨앗·수확물·비료는 반환되지 않습니다"),
    );
  });
});
