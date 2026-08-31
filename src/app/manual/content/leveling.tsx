import { V2_LEVEL_CAP } from "@/adventure/data/v2/coreLoopConfig";
import {
  V2_HP_PER_LEVEL,
  V2_MP_PER_LEVEL,
} from "@/adventure/data/v2/v2Stats";
import {
  NEWBIE_BONUS_BATTLE_THRESHOLD,
  NEWBIE_EXP_MULTIPLIER,
  XP_RATE_MULT,
  getLevelTable,
} from "@/lib/leveling";
import { H2, P, UL, Em, Note } from "./primitives";

const TOTAL_EXP_TO_LEVEL_CAP = getLevelTable().at(-1)?.cumulative ?? 0;

export function LevelingContent() {
  return (
    <>
      <H2>레벨 1~{V2_LEVEL_CAP}</H2>
      <P>
        최고 레벨은 <Em>{V2_LEVEL_CAP}</Em>입니다. 레벨이 오를 때마다 스탯이
        자동으로 배분되고 최대 HP가 {V2_HP_PER_LEVEL}, 최대 MP가{" "}
        {V2_MP_PER_LEVEL} 늘어납니다. 직접 스탯을 나누는 방식은 아닙니다. 자세한
        성장 규칙은 <Em>스탯과 성장</Em>에서 확인할 수 있습니다.
      </P>

      <H2>EXP 곡선</H2>
      <P>
        다음 레벨까지 필요한 EXP는 구간마다 증가합니다. 레벨 1부터{" "}
        {V2_LEVEL_CAP}까지 총 <Em>{TOTAL_EXP_TO_LEVEL_CAP.toLocaleString("ko-KR")} EXP</Em>가
        필요합니다. 실제 획득량에는 서버 경험치 배율이 적용됩니다.
      </P>

      <H2>경험치 배율과 신참 보너스</H2>
      <UL>
        <li>
          <Em>경험치 배율</Em> — 모든 획득 EXP에 적용되는 서버 설정값입니다.
          현재 빌드에는 <Em>{XP_RATE_MULT}배</Em>가 적용되며 운영 중 조정될 수
          있습니다.
        </li>
        <li>
          <Em>신참 보너스</Em> — 누적 전투 전적이{" "}
          <Em>{NEWBIE_BONUS_BATTLE_THRESHOLD.toLocaleString("ko-KR")}회 이하</Em>이면
          사냥 EXP가 <Em>{NEWBIE_EXP_MULTIPLIER}배</Em>가 됩니다. 레벨이 아닌 전적을
          기준으로 하므로, 전직 후 레벨이 1이 되어도 베테랑에게는 적용되지
          않습니다.
        </li>
        <li>
          <Em>깨달음의 허브차</Em> — 요리로 만들고 가방에서 사용하는 시간제
          버프 음식입니다. 일반품은 사냥 경험치 +60%, 은빛잎을 넣은 희귀 특선은
          +90%이며 정성작·걸작은 품질에 따라 효과가 더 높아집니다.
        </li>
      </UL>
      <Note>
        신참 보너스는 EXP에만 적용됩니다. 전리품 확률은
        신참이든 베테랑이든 동일합니다.
      </Note>

      <H2>레벨업 처리</H2>
      <UL>
        <li>한 번에 여러 레벨이 오르면 연쇄 레벨업이 처리됩니다.</li>
        <li>최고 레벨에 도달하면 남은 EXP는 0으로 정리됩니다.</li>
        <li>
          스탯 자동 성장은 <Em>레벨업할 때만</Em> 적용됩니다. {V2_LEVEL_CAP}레벨에서
          사냥을 계속해도 별도의 스탯 성장 게이지는 쌓이지 않습니다.
        </li>
        <li>
          <Em>전직</Em>하면 레벨은 1로 돌아가지만 직업 <Em>숙련도</Em>는
          유지됩니다. 자세한 내용은 <Em>직업·숙련도·전직</Em>에서 확인할 수
          있습니다.
        </li>
      </UL>

      <H2>스탯 한계도 함께 올리기</H2>
      <P>
        레벨업은 스탯을 <Em>한계치까지만</Em> 채웁니다. 한계가 막혀 있으면 레벨이
        올라도 더 강해지지 않으니, 사냥으로 모은 <Em>숙달 포인트</Em>를 성장의
        신전의 수행에 사용해 한계도 함께 넓혀야 합니다.
      </P>
    </>
  );
}
