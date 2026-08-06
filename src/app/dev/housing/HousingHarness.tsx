"use client";

import { V2HousingView, type HousingPreviewData } from "@/adventure/v2/V2HousingView";
import { defaultHousingState } from "@/adventure/data/v2/housing";
import { RewardToastProvider } from "@/adventure/v2/RewardToastProvider";

const room = defaultHousingState();
room.layout = room.layout.map((placement) => {
  if (placement.furnitureId === "boss_trophy") {
    return {
      ...placement,
      display: { kind: "boss" as const, bossId: "mountain_chief" as const },
    };
  }
  if (placement.furnitureId === "equipment_mannequin") {
    return {
      ...placement,
      display: { kind: "equipment" as const, iid: "housing-preview-equipment" },
    };
  }
  return placement;
});

const PREVIEW_DATA: HousingPreviewData = {
  ownerName: "검은여우",
  room,
  displayOptions: [
    {
      kind: "equipment",
      iid: "housing-preview-equipment",
      label: "월식의 대검",
      detail: "무기 · 5T · +8",
    },
    {
      kind: "fish",
      fishId: "crucian_carp",
      label: "붕어",
      detail: "일반 · 개인 최대 34.5cm",
    },
    {
      kind: "boss",
      bossId: "mountain_chief",
      label: "산군",
      detail: "하드 협동 보스 토벌 기록",
    },
  ],
};

export function HousingHarness() {
  return (
    <RewardToastProvider>
      <V2HousingView
        previewData={PREVIEW_DATA}
        onBack={() => window.history.back()}
      />
    </RewardToastProvider>
  );
}
