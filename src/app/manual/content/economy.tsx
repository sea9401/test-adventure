import { MAX_STAMINA, REGEN_SECONDS_PER_POINT } from "@/adventure/v2/stamina";
import { H2, H3, P, UL, Em, Code, Table, Note } from "./primitives";

export function EconomyContent() {
  return (
    <>
      <H2>골드</H2>
      <P>
        골드는 단일 통화이자 <Em>회복 통화</Em>입니다. 모으는 길과 쓰는 길이
        맞물려 있어요.
      </P>
      <H3>버는 법</H3>
      <UL>
        <li>
          <Em>사냥 승리</Em> — 처치마다 골드를 받습니다. 강한 몬스터일수록 많아요.
        </li>
        <li>
          <Em>투기장 승리</Em> · <Em>판매</Em>(안 쓰는 장비·재료) ·{" "}
          <Em>거점 세금</Em>(길드 금고 회수).
        </li>
      </UL>
      <H3>쓰는 법</H3>
      <UL>
        <li>장비 강화·재련(대장간), 상점 장비 구매.</li>
        <li>치료소 회복·HP 충전약, 지도 타일 이동.</li>
        <li>다른 길드가 점령한 영토에서 사냥하면 골드 일부가 세금으로 빠집니다.</li>
      </UL>
      <P>
        마을의 <Em>은행</Em>에 골드를 예치해 둘 수 있습니다. 예치금은 모든 지출에
        먼저 쓰이고, 사망 시 손실 세금에서도 면제되는 안전한 버퍼예요.
      </P>
      <Note>
        실수령 골드 ≈ 벌어들인 골드 − 세금 − 회복에 쓴 충전약. 회복비가 곧 골드
        지출이라, 단단한 빌드일수록 골드도 더 남습니다.
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
          <Em>시간 회복</Em> — 아무것도 안 해도 약 5 분이면 0 에서 가득까지
          차오릅니다(최대 HP 와 무관).
        </li>
        <li>
          <Em>치료소</Em> — <Em>무료</Em>로 즉시 만피.
        </li>
        <li>
          <Em>HP 충전약</Em> — 1 골드당 1 충전(1 충전 = 1 HP). 사냥으로 깎인 HP 를
          전투 직후 자동으로 채워, 끊김 없이 다음 사냥으로 이어줘요.
        </li>
        <li>
          HP 가 최대치의 <Em>5% 미만</Em>이면 사냥이 잠깁니다 — 회복을 기다리거나
          치료소에 들르세요.
        </li>
      </UL>

      <H2>MP</H2>
      <P>
        MP 는 속성 스킬을 쓰는 자원입니다. HP 처럼 전투 후에도 남은 MP 가
        유지되고, 부족분은 <Em>MP 충전약</Em>(치료소에서 1 골드 = 1 충전)으로
        자동 충당됩니다. 충전약이 바닥나면 MP 가 줄어 마법 위력이 빠져요.
      </P>
      <P>
        스킬마다 <Em>MP 소모량</Em>이 정해져 있어(스킬 상세에 표시), 마법을 주력
        으로 쓰는 직업일수록·높은 차수의 스킬일수록 더 많이 씁니다. 치료소의 「전부
        회복」은 HP 와 MP 를 함께 채워요.
      </P>
    </>
  );
}
