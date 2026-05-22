import { H2, P, UL, Em, Code, Table, Note } from "./primitives";

export function StatsContent() {
  return (
    <>
      <H2>5대 스탯</H2>
      <P>
        모든 캐릭터는 다음 다섯 가지 스탯을 가집니다. 레벨 1 시작값은 각 3 입니다.
      </P>
      <Table
        head={["스탯", "주된 역할"]}
        rows={[
          [<Em key="s1">힘 STR</Em>, "공격력 / 강공격·분쇄·처형 계열"],
          [<Em key="s2">민첩 DEX</Em>, "회피 / 정확·반격·분신 계열"],
          [<Em key="s3">활력 VIT</Em>, "최대 HP / 방어력 / 재생·불굴·반사 계열"],
          [<Em key="s4">속도 SPD</Em>, "추가 공격 확률 / 연타·광속·풍사슬"],
          [<Em key="s5">행운 LUK</Em>, "치명타 / 드랍률 / 천명·만개·행운의 별"],
        ]}
      />

      <H2>스탯 1pt 당 환산</H2>
      <Table
        head={["스탯", "환산"]}
        rows={[
          [
            <Em key="r1">STR</Em>,
            <span key="rt1">
              ATK <Code>+1</Code> / 모든 STR 스킬 (강공격·분쇄·처형·출혈·격노·충돌파)
            </span>,
          ],
          [
            <Em key="r2">DEX</Em>,
            <span key="rt2">
              회피 <Code>+0.5%</Code> / 5pt 마다 ATK <Code>+1</Code>
            </span>,
          ],
          [
            <Em key="r3">VIT</Em>,
            <span key="rt3">
              DEF <Code>+1</Code> / 최대 HP <Code>+2</Code> / DEF 5 당 ATK{" "}
              <Code>+1</Code>
            </span>,
          ],
          [
            <Em key="r4">SPD</Em>,
            <span key="rt4">
              추가 공격 확률 <Code>+2.5%</Code> (최대 75%) / 5pt 마다 ATK{" "}
              <Code>+1</Code>
            </span>,
          ],
          [
            <Em key="r5">LUK</Em>,
            <span key="rt5">
              드랍률 <Code>+1%</Code> / 크리 확률 <Code>+0.5%</Code> / 크리 배수{" "}
              <Code>+0.025</Code> / 5pt 마다 ATK <Code>+1</Code>
            </span>,
          ],
        ]}
      />
      <Note>
        DEX/VIT/SPD/LUK 모두가 5pt 마다 ATK +1 을 주는 것이 의도된 설계입니다.
        순수 STR 빌드와 다른 빌드 사이의 격차가 너무 벌어지지 않도록 한 장치예요.
      </Note>

      <H2>스킬 임계 (티어)</H2>
      <P>
        각 스탯은 일정 임계를 넘으면 도감에 스킬이 공개되고, 그보다 5pt 더
        높은 값에서 실제로 발동 가능해집니다. 모든 스탯이 같은 임계 사다리를
        공유합니다.
      </P>
      <Table
        head={["티어", "도감 공개", "발동 임계"]}
        rows={[
          ["1차", "5pt", "10pt"],
          ["2차", "15pt", "20pt"],
          ["3차", "30pt", "35pt"],
          ["4차", "45pt", "50pt"],
          ["5차", "60pt", "65pt"],
          ["6차", "80pt", "85pt"],
        ]}
        caption="실제 스킬 이름·효과는 다음 페이지(스킬과 특기) 표를 참고."
      />

      <H2>최대 HP</H2>
      <P>
        레벨 1 기본 HP 는 97. 레벨업당 HP +5. 여기에 VIT 1pt 당 HP +2 가
        합산되고, 불굴 스킬을 끼면 그 위에 +10% 가 곱해집니다. 룬{" "}
        <Em>생명의 룬</Em> 이 있으면 가장 마지막에 +N% 가 또 곱해집니다.
      </P>
      <Table
        head={["요소", "값"]}
        rows={[
          [
            "최대 HP",
            <Code key="hp">
              ⌊(97 + (Lv − 1) × 5 + VIT × 2) × (1 + 불굴% / 100) × (1 + 생명룬%)⌋
            </Code>,
          ],
        ]}
      />

      <H2>스탯 포인트 얻는 법</H2>
      <UL>
        <li>
          <Em>레벨업</Em> — 1 레벨당 1pt 의 스탯 포인트.
        </li>
        <li>
          <Em>훈련</Em> — 마을 훈련장에서 12시간 훈련 완료 시 단련 포인트 +1.
          길드 <Em>수련 결사</Em> 버프(T5)면 최대 15% 단축 (10.2 시간).
        </li>
        <li>
          <Em>되돌리기 포인트</Em> — 시작 시 10pt 지급. 분배한 스탯을 1pt
          되돌릴 때마다 1pt 소모. 신중하게 분배할 수 있도록 한 예비 슬롯입니다.
        </li>
      </UL>
    </>
  );
}
