import { MAX_STAMINA, REGEN_SECONDS_PER_POINT } from "@/adventure/v2/stamina";
import {
  RARE_MAP_CAP,
  RARE_MAP_KINDS,
  type RareMapKind,
  type RareMapKindId,
} from "@/adventure/data/v2/rareMaps";
import { H2, P, UL, Em, Code, Table, Note } from "./primitives";

const HUNT_RARE_MAP_IDS = [
  "worn_map",
  "gilded_map",
  "sage_map",
  "hunter_map",
  "relic_map",
] satisfies RareMapKindId[];

const UTILITY_RARE_MAP_IDS = [
  "secret_shop_map",
  "rename_map",
  "portrait_map",
] satisfies RareMapKindId[];

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
      <H2>사냥터 — 프론티어</H2>
      <P>
        사냥은 <Em>사냥터</Em>를 고르는 것으로 시작합니다(전투 탭 → 사냥터).
        사냥터는 <Em>깊이 1 에서 이어지는 단일 프론티어</Em>로, 깊을수록 몬스터가
        강해지고 보상도 커집니다.
      </P>
      <Table
        head={["테마", "깊이"]}
        rows={[
          [<Em key="t1">들판</Em>, "1 ~ 6"],
          [<Em key="t2">마른 협곡</Em>, "7 ~ 12"],
          [<Em key="t3">얼음 호수</Em>, "13 ~ 18"],
          [<Em key="t4">심층 동굴</Em>, "19 ~ 24"],
          [<Em key="t5">잊힌 성소</Em>, "25 ~ 30"],
          [<Em key="t6">리자드 늪지</Em>, "31 ~ 36"],
          [<Em key="t7">짐승의 소굴</Em>, "37 ~ 42"],
          [<Em key="t8">검은 왕도</Em>, "43 ~ 48"],
        ]}
        caption="6깊이마다 테마가 바뀌고, 테마마다 몬스터·속성 구성이 다릅니다. 입장은 내 최고 도달 깊이 +1 까지 — 도전 깊이에서 승리하면 다음 깊이가 열립니다(수동 푸시). 현재 가장 깊은 테마(검은 왕도)가 프론티어의 끝입니다."
      />

      <H2>사냥과 스태미나</H2>
      <P>
        사냥 1회는 <Em>스태미나 1</Em> 을 쓰고 몬스터 한 마리와 자동 단판으로
        붙습니다. 여러 회를 한 번에 몰아 돌릴 수도 있어요. 패배해도 잃는 건
        없습니다(보상 0).
      </P>
      <Table
        head={["요소", "값"]}
        rows={[
          ["사냥 1회 비용", <Code key="c">1</Code>],
          ["최대치", <Code key="m">{MAX_STAMINA.toLocaleString()}</Code>],
          ["회복 속도", <Code key="r">{REGEN_SECONDS_PER_POINT}초당 1</Code>],
        ]}
        caption="스태미나는 사냥 페이스를 조절하는 장치이고, 쓰는 것은 사냥뿐입니다. 스태미나 포션으로 최대치 위로 더 비축해 둘 수 있어요."
      />

      <H2>HP</H2>
      <P>
        HP 가 너무 낮으면 사냥이 잠깁니다. 시간이 지나면 저절로 회복되고, 마을
        치료소에서 즉시 가득 채울 수 있어요.
      </P>

      <Note>
        오프라인으로 시간만 흘려 보상을 받는 자동 사냥은 없습니다 — 사냥은 전부
        직접 돌리는 능동 플레이이고, 자리비움 동안은 스태미나와 HP 만 차오릅니다.
      </Note>

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
          <Em>레어맵</Em> — 아주 낮은 확률로 발견되는 소모품 지도. 성장맵은 그
          깊이에서 보상이 크게 불어난 농축 사냥을, 유틸맵은 비밀 상점·개명·초상화
          변경 같은 특별한 장소로 데려갑니다. 모두 거래소에서 거래됩니다.
        </li>
      </UL>

      <H2>레어맵 지도</H2>
      <P>
        레어맵은 <Em>일반 사냥 승리</Em> 때 낮은 확률로 발견됩니다. 발견된 지도는
        소모품으로 보관되고, 성장맵은 전투 탭 → 사냥터의 <Em>발견한 지도</Em>에서,
        유틸맵은 가방의 소모품 탭에서 사용합니다.
      </P>
      <Table
        head={["지도", "열리는 곳", "횟수", "보너스", "승리당 발견률"]}
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
        caption="성장맵 사냥은 입장한 지도의 발견 깊이로만 진행됩니다. 판수는 승패와 무관하게 소모되고, 레어맵 안에서는 또 다른 레어맵이 발견되지 않습니다."
      />
      <Table
        head={["지도", "열리는 곳", "횟수", "용도", "승리당 발견률"]}
        rows={UTILITY_RARE_MAP_IDS.map((id) => {
          const def = RARE_MAP_KINDS[id];
          return [
            <Em key={id}>{def.name}</Em>,
            id === "secret_shop_map"
              ? "비밀 상점"
              : id === "rename_map"
                ? "개명의 신전"
                : "화공의 공방",
            `${def.runs}회`,
            def.desc,
            percentText(def.dropPct),
          ];
        })}
        caption={`유틸맵은 사냥터가 아니라 숨겨진 기능 입장권입니다. 비밀 상점의 지도는 발견 후 1시간 동안 유효하며, 보유 레어맵은 최대 ${RARE_MAP_CAP}장까지 들 수 있습니다.`}
      />

      <Note>
        어느 길드가 점령한 영토에서 사냥하면 골드 일부가 <Em>세금</Em>으로 그
        길드에 넘어갑니다(내 길드면 면제). 자세한 건 <Em>지도·거점·정착지</Em>{" "}
        페이지를 참고하세요.
      </Note>
    </>
  );
}
