import { describe, expect, it } from "vitest";
import { FARM_CROPS, emptyFarmState, plantCrop } from "./farm";
import {
  acknowledgeReadyFarmPlots,
  createFarmReadyNotification,
  emptyFarmReadyNotificationState,
  parseFarmReadyNotificationState,
} from "./farmReadyNotification";

describe("farm ready notification", () => {
  it("다 자란 밭 여러 개를 알림 한 건으로 묶는다", () => {
    const firstPlantedAt = 1_000;
    const secondPlantedAt = 2_000;
    let farm = plantCrop(emptyFarmState(firstPlantedAt), "plot-1", "wheat", firstPlantedAt);
    farm = plantCrop(farm, "plot-2", "wheat", secondPlantedAt);
    const now = secondPlantedAt + FARM_CROPS.wheat.growMs;

    expect(
      createFarmReadyNotification(
        farm,
        emptyFarmReadyNotificationState(),
        now - 1,
      )?.payload,
    ).toEqual({ readyCount: 1 });
    expect(
      createFarmReadyNotification(
        farm,
        emptyFarmReadyNotificationState(),
        now,
      ),
    ).toMatchObject({
      id: 0,
      type: "farm_ready",
      payload: { readyCount: 2 },
      readAt: null,
      createdAt: firstPlantedAt + FARM_CROPS.wheat.growMs,
    });
  });

  it("확인한 재배 회차는 숨기고 같은 밭에 새로 심은 작물은 다시 알린다", () => {
    const plantedAt = 1_000;
    const readyAt = plantedAt + FARM_CROPS.wheat.growMs;
    const farm = plantCrop(emptyFarmState(plantedAt), "plot-1", "wheat", plantedAt);
    const acknowledged = acknowledgeReadyFarmPlots(
      farm,
      emptyFarmReadyNotificationState(),
      readyAt,
    );

    expect(acknowledged.acknowledgedCount).toBe(1);
    expect(createFarmReadyNotification(farm, acknowledged.state, readyAt)).toBeNull();

    const replanted = {
      ...farm,
      plots: farm.plots.map((plot) =>
        plot.id === "plot-1"
          ? {
              ...plot,
              plantedAt: plantedAt + 10_000,
              readyAt: readyAt + 10_000,
            }
          : plot,
      ),
    };
    expect(
      createFarmReadyNotification(replanted, acknowledged.state, readyAt + 10_000),
    ).toMatchObject({ type: "farm_ready", payload: { readyCount: 1 } });
  });

  it("잘못된 확인 기록은 버린다", () => {
    expect(
      parseFarmReadyNotificationState({
        acknowledgedPlantings: {
          "plot-1": 123,
          invalid: 456,
          "plot-2": -1,
          "plot-3": "789",
        },
      }),
    ).toEqual({ version: 1, acknowledgedPlantings: { "plot-1": 123 } });
  });
});
