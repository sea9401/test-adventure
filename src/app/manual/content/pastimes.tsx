import {
  FISH,
  FISH_TIER_ORDER,
  FISH_TIERS,
  type FishTier,
} from "@/adventure/data/v2/fish";
import {
  MULTTAE_CONDITIONS,
  MULTTAE_WINDOW_MS,
} from "@/adventure/data/v2/multtae";
import {
  FISHING_CONTRACTS,
  FISHING_DAILY_CHALLENGES,
} from "@/adventure/data/v2/fishingDailyChallenges";
import {
  FISHING_COLLECTION_GOALS,
  FISHING_LURES,
  FISHING_RODS,
} from "@/adventure/v2/fishingProgression";
import { H2, P, UL, Em, Note, Table } from "./primitives";

const CATCH_COIN_BY_TIER: Record<FishTier, number> = {
  common: 3,
  uncommon: 3,
  rare: 5,
  epic: 10,
  legendary: 20,
};

const DAILY_CATCH_COIN_CAP = 3000;
const TIDE_HOURS = MULTTAE_WINDOW_MS / 3_600_000;
const fishList = Object.values(FISH);
const normalFishCount = fishList.filter((fish) => !fish.condition).length;
const specialFishCount = fishList.length - normalFishCount;

function fishName(id: string | undefined) {
  return id && id in FISH ? FISH[id as keyof typeof FISH].name : "없음";
}

export function PastimesContent() {
  return (
    <>
      <H2>전투력 밖의 여가</H2>
      <P>
        낚시와 발굴은 전투·성장 경제와 분리된 곁가지 콘텐츠입니다. 스탯이나
        전투력으로 결과가 갈리지 않고, 저마다 독립된 보상(코인·칭호·주간 랭킹)이
        있습니다. 둘 다 마을 탭에서 들어갑니다.
      </P>

      <H2>낚시</H2>
      <UL>
        <li>
          <Em>완전 수동 반응형 미니게임</Em>입니다 — 찌의 움직임에 맞춰 직접
          반응해 낚습니다(스태미나는 들지 않아요).
        </li>
        <li>
          물고기를 낚을 때마다 <Em>낚시 숙련도</Em> 경험치가 오릅니다. 숙련도는
          입질 대기와 특별 손님 등장 확률에 작게 도움을 주지만, 캐릭터 전투력과는
          분리됩니다.
        </li>
        <li>
          낚시 코인 상점에서는 칭호 외에도 <Em>낚싯대</Em>와 <Em>미끼</Em>를
          살 수 있습니다. 도구는 입질 대기시간, 물고기 크기, 희귀 어종 크기,
          대물권, 물때 특별 손님 쪽에 서로 다른 효과를 줍니다.
        </li>
        <li>
          시간대에 따라 <Em>물때</Em>가 바뀌고, 특정 물때에는 한정 특별 손님이
          등장합니다. 물때는 {TIDE_HOURS}시간마다 전환되며, 바로 앞 타임과 같은
          물때가 연속으로 나오지 않게 편성됩니다.
        </li>
        <li>
          주간 종별 최대어 대회, 오늘의 의뢰, 일일 과제, 누적 목표로{" "}
          <Em>낚시 코인</Em>을 모아 낚시터 상점에서 씁니다. 잡은 물고기는 모험의
          서 <Em>어보</Em>에 기록돼요.
        </li>
      </UL>
      <P>
        현재 어보에는 총 <Em>{fishList.length}종</Em>이 있고, 기본 어종{" "}
        {normalFishCount}종과 물때 한정 특별 손님 {specialFishCount}종으로 나뉩니다.
      </P>
      <Table
        head={["티어", "어종 수", "챔질 코인", "주간 최대어 보상"]}
        rows={FISH_TIER_ORDER.map((tier) => {
          const meta = FISH_TIERS[tier];
          const count = fishList.filter((fish) => fish.tier === tier).length;
          return [
            <Em key={`${tier}-label`}>{meta.label}</Em>,
            `${count}종`,
            `${CATCH_COIN_BY_TIER[tier]}코인`,
            `1위 ${meta.recordCoins.rank1} / 2위 ${meta.recordCoins.rank2} / 3위 ${meta.recordCoins.rank3}`,
          ];
        })}
        caption={`챔질 코인은 KST 일자 기준 하루 ${DAILY_CATCH_COIN_CAP.toLocaleString()}코인까지만 직접 적립됩니다. 일일 과제·의뢰·누적 목표·주간 랭킹·낚시 레벨업 보상은 별도 보상입니다.`}
      />

      <H2>낚시 레벨과 보상</H2>
      <UL>
        <li>
          물고기를 낚으면 티어에 따라 낚시 경험치를 얻고, 레벨이 오르면{" "}
          <Em>낚시 레벨업 보상 코인</Em>이 추가로 지급됩니다. 이 보상은 챔질 코인
          일일 상한과 별개입니다.
        </li>
        <li>
          낚시 레벨은 물고기 크기와 물때 특별 손님 등장 확률을 조금 올려 줍니다.
          전투 직업 숙련도나 전투 스탯과는 분리됩니다.
        </li>
        <li>
          일일 과제는 {FISHING_DAILY_CHALLENGES.length}종, 오늘의 의뢰는{" "}
          {FISHING_CONTRACTS.length}종, 누적 수집 목표는{" "}
          {FISHING_COLLECTION_GOALS.length}종입니다. 조건을 달성한 뒤 직접 수령해야
          코인이 들어옵니다.
        </li>
      </UL>

      <H2>낚시 장비와 물때</H2>
      <Table
        head={["구분", "종류 수", "역할"]}
        rows={[
          [
            "낚싯대",
            `${Object.keys(FISHING_RODS).length}종`,
            "입질 대기시간, 크기, 희귀 이상 크기, 대물권 크기",
          ],
          [
            "미끼",
            `${Object.keys(FISHING_LURES).length}종`,
            "어종 등급 등장률, 특별 손님 등장률, 대물·희귀 크기",
          ],
        ]}
        caption="장비는 낚시 코인 상점에서 구매하고, 보유한 장비 중 하나씩 장착합니다."
      />
      <Table
        head={["물때", "효과", "특별 손님"]}
        rows={MULTTAE_CONDITIONS.map((condition) => [
          <Em key={condition.id}>{condition.label}</Em>,
          condition.effect.label,
          fishName(condition.specialFishId),
        ])}
        caption={`${TIDE_HOURS}시간 단위 전역 스케줄입니다. 물때별 배경 연출도 함께 바뀝니다.`}
      />

      <H2>발굴 (보물탐사)</H2>
      <UL>
        <li>
          사냥에서 낮은 확률로 떨어지는 <Em>지도 조각</Em>을 모아, 단서를 보고
          격자를 파는 <Em>추리형</Em> 발굴을 합니다.
        </li>
        <li>
          나온 <Em>유물</Em>은 모험의 서 도감에 등재되고, 감정사에게 팔아 골드로
          바꿉니다(보존상태가 좋을수록 비쌉니다).
        </li>
        <li>
          주간 발굴가치 순위로 <Em>발굴 코인</Em>을 받아 칭호 상점에 씁니다.
        </li>
      </UL>

      <Note>
        낚시와 발굴은 사냥에 지쳤을 때 결이 다른 재미를 주려는 콘텐츠입니다.
        캐릭터 전투력에 직접 영향을 주지 않으니 부담 없이 즐기세요.
      </Note>
    </>
  );
}
