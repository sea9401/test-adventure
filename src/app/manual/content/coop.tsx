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
      <H2>협동 보스란</H2>
      <P>
        사냥에서 모은 <Em>보스 소환서</Em>로 깨우는 서버 공용 보스입니다. 한 번
        소환되면 <Em>모든 모험가가 같은 보스</Em>를 함께 공격하고, 누적 데미지로 HP
        가 0 이 되면 토벌 성공 — 기여한 만큼 보상을 받습니다(전투 탭 → 협동 보스).
      </P>

      <H2>소환서 모으기</H2>
      <P>
        사냥 승리 시 낮은 확률로 <Em>보스 소환서</Em>가 떨어집니다(모든 깊이 공통).
        인벤토리 재료 탭에 쌓이고, 거래소에서 사고팔 수 있어요.
      </P>

      <H2>소환과 토벌</H2>
      <UL>
        <li>
          소환서를 모아 보스를 깨웁니다. 강한 보스일수록 더 많은 소환서가 들고, 더
          오래 유지되며 보상도 좋습니다. 같은 보스를 여럿 동시에 소환할 수도 있어요.
        </li>
        <li>
          공격은 <Em>무료</Em>입니다(소환서가 곧 비용). 누르면 자동 전투가 돌아가고,
          내가 깎은 HP 가 그대로 기여도로 쌓입니다.
        </li>
        <li>
          보스도 반격합니다 — 고유 스킬과 상태이상이 있고, HP 가 낮아지면 더
          사나워져요. 지속 시간 안에 못 잡으면 사라지고 보상도 없습니다.
        </li>
      </UL>

      <H2>공개 범위</H2>
      <P>
        소환할 때 누가 함께 칠 수 있는지 <Em>공개 / 길드원만 / 나만</Em> 중에서
        고릅니다. 소환 뒤에도 바꿀 수 있으니, 나만이나 길드원만으로 시작해 기여를
        충분히 쌓은 뒤 공개로 열어 함께 마무리하는 식으로 쓰세요.
      </P>

      <H2>기여 보상</H2>
      <P>
        토벌에 성공하면 <Em>내 누적 데미지 비율</Em>로 기여 티어가 정해지고, 높을수록
        좋은 보상을 <Em>확률로</Em> 받습니다 — SP 최대치를 영구히 올리는{" "}
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
        caption="장비 상자는 인벤토리 소모품 영역에서 사용하며, 해당 구간의 정규 장비 중 하나를 무작위로 줍니다."
      />
      <Note>
        SP 열매와 상급 숙련 교본은 거래소에서 거래할 수 있습니다. 상급 숙련 교본은
        사용하면 현재 직업 숙련도가 {COOP_MASTERY_TOME_GAIN} 오릅니다. 토벌에
        참여만 해도 처치 기록은 남지만, 보상은 일정 기여 이상부터 확률로 나옵니다.
      </Note>
    </>
  );
}
