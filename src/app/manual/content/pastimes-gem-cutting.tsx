import {
  CUT_GEMS,
  CUT_GEM_GRADES,
  GEM_CUT_BATCH_LIMIT,
  GEM_CUT_CHANCES,
  GEM_CUT_MASTER_ALLOY_COST,
  GEM_CUT_REQUIRED_MINING_LEVEL,
  GEM_CUT_ROUGH_COST,
  LIBERATION_LOCK_GOLD_PER_LINE,
} from "@/adventure/v2/gemCutting";
import { LIFE_MAJOR_CRAFT_MIN_STAGE } from "@/adventure/v2/lifeMajorRules";
import { H2, UL, Em, Table } from "./primitives";

// 생활 안내서의 "보석 세공" 항목. 생활 안내서 본문(pastimes.tsx)이 불러 쓴다.

// 화면의 마법부여 단계는 1단계가 가장 낮다(세이브의 rank 3).
const USABLE_STAGE: Record<1 | 2 | 3, string> = { 3: "1단계", 2: "1·2단계", 1: "1·2·3단계" };

const GEM_ROWS = CUT_GEM_GRADES.map((grade) => [
  CUT_GEMS[grade].name,
  `${GEM_CUT_CHANCES.normal[grade]}%`,
  `${GEM_CUT_CHANCES.master[grade]}%`,
  USABLE_STAGE[CUT_GEMS[grade].bestRank],
]);

export function GemCuttingManualSection() {
  return (
    <>
      <H2>보석 세공</H2>
      <UL>
        <li>
          생활 공방의 <Em>보석 세공</Em> 탭에서 채광 부산물인 원석 보석 {GEM_CUT_ROUGH_COST}개로 세공 보석
          1개를 만듭니다. 등급은 무작위이고, 한 번에 {GEM_CUT_BATCH_LIMIT}개까지 세공합니다. 채광 Lv.
          {GEM_CUT_REQUIRED_MINING_LEVEL}부터 할 수 있고 골드는 들지 않습니다.
        </li>
        <li>
          <Em>명장 세공</Em>은 채광 주전공 명장 {LIFE_MAJOR_CRAFT_MIN_STAGE}단계부터 할 수 있습니다. 원석
          보석 {GEM_CUT_ROUGH_COST}개에 명장 합금 {GEM_CUT_MASTER_ALLOY_COST}개를 더 넣고, 높은 등급이
          나올 확률이 오릅니다.
        </li>
        <li>
          세공 보석은 대장간 마법부여 작업대에서 다시 마법부여할 때 남길 줄을 고정하는 데 씁니다. 줄
          하나마다 보석 1개와 골드 {LIBERATION_LOCK_GOLD_PER_LINE.toLocaleString("ko-KR")} G가 더 듭니다.
          거래소에서 재료로 거래할 수 있습니다.
        </li>
      </UL>
      <Table
        head={["세공 보석", "일반 세공", "명장 세공", "쓸 수 있는 마법부여 단계"]}
        rows={GEM_ROWS}
      />
    </>
  );
}
