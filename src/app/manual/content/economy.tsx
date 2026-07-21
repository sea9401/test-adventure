import { MAX_STAMINA, REGEN_SECONDS_PER_POINT } from "@/adventure/v2/stamina";
import { H2, H3, P, UL, Em, Code, Table, Note } from "./primitives";

export function EconomyContent() {
  return (
    <>
      <H2>골드</H2>
      <P>
        골드는 장비와 이동, 회복에 두루 사용하는 기본 통화입니다.
      </P>
      <H3>버는 법</H3>
      <UL>
        <li>
          <Em>사냥 승리</Em> — 몬스터를 처치할 때 골드를 받습니다. 깊은
          사냥터일수록 획득량이 많습니다.
        </li>
        <li>
          <Em>투기장 승리</Em> · <Em>판매</Em>(안 쓰는 장비·재료) ·{" "}
          <Em>거점 세금</Em>(길드 금고 회수).
        </li>
      </UL>
      <H3>쓰는 법</H3>
      <UL>
        <li>장비 강화(대장간), 상점 장비 구매.</li>
        <li>치료소 회복·HP 충전약, 지도 타일 이동.</li>
        <li>다른 길드가 점령한 영토에서 사냥하면 골드 일부가 세금으로 빠집니다.</li>
      </UL>
      <P>
        마을의 <Em>은행</Em>에 골드를 예치해 둘 수 있습니다. 예치금은 모든 지출에
        먼저 사용됩니다. 예치금은 사망 시 발생하는 손실 세금에서 제외됩니다.
      </P>
      <Note>
        사냥 수익을 계산할 때는 영토 세금과 HP·MP 충전 비용도 함께 확인해야
        합니다. 받는 피해와 MP 소모가 적을수록 실제로 남는 골드가 많아집니다.
      </Note>

      <H2>스태미나</H2>
      <Table
        head={["요소", "값"]}
        rows={[
          ["최대치", <Code key="m">{MAX_STAMINA.toLocaleString()}</Code>],
          ["회복", <Code key="r">{REGEN_SECONDS_PER_POINT}초당 1</Code>],
          ["사냥 1회", <Code key="h">−1</Code>],
          [
            "0 → 가득",
            <Code key="f">
              약 {((MAX_STAMINA * REGEN_SECONDS_PER_POINT) / 3600).toFixed(1)} 시간
            </Code>,
          ],
        ]}
        caption="스태미나를 쓰는 것은 사냥과 거점 점령 일기토뿐입니다(타일 이동은 골드). 자리비움 동안에도 차오릅니다."
      />

      <H2>HP 회복</H2>
      <UL>
        <li>
          <Em>시간 회복</Em> — 최대 HP와 관계없이 약 5분이면 0에서 최대치까지
          회복됩니다.
        </li>
        <li>
          <Em>치료소</Em> — HP와 MP를 무료로 즉시 회복합니다.
        </li>
        <li>
          <Em>HP 충전약</Em> — 1골드당 1충전을 구매합니다. 전투 직후 부족한 HP를
          자동으로 채웁니다.
        </li>
        <li>
          HP가 최대치의 <Em>5% 미만</Em>이면 사냥할 수 없습니다. 자연 회복을
          기다리거나 치료소를 이용해야 합니다.
        </li>
      </UL>

      <H2>MP</H2>
      <P>
        MP는 스킬을 사용할 때 소모합니다. 전투가 끝나도 남은 MP는 유지되며,
        부족분은 <Em>MP 충전약</Em>으로 자동 보충됩니다. 충전약은 치료소에서
        1골드당 1충전으로 구매합니다.
      </P>
      <P>
        스킬별 MP 소모량은 스킬 상세에 표시됩니다. 강한 스킬을 자주 사용하는
        구성일수록 MP 충전량을 넉넉히 준비해야 합니다. 치료소의 「전부 회복」은
        HP와 MP를 함께 채웁니다.
      </P>
    </>
  );
}
