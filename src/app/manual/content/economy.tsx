import { MAX_STAMINA, REGEN_SECONDS_PER_POINT } from "@/adventure/v2/stamina";
import { H2, H3, P, UL, Em, Code, Table, Note } from "./primitives";

export function EconomyContent() {
  return (
    <>
      <H2>골드</H2>
      <P>골드는 장비와 성장, 회복에 두루 사용하는 기본 통화입니다.</P>
      <H3>버는 법</H3>
      <UL>
        <li>
          <Em>사냥 승리</Em> — 몬스터를 처치할 때 골드를 받습니다. 깊은
          사냥터일수록 획득량이 많습니다.
        </li>
        <li>
          <Em>투기장 승리</Em> · <Em>퀘스트 보상</Em> ·{" "}
          <Em>판매</Em>(사용하지 않는 장비·재료).
        </li>
      </UL>
      <H3>쓰는 법</H3>
      <UL>
        <li>장비 강화(대장간), 상점 장비 구매.</li>
        <li>HP·MP 충전약 구매, 스킬 습득과 각종 성장 비용.</li>
      </UL>
      <P>
        마을의 <Em>은행</Em>에 골드를 예치해 둘 수 있습니다. 예치금은 모든 지출에
        먼저 사용됩니다. 예치금은 사냥 패배 시 발생하는 골드 손실에서 제외됩니다.
      </P>
      <Note>
        사냥에서 일반 패배하면 마지막 패배 이후 사냥으로 번 골드 중 일부를
        잃습니다. 시간초과는 골드 페널티 계산에서 무승부로 처리되어 손실이
        없습니다. 자주 쓰지 않을 골드는 은행에 입금해 두는 편이 안전합니다.
        거점이나 영지의 점령 상태와 관계없이 사냥 보상에 별도의 지역 세금은 붙지
        않습니다.
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
        caption="스태미나는 사냥할 때 사용하며, 접속하지 않은 동안에도 회복됩니다."
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
