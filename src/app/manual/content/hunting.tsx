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
  STORM_EXPEDITION_SP_FRUIT_CAP,
  STORM_EXPEDITION_SP_FRUIT_CHANCE,
  STORM_EXPEDITION_SP_FRUIT_PITY_CLEARS,
} from "@/adventure/data/v2/stormExpeditionRewards";
import {
  MAX_FRONTIER_DEPTH,
  dungeonThemeCatalog,
  huntStageName,
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
      <H2>사냥터 진행</H2>
      <P>
        사냥은 <Em>사냥터</Em>를 고르는 것으로 시작합니다(전투 탭 → 사냥터).
        각 사냥터에는 <Em>입구·심부·최심부</Em>의 3단계가 있으며, 뒤쪽 단계일수록
        몬스터가 강해지고 보상도 커집니다.
      </P>
      <Table
        head={["사냥터", "단계"]}
        rows={HUNTING_THEMES.map((theme) => [
          <Em key={theme.name}>{theme.name}</Em>,
          "입구 · 심부 · 최심부",
        ])}
        caption={`현재 단계에서 승리하면 다음 단계가 열리고, 최심부를 돌파하면 다음 사냥터로 이어집니다. ${LAST_HUNTING_THEME?.name ?? "마지막 사냥터"}가 현재 마지막 사냥터입니다.`}
      />

      <H2>사냥과 스태미나</H2>
      <P>
        사냥 1회에는 <Em>스태미나 1</Em>을 사용하며 몬스터 한 마리와 자동으로
        전투합니다. 일괄 사냥으로 여러 전투를 묶어 진행할 수도 있습니다. 패배하면
        이번 전투 보상을 받지 못하고 마지막 패배 이후 사냥으로 번 골드 일부를
        잃습니다. 시간초과는 골드 페널티 계산에서 무승부로 처리되어 손실이
        없습니다. 은행 예치금과 장비·경험치는 안전합니다.
      </P>
      <Table
        head={["요소", "값"]}
        rows={[
          ["사냥 1회 비용", <Code key="c">1</Code>],
          ["최대치", <Code key="m">{MAX_STAMINA.toLocaleString()}</Code>],
          ["회복 속도", <Code key="r">{REGEN_SECONDS_PER_POINT}초당 1</Code>],
        ]}
        caption="스태미나는 사냥할 때 사용합니다. 스태미나 포션으로 최대치를 넘겨 비축할 수 있습니다."
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
        <Em>{huntStageName(STORM_EXPEDITION_UNLOCK_DEPTH)}</Em>를 돌파하면 전투 탭의
        원정이 열립니다. 원정은 하루{" "}
        <Em>{STORM_EXPEDITION_DAILY_ATTEMPTS}회</Em> 입장할 수 있으며, 한 번의
        원정은 <Em>{STORM_EXPEDITION_STAGE_COUNT}개 체크포인트</Em>와 그 안의
        7개 전투로 구성됩니다.
      </P>
      <UL>
        <li>세 항로 중 하나를 고르면 HP와 MP를 유지한 채 다음 구간으로 이어서 싸웁니다.</li>
        <li>보급품, 야영지, 폭풍 제단, 최종 정비에서 회복이나 원정 전용 강화 효과를 선택할 수 있습니다.</li>
        <li>원정마다 위험 이벤트 하나가 고정됩니다. 정확한 이익과 대가를 확인한 뒤 수락하거나 지나칠 수 있습니다.</li>
        <li>
          적을 처치할 때마다 골드·재료·장비가 임시 가방에 쌓입니다. 중간에 귀환하면
          지금까지 모은 전리품을 모두 확보합니다.
        </li>
        <li>
          다음 전투에서 패배하면 해당 원정의 임시 전리품을 모두 잃습니다. 남은
          상태와 보상을 보고 계속 진행할지 결정해야 합니다.
        </li>
        <li>
          <Em>연습 모드</Em>는 일일 입장 횟수를 소모하지 않고 실전과 같은 항로·전투·
          선택을 체험합니다. 골드·재료·장비·SP 열매는 생성되지 않으며 완주와 천장
          기록도 오르지 않습니다.
        </li>
        <li>
          최종 보스를 처치해 완주하면 <Em>SP 열매 V</Em>를 {percentText(STORM_EXPEDITION_SP_FRUIT_CHANCE * 100)}
          확률로 얻습니다. 항로를 바꿔도 미획득 횟수는 공용으로 누적되며, {STORM_EXPEDITION_SP_FRUIT_PITY_CLEARS}회
          연속 미획득 시 확정 지급됩니다. 원정에서는 캐릭터당 최대 {STORM_EXPEDITION_SP_FRUIT_CAP}개까지 획득할 수 있습니다.
        </li>
      </UL>

      <H2>전리품</H2>
      <UL>
        <li>
          <Em>재료</Em> — 모든 사냥터에서 강화석·보스 소환서·재련석·정착지 재료와
          활력의 파편 등이 독립적으로 떨어집니다. 구간별 길드 제작 재료와 일부
          몬스터 전용 재료도 있으며, 정확한 종류와 기본 확률은 모험의 서 →
          사냥터에서 확인할 수 있습니다.
        </li>
        <li>
          <Em>장비</Em> — 깊이별 풀에서 드랍됩니다. 같은 장비도 옵션 굴림이 달라
          더 좋은 굴림을 노린 재드랍 추격이 가능하고, 드물게 드랍 전용{" "}
          <Em>유니크</Em>가 나옵니다. 단, <Em>천공 균열 73~78단계</Em>의 방어구는
          모든 난이도가 같은 6티어 전역 후보 풀을 사용하고 깊은 구간일수록 총
          드랍률만 높아집니다. 무기 완제품은 78단계에서만 극히 낮은 확률로
          나옵니다.
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
      <P>
        현재 사냥터 진행도보다 깊어 사용할 수 없거나 필요하지 않은 지도는 열린
        레어맵 카드의 <Em>삭제</Em>로 보유 목록에서 비울 수 있습니다. 삭제한 지도는
        복구되지 않습니다.
      </P>
      <P>
        찢어진 지도 조각을 복원할 때는 이미 정복한 사냥 단계 중 지도 깊이를 직접
        선택합니다. 현재 전투력으로 권장되는 단계가 기본으로 선택되므로, 과거 최고
        기록이 현재 빌드에 너무 어렵다면 더 낮은 단계를 고를 수 있습니다.
      </P>
    </>
  );
}
