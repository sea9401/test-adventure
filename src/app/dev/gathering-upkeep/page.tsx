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

const HOUR = 60 * 60 * 1_000;
const RUNNING_SESSION = {
  sessionId: "preview-auto",
  planId: "extended" as const,
  sourceId: "copper",
  sourceName: "구리 광맥",
  materialId: "v2_copper_ore",
  startedAt: Date.now() - HOUR,
  readyAt: Date.now() + HOUR,
  durationMs: 2 * HOUR,
  spotId: "copper_gallery",
  attempts: 1_133,
};
const PINE_RESERVATION = {
  activity: "woodcutting" as const,
  spotId: "pine_grove",
  planId: "extended" as const,
  sourceId: "pine",
  sourceName: "소나무",
  durationMs: 3.5 * HOUR,
  reservedAt: Date.now(),
};
const RESERVATION_PREVIEW = {
  activityName: "채광" as const,
  spotId: "iron_quarry",
  spotName: "철 채석장",
  result: null,
  loading: false,
  buttonVariant: "warning" as const,
  onStart: noop,
  onClaim: noop,
  onCancel: noop,
  onReserve: noop,
  onUnreserve: noop,
};

// 개발 전용 — 생활 공방의 채집지 정비 탭과 자동 채집 카드의 시간 표시와 다음 작업 예약 상태를 로그인 없이 확인한다.
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
      {/* 다음 작업 예약: 예약 가능 · 예약됨 · 다른 쪽이 도는 중 · 지원권 없음 · 이어 시작 알림 */}
      <AutoGatheringCard
        {...RESERVATION_PREVIEW}
        session={RUNNING_SESSION}
        blockedByActivity={null}
        reservationAllowed
      />
      <AutoGatheringCard
        {...RESERVATION_PREVIEW}
        session={RUNNING_SESSION}
        blockedByActivity={null}
        reservation={PINE_RESERVATION}
        reservationAllowed
      />
      <AutoGatheringCard
        {...RESERVATION_PREVIEW}
        session={null}
        blockedByActivity="woodcutting"
        reservationAllowed
      />
      <AutoGatheringCard
        {...RESERVATION_PREVIEW}
        session={RUNNING_SESSION}
        blockedByActivity={null}
        reservationAllowed={false}
      />
      <AutoGatheringCard
        {...RESERVATION_PREVIEW}
        session={null}
        blockedByActivity="woodcutting"
        reservationAllowed
        chain={{ activity: "woodcutting", sourceName: "소나무" }}
      />
    </main>
  );
}
