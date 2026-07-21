import { MAX_STAMINA, REGEN_SECONDS_PER_POINT } from "@/adventure/v2/stamina";
import {
  RARE_MAP_CAP,
  RARE_MAP_KINDS,
  RARE_MAP_TTL_MS,
  type RareMapKind,
  type RareMapKindId,
} from "@/adventure/data/v2/rareMaps";
import {
  STORM_EXPEDITION_DAILY_ATTEMPTS,
  STORM_EXPEDITION_STAGE_COUNT,
  STORM_EXPEDITION_UNLOCK_DEPTH,
} from "@/adventure/data/v2/stormExpedition";
import {
  MAX_FRONTIER_DEPTH,
  dungeonThemeCatalog,
} from "@/adventure/data/v2/dungeon";
import { H2, P, UL, Em, Code, Table, Note } from "./primitives";

const HUNTING_THEMES = dungeonThemeCatalog(MAX_FRONTIER_DEPTH);
const LAST_HUNTING_THEME = HUNTING_THEMES.at(-1);

const HUNT_RARE_MAP_IDS = [
  "worn_map",
  "gilded_map",
  "sage_map",
  "hunter_map",
  "relic_map",
] satisfies RareMapKindId[];

const LOCATION_RARE_MAP_IDS = [
  "secret_shop_map",
  "rename_map",
] satisfies RareMapKindId[];
const RARE_MAP_TTL_MINUTES = Math.floor(RARE_MAP_TTL_MS / 60_000);

function percentText(pct: number) {
  return `${pct}%`;
}

function multText(label: string, mult: number) {
  return mult > 1 ? `${label} x${mult}` : null;
}

function rareMapRewardText(def: RareMapKind) {
  return [
    multText("EXP", def.expMult),
    multText("골드", def.goldMult),
    multText("장비·재료", def.equipDropMult),
    multText("유니크", def.uniqueDropMult),
    multText("강화석", def.enhanceStoneMult),
  ]
    .filter(Boolean)
    .join(", ");
}

