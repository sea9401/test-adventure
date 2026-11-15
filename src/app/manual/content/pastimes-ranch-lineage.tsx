import { FARM_ITEMS } from "@/adventure/v2/farm";
import { LIFE_MAJOR_CRAFT_MIN_STAGE } from "@/adventure/v2/lifeMajorRules";
import { RANCH_ANIMAL_DEFINITIONS } from "@/adventure/v2/ranch";
import {
  RANCH_LINEAGE_BREED_CHANCES,
  RANCH_LINEAGE_BREED_FEED_COST,
  RANCH_LINEAGE_BREED_PRODUCT_COST,
  RANCH_LINEAGE_GRADE_NAMES,
  RANCH_LINEAGE_MASTER_CROP_COST,
  RANCH_LINEAGE_RARE_CHANCE_PCT,
  RANCH_RARE_ITEM_ID,
  RANCH_RARE_ITEM_REPUTATION,
} from "@/adventure/v2/ranchLineageRules";
import { H2, UL, Em, Table } from "./primitives";

// 생활 안내서의 "목장 혈통" 항목. 생활 안내서 본문(pastimes.tsx)이 불러 쓴다.

const GRADE_ROWS = RANCH_LINEAGE_GRADE_NAMES.map((name, grade) => {
  const step = RANCH_LINEAGE_BREED_CHANCES[grade];
  return [
    name,
    `${RANCH_LINEAGE_RARE_CHANCE_PCT[grade]}%`,
    step ? `${step.basePct}%` : "",
    step ? `+${step.perFailPct}%p` : "",
  ];
});

const ANIMAL_ROWS = (["chicken", "cow", "pig"] as const).map((animalId) => {
  const animal = RANCH_ANIMAL_DEFINITIONS[animalId];
  const rareId = RANCH_RARE_ITEM_ID[animalId];
  return [
    animal.name,
    `${animal.outputName} ${RANCH_LINEAGE_BREED_PRODUCT_COST[animalId]}, 배합 사료 ${RANCH_LINEAGE_BREED_FEED_COST}`,
    FARM_ITEMS[rareId].name,
    `${RANCH_RARE_ITEM_REPUTATION[rareId]}`,
  ];
});

export function RanchLineageManualSection() {
  return (
    <>
      <H2>목장 혈통</H2>
      <UL>
        <li>
          목장 부지마다 가축의 <Em>혈통 등급</Em>이 있습니다. 그 동물의 산물과 배합 사료를 써서 교배하면
          확률로 한 등급 오릅니다. 실패하면 등급은 그대로이고 그 부지의 다음 성공률이 오르며, 성공하면
          오른 확률은 처음으로 돌아갑니다. 등급은 내려가지 않습니다.
        </li>
        <li>
          혈통 등급이 높을수록 산물을 수거할 때 한 주기마다 <Em>희귀 산물</Em>이 나올 확률이 오릅니다.
          희귀 산물은 납품 탭의 희귀 수확 납품으로 농장 증표와 바꿉니다.
        </li>
        <li>
          명품에서 명장 혈통으로 가는 교배는 농사 주전공 명장 {LIFE_MAJOR_CRAFT_MIN_STAGE}단계부터 할 수
          있고 명장 작물 {RANCH_LINEAGE_MASTER_CROP_COST}개가 더 듭니다.
        </li>
        <li>
          축사를 다른 종류로 바꾸면 그 부지의 혈통은 보통으로 돌아갑니다. 부지끼리 자리를 바꾸면 혈통도
          가축을 따라 옮겨집니다.
        </li>
      </UL>
      <Table
        head={["혈통 등급", "희귀 산물 확률", "다음 등급 교배 성공률", "실패할 때마다"]}
        rows={GRADE_ROWS}
      />
      <Table head={["동물", "교배 1회 비용", "희귀 산물", "납품 증표"]} rows={ANIMAL_ROWS} />
    </>
  );
}
