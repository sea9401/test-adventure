// v2 스킬 교관 NPC — 마을 탭에서 6 스탯 교관 6명 진입.
// 라이브 NPCS 와 분리 (region/role 시스템 침투 회피).
// 각 교관은 자신의 스탯 카테고리 Tier 2/3 스킬 목록을 학습 화면에서 보여준다.

import type { StatKey } from "@/adventure/data/stats";

export type V2InstructorId =
  | "v2_instructor_str_garan"
  | "v2_instructor_dex_serin"
  | "v2_instructor_vit_boram"
  | "v2_instructor_spd_haneul"
  | "v2_instructor_luk_miru"
  | "v2_instructor_int_ian";

export type V2Instructor = {
  id: V2InstructorId;
  name: string;
  stat: StatKey;
  /** 한국식 단순 portrait short name. v2 전용. 이미지 X 시 fallback 처리. */
  portraitShortName: string;
  /** 학습 가능 스킬 1개 이상 노출 시 인사. */
  greeting: string;
  /** 학습 조건 부족 안내 메시지 (모달 상단). */
  insufficient: string;
};

export const V2_SKILL_INSTRUCTORS: readonly V2Instructor[] = [
  {
    id: "v2_instructor_str_garan",
    name: "힘의 교관 가란",
    stat: "str",
    portraitShortName: "garan",
    greeting:
      "검을 크게 휘두르는 법부터 배워라. 힘의 기술은 망설이지 않을 때 가장 깊게 박힌다.",
    insufficient:
      "아직 팔과 주머니가 둘 다 가볍군. 힘 스탯과 골드를 채우고 다시 와라.",
  },
  {
    id: "v2_instructor_dex_serin",
    name: "민첩 교관 세린",
    stat: "dex",
    portraitShortName: "serin",
    greeting:
      "빠른 손보다 중요한 건 정확한 손끝이야. 민첩 기술을 익히면 빈틈이 먼저 보일 거야.",
    insufficient:
      "지금은 동작이 반 박자 늦어. 민첩 스탯과 수업료를 갖추고 다시 찾아와.",
  },
  {
    id: "v2_instructor_vit_boram",
    name: "활력 교관 보람",
    stat: "vit",
    portraitShortName: "boram",
    greeting:
      "버티는 법을 아는 모험가만 다음 전투를 고를 수 있어요. 활력 기술로 몸의 중심을 세워 봅시다.",
    insufficient:
      "아직 몸이 기술을 받아낼 만큼 단단하지 않아요. 활력 스탯과 골드를 준비해 오세요.",
  },
  {
    id: "v2_instructor_spd_haneul",
    name: "속도 교관 하늘",
    stat: "spd",
    portraitShortName: "haneul",
    greeting:
      "먼저 움직이면 전투의 모양이 달라져. 속도 기술은 한 걸음 빠른 판단에서 시작해.",
    insufficient:
      "발은 급한데 준비가 따라오지 못하네. 속도 스탯과 골드를 채우고 다시 뛰어와.",
  },
  {
    id: "v2_instructor_luk_miru",
    name: "행운 교관 미루",
    stat: "luk",
    portraitShortName: "miru",
    greeting:
      "운은 기다리는 게 아니라 끌어당기는 거야. 행운 기술을 배우면 승부의 틈이 보일 거야.",
    insufficient:
      "아직 별이 네 쪽으로 기울지 않았어. 행운 스탯과 골드를 맞춰서 다시 와.",
  },
  {
    id: "v2_instructor_int_ian",
    name: "지능 교관 이안",
    stat: "int",
    portraitShortName: "ian",
    greeting:
      "마력은 많이 아는 자보다 정확히 이해한 자에게 따른다. 지능 기술의 구조를 차근차근 익혀 보자.",
    insufficient:
      "지금은 식을 끝까지 붙잡기 어렵겠군. 지능 스탯과 골드를 갖춘 뒤 다시 오게.",
  },
];

export function v2InstructorForStat(stat: StatKey): V2Instructor | undefined {
  return V2_SKILL_INSTRUCTORS.find((i) => i.stat === stat);
}
