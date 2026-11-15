"use client";

import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import { AutoGatheringCard } from "@/adventure/v2/AutoGatheringCard";
import { GatheringSiteUpkeepPanel } from "@/adventure/v2/GatheringSiteUpkeepPanel";
import {
  gatheringSiteExtendedDurationMs,
  type GatheringSiteUpkeepView,
} from "@/adventure/v2/gatheringSiteUpkeep";
import { LIFE_MAJOR_PRODUCT_ID } from "@/adventure/v2/lifeMajorProducts";

const PREVIEW: GatheringSiteUpkeepView = {
  stages: { iron: 3, copper: 1, adamantite: 5, pine: 5, cypress: 6 },
  materials: {
    [MINING_MATERIAL_ID.iron]: 17_947,
    [MINING_MATERIAL_ID.copper]: 10_172,
    [MINING_MATERIAL_ID.silver]: 1_742,
    [MINING_MATERIAL_ID.gold]: 1_579,
    [MINING_MATERIAL_ID.mythril]: 8_281,
    [MINING_MATERIAL_ID.adamantite]: 13_657,
    [MINING_MATERIAL_ID.stone]: 4_755,
    [MINING_MATERIAL_ID.coal]: 2_841,
    [MINING_MATERIAL_ID.roughGem]: 1_307,
    [WOODCUTTING_MATERIAL_ID.pine]: 19_245,
    [WOODCUTTING_MATERIAL_ID.birch]: 1_535,
    [WOODCUTTING_MATERIAL_ID.willow]: 7_040,
    [WOODCUTTING_MATERIAL_ID.oak]: 1_696,
    [WOODCUTTING_MATERIAL_ID.cedar]: 314,
    [LIFE_MAJOR_PRODUCT_ID.mining]: 219,
    [LIFE_MAJOR_PRODUCT_ID.woodcutting]: 12,
  },
  masterUnlocked: { mining: true, woodcutting: false },
};

const noop = async () => {};

// 개발 전용 — 생활 공방의 채집지 정비 탭과 자동 채집 카드의 시간 표시를 로그인 없이 확인한다.
// 정비는 화면 안 mock 상태에만 적용된다.
export default function GatheringUpkeepPreview() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <GatheringSiteUpkeepPanel preview={PREVIEW} />
      <AutoGatheringCard
        activityName="채광"
        spotId="iron_quarry"
        extendedDurationMs={gatheringSiteExtendedDurationMs(3)}
        session={null}
        result={null}
        loading={false}
        blockedByActivity={null}
        buttonVariant="warning"
        onStart={noop}
        onClaim={noop}
        onCancel={noop}
      />
    </main>
  );
}
