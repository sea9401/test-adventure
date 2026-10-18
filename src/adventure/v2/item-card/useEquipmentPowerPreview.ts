"use client";

import { useEffect, useState } from "react";
import type {
  V2CraftQualityState,
  V2CraftedBy,
  V2EquipmentId,
  V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";

export type EquipmentPowerPreviewState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      currentPower: number;
      candidatePower: number;
      delta: number;
    };

// 후보를 장착했을 때의 스탯 합계를 서버에 묻는다. 보유 장비는 iid, 거래소 매물처럼
//   아직 소유하지 않은 후보는 개체 정보를 그대로 보낸다.
export function useEquipmentPowerPreview(candidate: {
  iid?: string;
  item: { id: V2EquipmentId };
  roll?: V2EquipRoll;
  enhance?: V2EnhanceState;
  craftQuality?: V2CraftQualityState;
  craftedBy?: V2CraftedBy;
}): EquipmentPowerPreviewState {
  const request = JSON.stringify(
    candidate.iid
      ? { iid: candidate.iid }
      : {
          candidate: {
            itemId: candidate.item.id,
            roll: candidate.roll,
            enhance: candidate.enhance,
            craftQuality: candidate.craftQuality,
            craftedBy: candidate.craftedBy,
          },
        },
  );
  const [preview, setPreview] = useState<EquipmentPowerPreviewState>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/v2/me/equipment/power-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: request,
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          ok?: unknown;
          currentPower?: unknown;
          candidatePower?: unknown;
          delta?: unknown;
        };
        const currentPower = Number(body.currentPower);
        const candidatePower = Number(body.candidatePower);
        const delta = Number(body.delta);
        if (
          !response.ok ||
          body.ok !== true ||
          !Number.isFinite(currentPower) ||
          !Number.isFinite(candidatePower) ||
          !Number.isFinite(delta)
        ) {
          throw new Error("power_preview_failed");
        }
        setPreview({ status: "ready", currentPower, candidatePower, delta });
      } catch (_error) {
        if (controller.signal.aborted) return;
        setPreview({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [request]);

  return preview;
}
