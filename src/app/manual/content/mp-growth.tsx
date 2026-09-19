import { V2_BASE_MP, V2_MP_PER_LEVEL } from "@/adventure/data/v2/v2Stats";
import { MP_PER_INT } from "@/lib/server/v2CombatCoefficients";
import { Code, Em, P } from "./primitives";

/** 스탯 안내와 전투 계산식에서 같은 MP 규칙을 보여준다. */
export function MpGrowthExplanation() {
  return <>
    <P>
      <Em>현재 최대 MP</Em> — 최신 성장 방식에서는 시작 MP와 레벨업으로 얻은 MP에{" "}
      <Code>max(0, 기본 INT − 15) + max(0, 기본 SPI − 15)</Code>를 더합니다.
      여기서 기본 INT·SPI는 생애 시작값과 성장분을 합쳐 한계치를 적용한, 직업 등 보정 전 능력치입니다.
      따라서 기본 정신도 15를 초과한 1당 최대 MP를 1 올립니다.
      해방 등의 추가 MP와 장비 MP를 더한 뒤 최대 MP 증가율을 적용하고 내림합니다.
    </P>
    <P>
      <Em>다음 생애의 MP 성장 최솟값</Em> — 현재 전투 정신이 아니라 재전직 때 정해지는 생애 시작 정신을 사용합니다.
      <Code>S = 내림(max(0, 생애 시작 SPI − 15) / 10)</Code>일 때,
      관련 숙련도 보정 전 시작 MP 최솟값은 <Code>120 + S</Code>,
      레벨업 MP 성장 최솟값은 <Code>2 + 내림(S × 0.4)</Code>입니다.
      이 하한이 오르면 상한도 함께 오르고, 지능의 수행 한계가 상한을 더 넓힙니다.
      예를 들어 생애 시작 정신이 65이면 S는 5로, 시작 MP 최솟값은 125, 레벨업 MP 성장 최솟값은 4입니다.
      정신 관련 숙련도는 레벨업 범위를 추가로 높이며, 최종 범위는 캐릭터 화면에서 확인할 수 있습니다.
    </P>
    <P>
      <Em>이전 성장 방식</Em> — 초기 무작위 성장 방식(버전 1)은 위의 기본 INT·SPI 보너스 없이
      시작 MP와 레벨업 누적 MP를 사용하며, 숙련도 보정 전 레벨업 하한은 <Code>3 + S</Code>입니다.
      무작위 성장 기록이 없는 구형 캐릭터만{" "}
      <Code>{V2_BASE_MP} + (레벨 − 1) × {V2_MP_PER_LEVEL} + INT × {MP_PER_INT}</Code>를 사용합니다.
      이 구형 공식에서만 지능이 MP의 직접 능력치 계수이고 정신은 포함되지 않습니다.
    </P>
  </>;
}
