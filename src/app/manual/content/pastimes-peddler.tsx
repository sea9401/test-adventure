import { TITLES, PEDDLER_MASTER_TITLE_ID, PEDDLER_REGULAR_TITLE_ID } from "@/adventure/data/titles";
import { peddlerCargoItemName, peddlerShopItemName } from "@/adventure/v2/peddlerCargoNames";
import { peddlerRouteUnlockText } from "@/adventure/v2/peddlerClient";
import {
  PEDDLER_CARGO_GROUP_NAMES,
  PEDDLER_CARGO_ITEMS,
  PEDDLER_CARGO_KIND_LIMIT,
  PEDDLER_DISH_POINTS_BY_TIER,
  PEDDLER_DISPATCH_HOURS,
  PEDDLER_MASTER_TITLE_TOTAL_RANK,
  PEDDLER_MIN_CARGO_POINTS,
  PEDDLER_PREFERRED_BONUS_PCT,
  PEDDLER_PREFERRED_ITEM_COUNT,
  PEDDLER_RANK_THRESHOLDS,
  PEDDLER_REGULAR_TITLE_TOTAL_RANK,
  PEDDLER_REQUIRED_LIFE_LEVEL,
  PEDDLER_ROUTES,
  PEDDLER_SHOP_ITEMS,
  PEDDLER_TOKEN_LOAD_POINTS,
  PEDDLER_TOKENS_PER_LOAD,
  peddlerCapacityForRank,
  type PeddlerCargoGroup,
} from "@/adventure/v2/peddlerRules";
import { H2, UL, Em, Table } from "./primitives";

// 생활 안내서의 "행상" 항목. 생활 안내서 본문(pastimes.tsx)이 불러 쓴다.

const number = (value: number) => value.toLocaleString("ko-KR");

const ROUTE_ROWS = PEDDLER_ROUTES.map((route) => [
  route.name,
  route.unlock.kind === "start"
    ? `농사, 벌목, 채광, 낚시, 요리 중 하나가 Lv.${PEDDLER_REQUIRED_LIFE_LEVEL} 이상`
    : peddlerRouteUnlockText(route.unlock).replace("에 열립니다.", ""),
]);

const CARGO_GROUPS = [...new Set(PEDDLER_CARGO_ITEMS.map((item) => item.group))];
const CARGO_ROWS = [
  ...CARGO_GROUPS.map((group: Exclude<PeddlerCargoGroup, "dish">) => [
    PEDDLER_CARGO_GROUP_NAMES[group],
    PEDDLER_CARGO_ITEMS.filter((item) => item.group === group)
      .map((item) => `${peddlerCargoItemName(item)} ${item.points}`)
      .join(", "),
  ]),
  [
    PEDDLER_CARGO_GROUP_NAMES.dish,
    `티어 1~5: ${Object.values(PEDDLER_DISH_POINTS_BY_TIER).map(number).join(", ")} (품질과 무관)`,
  ],
];

const DISPATCH_ROWS = PEDDLER_DISPATCH_HOURS.map((hours) => [
  `${hours}시간`,
  `${PEDDLER_TOKENS_PER_LOAD[hours]}`,
]);

const RANK_ROWS = [0, ...PEDDLER_RANK_THRESHOLDS].map((threshold, rank) => [
  `${rank}`,
  number(threshold),
  number(peddlerCapacityForRank(rank)),
]);

const SHOP_ROWS = PEDDLER_SHOP_ITEMS.map((item) => [
  peddlerShopItemName(item),
  `${item.tokenCost}`,
  item.weeklyLimit === null ? "없음" : `${item.weeklyLimit}`,
]);

export function PeddlerManualSection() {
  return (
    <>
      <H2>행상</H2>
      <UL>
        <li>
          생활 메뉴의 <Em>행상</Em>에서 산물을 수레에 실어 교역로로 보냅니다. 정한 시간이 지나 수레가
          돌아오면 받기를 눌러 <Em>행상 증표</Em>와 교역 점수를 받습니다. 골드는 받지 않습니다.
        </li>
        <li>
          수레가 돌아오면 상단 종 알림과 생활 메뉴의 알림 점으로 알려 드리고, 홈의 오늘의 모험 체크에서 남은
          시간을 볼 수 있습니다. 환경 설정에서 푸시 알림을 켜 두면 게임을 닫아 둔 동안에도 기기 알림을 받습니다.
        </li>
        <li>
          교역로마다 한 번에 수레 한 대를 보냅니다. 품목마다 개당 적재 점수가 있고, 한 번에{" "}
          {number(PEDDLER_MIN_CARGO_POINTS)}점 이상, 그 교역로의 적재량까지 실을 수 있습니다. 품목은{" "}
          {PEDDLER_CARGO_KIND_LIMIT}종까지 섞을 수 있습니다. 출발한 수레는 되돌릴 수 없습니다.
        </li>
        <li>
          교역로마다 매주 월요일 0시에 <Em>우대 품목</Em> {PEDDLER_PREFERRED_ITEM_COUNT}종이 바뀝니다. 우대
          품목의 적재 점수는 증표를 {(100 + PEDDLER_PREFERRED_BONUS_PCT) / 100}배로 계산합니다. 교역 점수는
          그대로입니다.
        </li>
        <li>
          받는 증표는 적재 점수에 비례합니다. 계산하고 남은 나머지는 버리지 않고 다음 파견에 더합니다.
        </li>
        <li>
          보낸 적재 점수만큼 그 교역로의 교역 점수가 쌓이고, <Em>교역 등급</Em>이 오르면 적재량이
          늘어납니다. 교역 등급 합계 {PEDDLER_REGULAR_TITLE_TOTAL_RANK}에 칭호{" "}
          {TITLES[PEDDLER_REGULAR_TITLE_ID].name}, 합계 {PEDDLER_MASTER_TITLE_TOTAL_RANK}에 칭호{" "}
          {TITLES[PEDDLER_MASTER_TITLE_ID].name}을 얻습니다.
        </li>
        <li>
          명장 산물, 세공 보석, 원석 보석, 희귀 작물, 희귀 축산물, 배합 사료는 실을 수 없습니다.
        </li>
        <li>
          행상 증표는 다른 전공의 명장 산물, 세공 보석, 배합 사료로 바꿉니다. 주간 한도는 월요일 0시에
          초기화되고, 증표는 주가 바뀌어도 남습니다.
        </li>
      </UL>
      <Table head={["교역로", "여는 조건"]} rows={ROUTE_ROWS} />
      <Table head={["계열", "품목과 개당 적재 점수"]} rows={CARGO_ROWS} />
      <Table
        head={["파견 시간", `적재 ${number(PEDDLER_TOKEN_LOAD_POINTS)}점당 행상 증표`]}
        rows={DISPATCH_ROWS}
      />
      <Table head={["교역 등급", "누적 적재 점수", "적재량"]} rows={RANK_ROWS} />
      <Table head={["교환 품목", "행상 증표", "주간 한도"]} rows={SHOP_ROWS} />
    </>
  );
}
