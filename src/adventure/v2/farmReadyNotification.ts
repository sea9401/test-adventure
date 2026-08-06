import {
  emptyFarmState,
  parseFarmState,
  type FarmState,
} from "@/adventure/v2/farm";
import type { V2NotificationEntry } from "@/lib/v2-notification-config";

export const FARM_READY_NOTIFICATION_SAVE_KEY = "farm-ready-notification.v1";
export const FARM_READY_NOTIFICATION_ID = 0;

export type FarmReadyNotificationState = {
  version: 1;
  acknowledgedPlantings: Record<string, number>;
};

export function emptyFarmReadyNotificationState(): FarmReadyNotificationState {
  return { version: 1, acknowledgedPlantings: {} };
}

export function parseFarmReadyNotificationState(
  raw: unknown,
): FarmReadyNotificationState {
  if (!raw || typeof raw !== "object") return emptyFarmReadyNotificationState();
  const source = (raw as { acknowledgedPlantings?: unknown })
    .acknowledgedPlantings;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return emptyFarmReadyNotificationState();
  }

  const acknowledgedPlantings: Record<string, number> = {};
  for (const [plotId, plantedAt] of Object.entries(source)) {
    if (
      plotId.startsWith("plot-") &&
      typeof plantedAt === "number" &&
      Number.isFinite(plantedAt) &&
      plantedAt > 0
    ) {
      acknowledgedPlantings[plotId] = plantedAt;
    }
  }
  return { version: 1, acknowledgedPlantings };
}

export function unacknowledgedReadyPlots(
  farmRaw: unknown,
  notificationRaw: unknown,
  now = Date.now(),
) {
  const farm = parseFarmState(farmRaw ?? emptyFarmState(now));
  const notification = parseFarmReadyNotificationState(notificationRaw);
  return farm.plots.filter(
    (plot) =>
      plot.cropId !== null &&
      plot.plantedAt !== null &&
      plot.readyAt !== null &&
      plot.readyAt <= now &&
      notification.acknowledgedPlantings[plot.id] !== plot.plantedAt,
  );
}

export function createFarmReadyNotification(
  farmRaw: unknown,
  notificationRaw: unknown,
  now = Date.now(),
): V2NotificationEntry | null {
  const readyPlots = unacknowledgedReadyPlots(farmRaw, notificationRaw, now);
  if (readyPlots.length === 0) return null;

  return {
    id: FARM_READY_NOTIFICATION_ID,
    type: "farm_ready",
    payload: { readyCount: readyPlots.length },
    readAt: null,
    createdAt: Math.min(...readyPlots.map((plot) => plot.readyAt ?? now)),
  };
}

export function acknowledgeReadyFarmPlots(
  farm: FarmState,
  notificationRaw: unknown,
  now = Date.now(),
): { state: FarmReadyNotificationState; acknowledgedCount: number } {
  const state = parseFarmReadyNotificationState(notificationRaw);
  const acknowledgedPlantings = { ...state.acknowledgedPlantings };
  let acknowledgedCount = 0;

  for (const plot of farm.plots) {
    if (
      plot.cropId !== null &&
      plot.plantedAt !== null &&
      plot.readyAt !== null &&
      plot.readyAt <= now
    ) {
      if (acknowledgedPlantings[plot.id] !== plot.plantedAt) {
        acknowledgedCount += 1;
      }
      acknowledgedPlantings[plot.id] = plot.plantedAt;
    }
  }

  return {
    state: { version: 1, acknowledgedPlantings },
    acknowledgedCount,
  };
}