export function HuntingContent() {
  return (
    <>
      <H2>사냥터와 프론티어</H2>
      <P>
        사냥은 <Em>사냥터</Em>를 고르는 것으로 시작합니다(전투 탭 → 사냥터).
        사냥터는 <Em>깊이 1에서 이어지는 단일 프론티어</Em>로, 깊을수록 몬스터가
        강해지고 보상도 커집니다.
      </P>
      <Table
        head={["테마", "깊이"]}
        rows={HUNTING_THEMES.map((theme) => [
          <Em key={theme.name}>{theme.name}</Em>,
          `${theme.depthStart}~${theme.depthEnd}`,
        ])}
        caption={`6깊이마다 테마와 몬스터·속성 구성이 바뀝니다. 현재 최고 도달 깊이보다 한 단계 높은 곳까지 도전할 수 있으며, 승리하면 다음 깊이가 열립니다. ${LAST_HUNTING_THEME?.name ?? "마지막 사냥터"}가 현재 프론티어의 끝입니다.`}
      />

      <H2>사냥과 스태미나</H2>
      <P>
        사냥 1회에는 <Em>스태미나 1</Em>을 사용하며 몬스터 한 마리와 자동으로
        전투합니다. 일괄 사냥으로 여러 전투를 묶어 진행할 수도 있습니다. 패배하면
        보상을 받지 못하지만 추가 손실은 없습니다.
      </P>
      <Table
        head={["요소", "값"]}
        rows={[
          ["사냥 1회 비용", <Code key="c">1</Code>],
          ["최대치", <Code key="m">{MAX_STAMINA.toLocaleString()}</Code>],
          ["회복 속도", <Code key="r">{REGEN_SECONDS_PER_POINT}초당 1</Code>],
        ]}
        caption="스태미나는 사냥과 거점 점령 일기토에 사용합니다. 스태미나 포션으로 최대치를 넘겨 비축할 수 있습니다."
      />

      <H2>HP</H2>
      <P>
        HP가 너무 낮으면 사냥할 수 없습니다. HP는 시간이 지나면 회복되며 마을
        치료소에서 즉시 모두 채울 수 있습니다.
      </P>

      <Note>
        자동 사냥은 지원하지 않습니다. 사냥은 화면에서 직접 시작해야 하며,
        접속하지 않은 동안에는 스태미나와 HP만 회복됩니다.
      </Note>

      <H2>원정</H2>
      <P>
        프론티어 깊이 <Em>{STORM_EXPEDITION_UNLOCK_DEPTH}</Em>를 돌파하면 전투 탭의
        원정이 열립니다. 원정은 하루{" "}
        <Em>{STORM_EXPEDITION_DAILY_ATTEMPTS}회</Em> 입장할 수 있으며, 한 번의
        원정은 연속된 <Em>{STORM_EXPEDITION_STAGE_COUNT}개 구간</Em>으로
        구성됩니다.
      </P>
      <UL>
        <li>항로를 고르면 HP와 MP를 유지한 채 다음 구간으로 이어서 싸웁니다.</li>
        <li>
          구간을 돌파할 때마다 미확정 골드가 쌓입니다. 중간에 귀환하면 지금까지
          모은 골드를 확보합니다.
        </li>
        <li>
          다음 구간에서 패배하면 해당 원정의 미확정 골드를 모두 잃습니다. 남은
          상태와 보상을 보고 계속 진행할지 결정해야 합니다.
        </li>
      </UL>

      <H2>전리품</H2>
      <UL>
        <li>
          <Em>재료</Em> — 강화석(장비 강화)과 보스 소환서가 낮은 확률로 떨어지며,
          거래소에서 사고팔 수 있습니다.
        </li>
        <li>
          <Em>장비</Em> — 깊이별 풀에서 드랍됩니다. 같은 장비도 옵션 굴림이 달라
          더 좋은 굴림을 노린 재드랍 추격이 가능하고, 드물게 드랍 전용{" "}
          <Em>유니크</Em>가 나옵니다.
        </li>
        <li>
          <Em>희귀 탐사</Em> — 아주 낮은 확률로 열리는 특별 사냥. 발견된
          깊이에서 보상이 크게 불어난 농축 사냥을 진행합니다. 비밀 상점·개명
          신전도 별도의 희귀 장소 레어맵으로 열리며, 모두 거래소에서 거래됩니다.
        </li>
      </UL>

      <H2>희귀 탐사와 희귀 장소</H2>
      <P>
        모든 레어맵은 <Em>일반 사냥 승리</Em> 때 낮은 확률로 열립니다. 발견 후{" "}
        {RARE_MAP_TTL_MINUTES}분 동안 전투 탭 → 사냥터의 <Em>열린 레어맵</Em>에서
        입장합니다. 비밀 상점과 개명 신전도 소모품이 아니라 이 목록에 열린
        희귀 장소로 표시됩니다.
      </P>
      <Table
        head={["희귀 탐사", "열리는 곳", "횟수", "보너스", "승리당 개방률"]}
        rows={HUNT_RARE_MAP_IDS.map((id) => {
          const def = RARE_MAP_KINDS[id];
          return [
            <Em key={id}>{def.name}</Em>,
            "발견 깊이의 농축 사냥터",
            `${def.runs}판`,
            rareMapRewardText(def),
            percentText(def.dropPct),
          ];
        })}
        caption={`희귀 탐사는 열린 깊이로만 진행됩니다. 개방 후 ${RARE_MAP_TTL_MINUTES}분 동안 유효하고, 판수는 승패와 무관하게 소모되며, 희귀 탐사 안에서는 또 다른 희귀 탐사가 열리지 않습니다.`}
      />
      <Table
        head={["희귀 장소", "열리는 곳", "완료 조건", "용도", "승리당 개방률"]}
        rows={LOCATION_RARE_MAP_IDS.map((id) => {
          const def = RARE_MAP_KINDS[id];
          return [
            <Em key={id}>{def.name}</Em>,
            id === "secret_shop_map" ? "비밀 상점" : "개명의 신전",
            id === "secret_shop_map" ? "모든 품목 구매" : "개명 1회",
            def.desc,
            percentText(def.dropPct),
          ];
        })}
        caption={`희귀 장소는 인벤토리 소모품이 아니며, 사냥터의 열린 레어맵 목록에서 입장합니다. 발견 후 ${RARE_MAP_TTL_MINUTES}분 동안 유효하며, 보유한 모든 레어맵은 합쳐서 최대 ${RARE_MAP_CAP}장까지 유지됩니다.`}
      />

      <Note>
        어느 길드가 점령한 영토에서 사냥하면 골드 일부가 <Em>세금</Em>으로 그
        길드에 넘어갑니다(내 길드면 면제). 자세한 건 <Em>지도·거점·정착지</Em>{" "}
        페이지를 참고하세요.
      </Note>
    </>
  );
}
