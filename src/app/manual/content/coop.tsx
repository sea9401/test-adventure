import {
  COOP_EQUIPMENT_BOX,
  COOP_EXTRA_REWARD_RULES,
  COOP_MASTERY_TOME_GAIN,
} from "@/adventure/data/v2/coopRewards";
import { COOP_TIER_LABEL, COOP_TIER_ORDER } from "@/adventure/data/v2/coopBosses";
import { H2, P, UL, Em, Note, Table } from "./primitives";

export function CoopContent() {
  return (
    <>
      <H2>협동 보스</H2>
      <P>
        사냥에서 얻은 <Em>보스 소환서</Em>로 서버 공용 보스를 소환합니다. 여러
        모험가가 같은 보스의 HP를 함께 깎으며, 제한 시간 안에 HP가 0이 되면
        토벌에 성공합니다. 참여 기록과 보상은 전투 탭 → 협동 보스에서 확인합니다.
      </P>

      <H2>소환서 모으기</H2>
      <P>
        사냥 승리 시 낮은 확률로 <Em>보스 소환서</Em>가 떨어집니다(모든 깊이 공통).
        인벤토리 재료 탭에 보관되며 거래소에서 사고팔 수 있습니다.
      </P>

      <H2>소환과 토벌</H2>
      <UL>
        <li>
          강한 보스일수록 더 많은 소환서가 필요하고 유지 시간이 길며 보상도
          좋아집니다. 같은 종류의 보스를 여러 마리 소환할 수도 있습니다.
        </li>
        <li>
          공격에는 별도 비용이 들지 않습니다. 전투에서 깎은 HP가 기여도로
          기록됩니다.
        </li>
        <li>
          보스는 고유 스킬과 상태이상으로 반격하며, HP가 낮아지면 더 강해집니다.
          제한 시간 안에 처치하지 못하면 보상 없이 사라집니다.
        </li>
      </UL>

      <H2>공개 범위</H2>
      <P>
        소환할 때 누가 함께 칠 수 있는지 <Em>공개 / 길드원만 / 나만</Em> 중에서
        선택합니다. 공개 범위는 소환한 뒤에도 바꿀 수 있습니다. 이미 피해를 기록한
        참여자는 범위가 좁아져도 해당 토벌을 계속 확인하고 공격할 수 있습니다.
      </P>

      <H2>기여 보상</H2>
      <P>
        토벌에 성공하면 <Em>누적 피해 비율</Em>에 따라 기여 티어가 정해집니다.
        티어가 높을수록 다음 보상을 받을 확률과 수량이 좋아집니다. SP 최대치를
        영구히 올리는{" "}
        <Em>SP 열매</Em>, 협동 보스에서만 나오는 <Em>보스 전용 유니크 장비</Em>,
        협동 주화·보스 재료·장비 상자입니다. 보상은 협동 보스 화면에서 직접
        수령합니다.
      </P>
      <Table
        head={["기여 티어", "협동 주화", "보스 재료", "장비 상자 확률"]}
        rows={COOP_TIER_ORDER.map((tier) => {
          const rule = COOP_EXTRA_REWARD_RULES[tier];
          return [
            <Em key={tier}>{COOP_TIER_LABEL[tier]}</Em>,
            `x${rule.coin}`,
            `x${rule.bossMaterial}`,
            rule.equipmentBoxChance > 0
              ? `${Math.round(rule.equipmentBoxChance * 100)}%`
              : "-",
          ];
        })}
        caption="SP 열매와 보스 전용 유니크 보상 외에, 기여 티어별 확정 주화·재료와 확률 장비 상자가 추가로 지급됩니다."
      />
      <Table
        head={["장비 상자", "출처"]}
        rows={Object.values(COOP_EQUIPMENT_BOX).map((box) => [
          <Em key={box.id}>{box.name}</Em>,
          box.source,
        ])}
        caption="장비 상자는 인벤토리 소모품 영역에서 사용합니다. 1~4T 상자는 해당 구간의 정규 장비를, 보스 전용 5T 상자는 해당 보스의 전용 장비를 무작위로 줍니다."
      />
      <Note>
        SP 열매와 상급 숙련 교본은 거래소에서 거래할 수 있습니다. 상급 숙련 교본은
        사용하면 현재 직업 숙련도가 {COOP_MASTERY_TOME_GAIN} 오릅니다. 토벌에
        참여하면 처치 기록은 남지만 보상은 일정 기여도 이상부터 지급됩니다.
      </Note>
    </>
  );
}
