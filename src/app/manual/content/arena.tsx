import { ARENA_SHOP_CONSUMABLES } from "@/adventure/v2/arenaShop";
import { STAMINA_POTION_RESTORE } from "@/adventure/v2/staminaPotions";
import {
  ARENA_TOURNAMENT_MIN_MATCHES,
  ARENA_TOURNAMENT_MIN_SIZE,
  arenaTournamentRewardFor,
} from "@/lib/server/pvp/arenaTournament";
import { H2, P, UL, Em, Note, Table } from "./primitives";

const ARENA_STAMINA_POTION = ARENA_SHOP_CONSUMABLES.find(
  (item) => item.itemId === "stamina_potion",
);
const ARENA_REWARD_ROWS = [
  [
    "1위",
    arenaTournamentRewardFor({
      placement: 1,
      eliminatedRound: undefined,
      totalRounds: 3,
    }).coins,
  ],
  [
    "2위",
    arenaTournamentRewardFor({
      placement: 2,
      eliminatedRound: undefined,
      totalRounds: 3,
    }).coins,
  ],
  [
    "3위",
    arenaTournamentRewardFor({
      placement: 3,
      eliminatedRound: undefined,
      totalRounds: 3,
    }).coins,
  ],
  [
    "4위",
    arenaTournamentRewardFor({
      placement: 4,
      eliminatedRound: undefined,
      totalRounds: 3,
    }).coins,
  ],
  [
    "8강",
    arenaTournamentRewardFor({ eliminatedRound: 1, totalRounds: 3 }).coins,
  ],
  [
    "본선 진출",
    arenaTournamentRewardFor({ eliminatedRound: 0, totalRounds: 3 }).coins,
  ],
] as const;

export function ArenaContent() {
  return (
    <>
      <H2>투기장</H2>
      <P>
        투기장은 1대1 PvP 입니다(전투 탭 → 투기장). 사냥과 달리 회피·명중·치명타
        저항이 모두 적용되므로 사냥과 다른 방식으로 전투 구성을 점검할 수 있습니다.
      </P>
      <UL>
        <li>
          상대는 점수·레벨이 비슷한 다른 모험가 중에서 무작위로 잡힙니다.
        </li>
        <li>
          승패에 따라 <Em>점수</Em>가 오르내리고 <Em>골드</Em>를 받습니다(점수는
          0 아래로 내려가지 않습니다).
        </li>
        <li>
          월요일부터 토요일까지 주간 Elo 예선을 진행합니다. 최소{" "}
          {ARENA_TOURNAMENT_MIN_MATCHES}경기를 치른 상위 참가자는 일요일{" "}
          <Em>{ARENA_TOURNAMENT_MIN_SIZE}·16·32강 토너먼트</Em>에 진출합니다.
        </li>
        <li>
          본선 대진은 일요일 00:00에, 전투 세팅은 12:00에 동결됩니다.
          13:00에 같은 라운드 경기를 모두 진행하고 5분마다 다음 라운드로
          넘어가며, 각 경기는 포트 추첨 대진의 3판 2선승으로 자동 진행됩니다.
          13:20에는 3·4위전, 13:25에는 결승을 진행합니다.
        </li>
        <li>
          일요일 일반 대전은 연습전이라 Elo·골드가 변하지 않습니다.
        </li>
      </UL>
      <Note>
        주간 순위와 토너먼트 성적에 따라 <Em>투기장 코인</Em>이 우편함으로
        지급됩니다. 챔피언십 1·2·3위에게는 금·은·동 특수 메달이 영구
        지급되며, 여러 번 입상하면 횟수가 누적됩니다. 획득한 메달은 꾸미기 배지
        목록에서 하나를 골라 착용할 수 있습니다. 우승자에게는 영구 칭호{" "}
        <Em>천하제일</Em>도 지급됩니다.
        메달과 칭호는 캐릭터 스탯을 직접 올리지 않습니다.
      </Note>

      <H2>챔피언십 보상</H2>
      <Table
        head={["성적", "투기장 코인"]}
        rows={ARENA_REWARD_ROWS.map(([placement, coins]) => [
          placement,
          `${coins.toLocaleString("ko-KR")}코인`,
        ])}
        caption="주간 순위 보상과 챔피언십 성적 보상은 우편함으로 지급됩니다."
      />
      <H2>투기장 상점과 전투 기록</H2>
      <UL>
        <li>
          투기장 코인 상점에서 칭호와 보관형 소비품을 살 수 있습니다.
          <Em>스태미나 회복약</Em>은 투기장 코인 {ARENA_STAMINA_POTION?.price ?? 200}개이며,
          사용하면 스태미나 {STAMINA_POTION_RESTORE}을 회복합니다.
        </li>
        <li>
          최근 전투 기록은 내가 도전한 <Em>공격</Em> 경기와 상대가 나를 공격한{" "}
          <Em>방어</Em> 경기를 구분해 표시합니다.
        </li>
      </UL>

      <H2>대련장 (허수아비 대련)</H2>
      <P>
        대련은 <Em>보상도 손실도 없는 연습</Em>입니다(전투 탭 → 대련장). 쓰러
        지지 않는 허수아비를 상대로 현재 빌드의 <Em>총 누적 데미지</Em>를 재고
        리플레이 로그까지 그대로 확인할 수 있습니다.
      </P>
      <Note>
        전직·스킬·장비를 바꿔 본 뒤 대련으로 데미지를 비교하고, 자신이 생기면
        투기장에서 실전을 치르는 흐름을 권합니다.
      </Note>
    </>
  );
}
