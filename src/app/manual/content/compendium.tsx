import {
  CODEX_MASTERY_STAGES,
  type CodexMasteryCategory,
} from "@/adventure/data/v2/codexMasteryTypes";
import { CODEX_MASTERY_TROPHY_TIER_LABELS } from "@/adventure/data/v2/codexMasteryTrophies";
import { H2, P, UL, Em, Table, Note } from "./primitives";

const MASTERY_FIELDS: ReadonlyArray<[CodexMasteryCategory, string, string]> = [
  ["equipment", "장비 연구", "장비 획득과 제작 횟수"],
  ["fish", "어류 연구", "어종별 낚시 횟수와 최고 기록"],
  ["monster", "생태 연구", "몬스터별 사냥 승리 횟수"],
  ["cooking", "미식 연구", "요리별 완성 횟수"],
  ["life", "현장 연구", "지역 활동·환경·발견 기록"],
  ["job", "직업 연구", "직업별 전투·생활·훈련 숙련 기록"],
];

const MASTERY_STAGE_LABELS: Record<(typeof CODEX_MASTERY_STAGES)[number], string> = {
  discovered: "발견",
  bronze: "동",
  silver: "은",
  gold: "금",
  platinum: "백금",
  diamond: "다이아",
  legendary: "전설",
};

const MASTERY_STAGE_TEXT = CODEX_MASTERY_STAGES.map(
  (stage) => MASTERY_STAGE_LABELS[stage],
).join(" → ");

const TROPHY_TIER_TEXT = Object.values(CODEX_MASTERY_TROPHY_TIER_LABELS).join("·");

