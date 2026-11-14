import {
  GATHERING_PIONEER_TITLE_ID,
  GATHERING_SITE_MASTER_TITLE_ID,
  TITLES,
} from "@/adventure/data/titles";
import { MINING_MATERIALS, type MiningMaterialId } from "@/adventure/data/v2/miningSpots";
import { autoGatheringDurationLabel } from "@/adventure/v2/autoGathering";
import {
  GATHERING_SITES,
  GATHERING_SITE_BASE_MAX_STAGE,
  GATHERING_SITE_MASTER_PRODUCT_COUNT,
  GATHERING_SITE_MASTER_STAGE,
  gatheringSiteCost,
  gatheringSiteExtendedDurationMs,
} from "@/adventure/v2/gatheringSiteUpkeep";
import { LIFE_MAJOR_CRAFT_MIN_STAGE } from "@/adventure/v2/lifeMajorRules";
import { H2, UL, Em, Table } from "./primitives";

// 생활 안내서의 "채집지 정비" 항목. 생활 안내서 본문(pastimes.tsx)이 불러 쓴다.

const STAGES = Array.from({ length: GATHERING_SITE_MASTER_STAGE }, (_, index) => index + 1);

const STAGE_ROWS = STAGES.map((stage) => {
  const cost = gatheringSiteCost(GATHERING_SITES[0].id, stage)!;
  return [
    stage === GATHERING_SITE_MASTER_STAGE ? `${stage} (명장 정비)` : `${stage}`,
    autoGatheringDurationLabel(gatheringSiteExtendedDurationMs(stage)),
    `${MINING_MATERIALS[cost.byproductId as MiningMaterialId].name} ${cost.byproducts.toLocaleString("ko-KR")}`,
    cost.masterProducts > 0 ? `${cost.masterProducts}` : "",
  ];
});

const SITE_ROWS = GATHERING_SITES.map((site) => [
  site.name,
  site.materialName,
  ...STAGES.map((stage) => gatheringSiteCost(site.id, stage)!.materials.toLocaleString("ko-KR")),
]);

export function GatheringUpkeepManualSection() {
  return (
    <>
      <H2>채집지 정비</H2>
      <UL>
        <li>
          생활 공방의 <Em>채집지 정비</Em> 탭에서 광맥 6곳과 숲 6곳을 한 단계씩 정비합니다.
          정비한 채집지에서는 <Em>느긋한 자동 작업 시간</Em>이 길어집니다. 재료 효율과 성공률은
          그대로이고, 30분 기본 작업은 바뀌지 않습니다.
        </li>
        <li>
          그 채집지에서 나는 원목이나 광석과 채광 부산물을 씁니다. 골드는 들지 않고, 단계는 내려가지
          않습니다. 작업 시간은 자동 작업을 시작할 때 정해지므로 진행 중인 작업은 정비해도 길어지지
          않습니다.
        </li>
        <li>
          {GATHERING_SITE_BASE_MAX_STAGE}단계까지는 누구나 올릴 수 있습니다.{" "}
          {GATHERING_SITE_MASTER_STAGE}단계 <Em>명장 정비</Em>는 광맥이면 채광, 숲이면 벌목 주전공
          명장 {LIFE_MAJOR_CRAFT_MIN_STAGE}단계부터 올릴 수 있고, 명장 합금 또는 명장 목재{" "}
          {GATHERING_SITE_MASTER_PRODUCT_COUNT}개가 듭니다. 한 번 올린 단계는 전공을 바꿔도 유지됩니다.
        </li>
        <li>
          정비 단계 합계 24에서 칭호 <Em>{TITLES[GATHERING_PIONEER_TITLE_ID].name}</Em>, 12곳을 모두{" "}
          {GATHERING_SITE_BASE_MAX_STAGE}단계로 올리면 칭호{" "}
          <Em>{TITLES[GATHERING_SITE_MASTER_TITLE_ID].name}</Em>을 받습니다.
        </li>
      </UL>
      <Table
        head={["정비 단계", "느긋한 작업 시간", "부산물", "명장 산물"]}
        rows={STAGE_ROWS}
      />
      <Table
        head={["채집지", "원자재", ...STAGES.map((stage) => `${stage}단계`)]}
        rows={SITE_ROWS}
      />
    </>
  );
}
