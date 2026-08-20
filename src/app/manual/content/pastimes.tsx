import {
  FISH,
  FISH_TIER_ORDER,
  FISH_TIERS,
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
import {
  FISHING_SEED_POUCH_DAILY_LIMIT,
  FISHING_STAMINA_POTION_DAILY_LIMIT,
} from "@/adventure/v2/fishingShop";
import {
  FISHING_CATCH_COIN_BY_TIER,
  FISHING_CATCH_COIN_DAILY_CAP,
} from "@/lib/server/fishing/coins";
import { DANGEROUS_FISHING_UNLOCK_LEVEL } from "@/adventure/v2/dangerousFishingHeritage";
import {
  FARM_CROP_LIST,
  FARM_DAILY_DELIVERY_LIMIT,
  FARM_MAX_PLOT_COUNT,
  FARM_PLOT_COUNT,
  FARM_RARE_PITY_HARVESTS,
} from "@/adventure/v2/farm";
import {
  AUTO_GATHERING_PLANS,
} from "@/adventure/v2/autoGathering";
import { WOODCUTTING_SPOT_IDS } from "@/adventure/data/v2/woodcuttingSpots";
import { MINING_SPOT_IDS } from "@/adventure/data/v2/miningSpots";
import {
  COOKING_BUFF_MAX_HOURS,
  COOKING_DAILY_ORDER_COUNT,
  COOKING_RECIPES,
  COOKING_SURPLUS_BATCH_SIZE,
  COOKING_SURPLUS_DAILY_LIMIT,
} from "@/adventure/v2/cooking";
import { H2, P, UL, Em, Note, Table } from "./primitives";

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
      <H2>생활 콘텐츠 한눈에 보기</H2>
      <P>
        생활 콘텐츠에는 <Em>농장·요리·벌목·채광·낚시</Em>가 있습니다. 각 콘텐츠는
        별도의 레벨과 기록을 쌓으며, 얻은 작물·원목·광석은 길드 시설과 제작,
        거래소에서 사용합니다. 낚시는 별도 코인과 어보, 주간 최대어 기록을
        중심으로 진행됩니다.
      </P>

      <H2>농장</H2>
      <UL>
        <li>
          밭에 씨앗을 심고 성장 시간이 지나면 수확합니다. 농장은 처음{" "}
          <Em>{FARM_PLOT_COUNT}칸</Em>으로 시작하며, 농장 증표를 사용해 최대{" "}
          <Em>{FARM_MAX_PLOT_COUNT}칸</Em>까지 넓힐 수 있습니다.
        </li>
        <li>
          현재 작물은 <Em>{FARM_CROP_LIST.length}종</Em>입니다. 일부 작물은 농부
          계열 스킬을 배워야 심을 수 있습니다.
        </li>
        <li>
          기본 납품은 하루 <Em>{FARM_DAILY_DELIVERY_LIMIT}회</Em>까지 가능하며,
          농장 증표와 납품한 작물의 씨앗 2개를 받습니다. 농장 증표는 고급 씨앗과 밭
          확장에 사용합니다.
        </li>
        <li>
          수확할 때 농사 경험치를 얻습니다. 낮은 확률로 희귀 작물이 함께 나오며,
          장착한 농장 패시브가 수확량과 희귀 수확 확률을 높입니다. 희귀 작물을 연속으로
          얻지 못하면 <Em>{FARM_RARE_PITY_HARVESTS}번째 수확</Em>에서 반드시 희귀 작물이 나옵니다.
        </li>
        <li>
          주간 납품의 일반 작물은 기본 조건이고 희귀 작물은 선택 보너스입니다. 희귀 작물을
          보유한 채 납품하면 1개가 자동 사용되고 추가 농장 증표를 받습니다. 주간 납품을
          마치면 해당 기본 작물의 씨앗 6개도 돌려받습니다.
        </li>
      </UL>

      <H2>개인 요리</H2>
      <UL>
        <li>
          마을의 독립 생활 메뉴인 <Em>주방</Em>에서 농작물과 낚시 보관함의 일반·신선·고급·특급·전설
          어획물을 재료로 사용합니다. 현재 요리법은 <Em>{COOKING_RECIPES.length}종</Em>이며,
          요리 레벨이 오르면 상위 요리법이 열립니다. 자주 만드는 요리는 즐겨찾기에 모으고,
          보유 재료 범위 안에서 여러 개를 한 번에 조리할 수 있습니다.
        </li>
        <li>
          완성한 음식은 거래 가능한 소모품으로 인벤토리에 보관됩니다. 인벤토리의 소모품
          탭에서 사용하면 일정 시간 능력치가 오릅니다. 같은 음식은 남은 시간을 연장하고,
          다른 음식은 기존 효과를 교체합니다. 적용 중인 효과는 모험 탭의 캐릭터 간략 정보에서
          확인할 수 있으며, 같은 음식으로 연장할 수 있는 남은 시간은 최대{" "}
          <Em>{COOKING_BUFF_MAX_HOURS}시간</Em>입니다. 음식 효과는 <Em>사냥 PvE 전용</Em>이며
          아레나·챔피언십·거점전·훈련 대련·전투력 랭킹에는 반영되지 않습니다.
        </li>
        <li>
          희귀 작물을 추가하면 강화 효과를 노릴 수 있고, 정성작·걸작은 수치와 지속 시간이
          더 높습니다. 최종 요리는 상위 사냥에서 체감할 수 있도록 주 능력치를 크게 올립니다.
        </li>
        <li>
          매일 선술집 주문 {COOKING_DAILY_ORDER_COUNT}건을 납품해 골드·농장 증표·추가 요리 경험치를 얻습니다.
          일반 작물은 {COOKING_SURPLUS_BATCH_SIZE}개당 증표 1개로 하루 최대{" "}
          {COOKING_SURPLUS_DAILY_LIMIT}회 떨이 교환할 수 있습니다.
        </li>
        <li>
          완성한 음식은 거래소의 소모품으로 사고팔 수 있습니다. 같은 요리라도{" "}
          <Em>일반·정성작·걸작, 희귀 특선, 장시간</Em> 여부가 다른 음식은 별도
          품목으로 취급되며, 거래 후에도 해당 품질과 효과가 유지됩니다.
        </li>
        <li>
          요리 Lv.5부터 요리사로 전직할 수 있으며 전문 요리사·수석 요리사·요리 명장·전설의
          요리사로 성장합니다. 상위 단계는 경험치, 품질, 재료 절약, 지속 시간, 걸작 보정을 줍니다.
          각 단계에서 얻는 요리 생활 스킬을 배우고 장착하면 경험치·품질·묶음 재료 절약과 희귀
          재료 보존 효과를 추가로 받을 수 있습니다.
        </li>
      </UL>

      <H2>벌목과 채광</H2>
      <P>
        마을의 생활 지도에서 벌목지나 채광지를 고른 뒤 해당 작업장으로 이동합니다.
        벌목지는 <Em>{WOODCUTTING_SPOT_IDS.length}곳</Em>, 채광지는{" "}
        <Em>{MINING_SPOT_IDS.length}곳</Em>입니다. 장소에 따라 얻는 원목과 광석,
        작업 시간, 성공률이 달라집니다.
      </P>
      <UL>
        <li>
          수동 작업은 진행 표시가 끝날 때까지 버튼이나 Space·Enter를 사용합니다.
          성공하면 재료와 생활 경험치, 현재 직업 숙련도를 얻습니다.
        </li>
        <li>
          생활 레벨과 장착 패시브는 작업 시간과 실패율을 줄이거나 추가 재료 획득에
          영향을 줍니다.
        </li>
        <li>
          자동 작업은 <Em>30분 기본 작업</Em>과 <Em>2시간 느긋한 작업</Em> 중에서
          고릅니다. 기본 작업은 재료 효율 80%·성공률 100%, 느긋한 작업은 재료
          효율 60%·기존 성공률의 80%를 적용합니다.
        </li>
        <li>
          자동 작업은 다른 화면으로 이동하거나 창을 닫아도 계속됩니다. 생활 레벨과
          작업 속도로 선택한 시간 동안의 예상 시도 횟수를 계산합니다. 경험치와
          숙련도 효율은 두 방식 모두 <Em>{AUTO_GATHERING_PLANS.standard.xpEfficiency * 100}%</Em>입니다.
        </li>
        <li>
          시작할 때 장착한 생활 패시브의 작업 시간·실패율·실패 구제·추가 재료
          효과를 끝까지 사용합니다. 진행 중 스킬을 바꿔도 이미 시작한 작업에는
          반영되지 않습니다.
        </li>
        <li>
          자동 벌목과 자동 채광은 동시에 실행할 수 없습니다. 둘 중 하나가 진행
          중이면 낚시와 수동 벌목·채광도 잠깁니다.
        </li>
        <li>
          완료 전에 중단하면 <Em>진행분 정산</Em>을 통해 중단 시점까지
          완료된 작업만큼의 재료·경험치·직업 숙련도를 받습니다. 아직 완료된
          작업이 없으면 보상도 없으며, 선택한 시간이 끝나면 취소 대신 전체 보상만
          수령할 수 있습니다.
        </li>
      </UL>

      <H2>낚시</H2>
      <UL>
        <li>
          <Em>완전 수동 반응형 미니게임</Em>입니다 — 찌의 움직임에 맞춰 직접
          반응해 낚습니다. 스태미나는 소모하지 않습니다.
        </li>
        <li>
          물고기를 낚을 때마다 <Em>낚시 레벨 경험치</Em>가 오릅니다. 낚시 레벨은
          입질 대기와 특별 손님 등장 확률에 작게 도움을 주지만, 캐릭터 전투력과는
          분리됩니다.
        </li>
        <li>
          낚시 계열 직업으로 한 번이라도 전직했다면 현재 다른 직업이어도
          챔질 성공 때 <Em>전직 이력상 가장 높은 차수의 낚시 직업</Em> 숙련도가
          1 오릅니다. 낚시 직업 이력이 없으면 직업 숙련도를 주지 않고,
          생존자 직군 숙련도도 오르지 않습니다.
        </li>
        <li>
          낚시 코인 상점에서는 칭호·<Em>낚싯대</Em>·<Em>미끼</Em>와 보관형
          소비품을 살 수 있습니다. 스태미나 회복약은 하루{" "}
          {FISHING_STAMINA_POTION_DAILY_LIMIT}개, 농장 씨앗 주머니는 하루{" "}
          {FISHING_SEED_POUCH_DAILY_LIMIT}개까지 구매할 수 있습니다. 씨앗 주머니는
          같은 날 살 때마다 가격이 오릅니다.
        </li>
        <li>
          낚싯대와 미끼는 입질 대기시간, 물고기 크기, 희귀 어종 크기, 대물권,
          물때 특별 손님 쪽에 서로 다른 효과를 줍니다.
        </li>
        <li>
          시간대에 따라 <Em>물때</Em>가 바뀌고, 특정 물때에는 한정 특별 손님이
          등장합니다. 물때는 {TIDE_HOURS}시간마다 전환되며, 바로 앞 타임과 같은
          물때가 연속으로 나오지 않게 편성됩니다.
        </li>
        <li>
          주간 종별 최대어 대회, 오늘의 의뢰, 일일 과제, 누적 목표로{" "}
          <Em>낚시 코인</Em>을 모아 낚시터 상점에서 씁니다. 잡은 물고기는 모험의
          서 <Em>어보</Em>에 기록됩니다.
        </li>
      </UL>
      <P>
        현재 어보에는 총 <Em>{fishList.length}종</Em>이 있고, 기본 어종{" "}
        {normalFishCount}종과 물때 한정 특별 손님 {specialFishCount}종으로 나뉩니다.
      </P>
      <UL>
        <li>
          어보에 등록된 어종은 <Em>등록 권리</Em>를 거래 가능한{" "}
          <Em>어종 표본</Em> 1개로 추출할 수 있습니다. 추출해도 최대어·누적
          마릿수·최초 포획 같은 <Em>어획 기록은 유지</Em>됩니다.
        </li>
        <li>
          추출로 등록 수가 SP 보상 단계를 밑돌면 확인창에 전후 SP가 표시됩니다.
          장착 스킬 비용이 새 SP 한도를 넘는 경우에는 먼저 스킬 로드아웃을
          조정해야 합니다.
        </li>
        <li>
          표본은 자신의 해당 등록 권리가 비어 있을 때만 사용할 수 있으며, 직접
          포획 기록은 만들지 않습니다. 표본으로 채운 등록 권리도 다시 추출할 수
          있고, 직접 낚으면 보존된 기록에 이어서 자동 등록됩니다.
        </li>
      </UL>
      <Table
        head={["티어", "어종 수", "기본 챔질 코인", "주간 최대어 보상"]}
        rows={FISH_TIER_ORDER.map((tier) => {
          const meta = FISH_TIERS[tier];
          const count = fishList.filter((fish) => fish.tier === tier).length;
          return [
            <Em key={`${tier}-label`}>{meta.label}</Em>,
            `${count}종`,
            `${FISHING_CATCH_COIN_BY_TIER[tier]}코인`,
            `1위 ${meta.recordCoins.rank1} / 2위 ${meta.recordCoins.rank2} / 3위 ${meta.recordCoins.rank3}`,
          ];
        })}
        caption={`챔질 코인은 KST 일자 기준 하루 ${FISHING_CATCH_COIN_DAILY_CAP.toLocaleString()}코인까지만 직접 적립됩니다. 연속 낚시·물때·핫타임 보너스가 더해질 수 있으며, 일일 과제·의뢰·누적 목표·주간 랭킹·낚시 레벨업 보상은 별도 보상입니다.`}
      />

      <H2>위험 해역 낚시</H2>
      <P>
        낚시 <Em>Lv.{DANGEROUS_FISHING_UNLOCK_LEVEL}</Em>부터 낚시 화면 상단의
        위험 해역 탭에서 이용하는 선택형 상위 콘텐츠입니다. 기존 낚시 장비와는
        별개인 <Em>전용 낚싯대·릴·낚싯줄</Em>을 사용하며, 스타터 장비와 기본
        미끼는 무료로 지급됩니다.
      </P>
      <Table
        head={["물고기 행동", "대응 조작", "효과"]}
        rows={[
          [<Em key="charge">돌진</Em>, "줄 풀기 (S)", "충격을 흘리고 장력을 크게 낮춤"],
          [<Em key="thrash">몸부림·잠수</Em>, "버티기 (D)", "자세를 잡고 어체력을 소모"],
          [<Em key="turn">급선회</Em>, "감아올리기 (A)", "거리를 빠르게 줄임"],
        ]}
        caption="화면에 표시되는 현재 행동을 우선 따라가되, 장력에 여유가 있을 때 감아올려 거리를 줄입니다."
      />
      <UL>
        <li>
          <Em>어체력과 거리</Em>를 모두 0으로 만들면 포획합니다. 장력이 최대치를
          넘으면 줄이 끊어지고, 너무 낮은 상태가 이어지면 바늘이 빠집니다.
        </li>
        <li>
          포획한 재료는 먼저 <Em>귀환 전 화물</Em>에 쌓입니다. <Em>안전 귀환</Em>을
          마쳐야 거래 가능한 재료로 확정되며, 귀환 자체에는 사고 판정이 없습니다.
        </li>
        <li>
          위험도 0~2에는 사고가 없습니다. 다음 투척 시 위험도 3은 <Em>12%</Em>,
          위험도 4는 22%, 위험도 5는 <Em>32%</Em> 확률로 사고가 발생하며 화물
          일부를 잃고 강제 귀환합니다. 기존 인벤토리·낚시 경험치·코인·도감 기록은
          잃지 않습니다.
        </li>
        <li>
          위험도 4 이상에서 영웅·전설 어종을 잡으면 서버 공용 거대어를 발견할 수
          있습니다. 한 번 기여 자격을 확보하면 실패해도 기존 기여도는 유지되며,
          처치 후 보상 수령 버튼으로 낚시 코인과 거래 가능한 증표를 받습니다.
        </li>
      </UL>

      <H2>위험 해역 교환</H2>
      <P>
        낚시 상점의 위험 해역 탭에서 안전 귀환한 어획물과 거대어 증표를 교환합니다.
        같은 등급이라면 서로 다른 어종을 섞어 납품할 수 있으며, 보유량이 많은 어종부터
        자동으로 선택됩니다. 어획물과 증표는 거래소에서 거래할 수 있지만 NPC에게 판매할 수는 없습니다.
      </P>
      <Table
        head={["소모", "지급"]}
        rows={[
          ["일반 어획물 4개", "암초 향 미끼 5개"],
          ["희귀 어획물 4개", "핏빛 미끼 5개"],
          ["영웅 어획물 3개", "발광 미끼 5개"],
          ["전설 어획물 2개", "심연 응축 미끼 5개"],
          ["해일의 거신 증표 8개 + 낚시 코인 20,000", "대소용돌이 릴"],
          ["심연 크라켄 증표 8개 + 낚시 코인 35,000", "심연 사슬줄"],
          ["해일 증표 8개 + 심연 증표 4개 + 낚시 코인 40,000", "레비아탄 낚싯대"],
          ["해일의 거신 증표 10개", "칭호 ‘파도를 거둔 자’"],
          ["심연 크라켄 증표 10개", "칭호 ‘심연을 낚은 자’"],
          ["두 거대어 증표 각각 15개", "영구 프로필 테두리 ‘심해의 지배자’"],
          ["해일의 거신 증표 1개", "발광 미끼 5개"],
          ["심연 크라켄 증표 1개", "심연 응축 미끼 5개"],
        ]}
        caption="장비·칭호·프로필 테두리는 한 번만 교환할 수 있습니다. 기존 낚시 코인 단독 장비 구매 경로도 그대로 유지됩니다."
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
          낚시 직업 전직에 쓰는 <Em>직업 숙련도</Em>와는 별개의 성장치입니다.
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

      <Note>
        생활 콘텐츠의 레벨과 보상 구조는 서로 다릅니다. 자동 벌목·채광을 시작하기
        전에는 다른 생활 작업을 마쳤는지 확인해 주세요.
      </Note>
    </>
  );
}