export function CompendiumContent() {
  return (
    <>
      <H2>모험의 서</H2>
      <P>
        모험의 서는 사냥과 수집, 직업 성장 기록을 모아 보는 도감입니다. 캐릭터 탭
        → 모험의 서에서 항목별 진행도를 확인합니다.
      </P>
      <Table
        head={["갈래", "내용"]}
        rows={[
          [
            <Em key="h">사냥터</Em>,
            "개방한 구역의 몬스터 정보와 공통·지역·몬스터 전용 재료, 장비 드랍 목록.",
          ],
          [<Em key="e">장비</Em>, "등록한 장비와 부위·세트별 수집 진행도."],
          [<Em key="s">SP 열매</Em>, "사용한 SP 열매와 종류별 누적 기록."],
          [<Em key="f">어보</Em>, "낚은 물고기 종류와 개인 최고 크기."],
          [<Em key="ti">칭호</Em>, "획득한 칭호. 장착하면 이름 앞에 표시됩니다."],
          [<Em key="j">직업</Em>, "해금한 직업과 배운 스킬, 다음 직업의 조건."],
          [
            <Em key="l">현장 기록</Em>,
            "낚시·벌목·채광 지역과 오늘의 환경, 발견 흔적의 관찰 횟수와 메달.",
          ],
          [
            <Em key="m">도감 숙련</Em>,
            "반복 수집·사냥·생활·직업 활동을 장기 단계와 점수로 기록합니다.",
          ],
        ]}
      />

      <H2>도감 숙련</H2>
      <P>
        한 번 발견하는 데서 끝나지 않고 같은 항목을 반복해 모으고 경험한 기록을
        키우는 장기 수집 목표입니다. 캐릭터 → 모험의 서 → <Em>도감 숙련</Em>에서
        분야별 점수, 최근 승급, 승급 임박 항목을 확인하고 최대 5개 목표를 고정할 수
        있습니다.
      </P>
      <Table
        head={["분야", "쌓이는 기록"]}
        rows={MASTERY_FIELDS.map(([, label, description]) => [label, description])}
        caption="분야별 항목과 요구 횟수는 희귀도와 활동 종류에 따라 다릅니다."
      />
      <P>
        각 항목은 <Em>{MASTERY_STAGE_TEXT}</Em> 순서로 승급합니다. 특별한 조건을
        달성하면 별도 인장도 기록됩니다. 승급과 인장은 종합·분야 점수와
        <Em>종합·분야별 영구 랭킹</Em>에 반영됩니다.
      </P>
      <Note>
        도감 숙련 점수와 트로피는 수집 기록과 명예를 위한 목표입니다. 숙련 승급
        자체로 <Em>SP·스탯·드랍률</Em>이나 골드 보너스가 추가되지는 않습니다. 기존
        장비 도감·어보의 SP 수집 보상은 별도 규칙으로 유지됩니다.
      </Note>

      <H2>월간 연구</H2>
      <P>
        월간 연구는 KST 달력 기준으로 열리는 시즌 수집전입니다. 그달의 연구 목표와
        여러 분야 활동, 최고 기록을 합쳐 총 <Em>20,000점</Em>까지 쌓습니다.
      </P>
      <Table
        head={["점수 갈래", "최대 점수"]}
        rows={[
          ["연구 목표", "12,000"],
          ["다양성", "5,000"],
          ["기록", "3,000"],
        ]}
        caption="연구 목표 12,000 · 다양성 5,000 · 기록 3,000점으로 구성됩니다."
      />
      <UL>
        <li>진행 중에는 현재 점수와 <Em>잠정 순위</Em>, 예상 트로피 등급을 확인합니다.</li>
        <li>
          시즌 종료 뒤 운영 결산·트로피 발급·공개가 끝나면 확정 순위와
          <Em>명예의 전당</Em> 기록으로 보존됩니다.
        </li>
        <li>
          도감 숙련과 월간 연구 트로피는 <Em>{TROPHY_TIER_TEXT}</Em> 단계이며 캐릭터의
          트로피 전시대에서 확인합니다.
        </li>
      </UL>

      <P>
        사냥터 갈래의 <Em>전 지역 공통 재료</Em>에는 모든 일반 사냥에서 얻을 수
        있는 재료가 표시됩니다. 각 사냥터 카드에서는 해당 깊이의 제작 재료와
        몬스터 전용 재료를 기본 드랍률과 함께 확인할 수 있습니다. 희귀 지도 보정이
        적용되는 재료는 별도 표식으로 구분됩니다.
      </P>
      <P>
        장비 목록은 그 사냥터에서 실제로 나올 수 있는 전체 후보를 보여 줍니다.
        각 후보에는 장비 도감의 <Em>등록·미등록</Em> 상태가 함께 표시되어 아직 얻지
        못한 장비를 바로 구분할 수 있습니다.
        <Em>천공 균열</Em>은 모든 난이도에서 같은 6티어 방어구 후보를 표시하며,
        난이도에 따라 후보가 바뀌지 않고 총 드랍률만 달라집니다. 78단계 전용 무기
        완제품은 별도 확률로 표시됩니다. 시그니처 유니크 12종은 천공 균열 전
        구간에서 같은 초저확률 후보 풀로 표시됩니다. <Em>별의 무덤</Em>에서도 같은
        12종을 노릴 수 있으며, 카드에는 처치당 총 드랍률 0.0035%가 표시됩니다.
      </P>

      <H2>칭호</H2>
      <P>
        칭호는 게시판 활동 이정표, 낚시·투기장 상점이나 수집 보상으로 얻습니다.
        칭호 갈래에서 하나를 장착하면 <Em>채팅</Em>의 이름 앞에 노랗게
        표시되고, 다시 눌러 해제할 수 있습니다.
      </P>

      <H2>점진 공개</H2>
      <UL>
        <li>
          아직 만나지 못한 항목은 흐리게 표시되거나 「???」로 가려집니다. 한 번
          발견하면 정보가 열리며, 어보에는 개인 최고 크기도 함께 기록됩니다.
        </li>
        <li>
          직업 갈래는 <Em>해금한 직업만</Em> 오르며, 조건(계보 직업의
          숙련도)을 채울 때마다 한 줄씩 늘어납니다.
        </li>
      </UL>

      <Note>
        장비 도감과 어보의 수집 단계는 SP 최대치에도 반영됩니다. 새 장비나 어종을
        얻었다면 모험의 서에서 다음 보상 조건을 확인해 주세요. 이 기존 SP 보상은 위
        도감 숙련 점수와는 별도로 계산됩니다.
      </Note>
    </>
  );
}
