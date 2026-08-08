// 게임 안내서 섹션 메타데이터. 슬러그 ↔ 제목/요약/그룹.
// 본문은 별도 컴포넌트 파일(content/<slug>.tsx)로 분리해 정적 사이즈 부담을 줄인다.

export type ManualGroup = "intro" | "combat" | "growth" | "world" | "versus";

export type ManualSection = {
  slug: string;
  title: string;
  summary: string;
  group: ManualGroup;
};

export const MANUAL_GROUP_LABEL: Record<ManualGroup, string> = {
  intro: "시작하기",
  combat: "전투",
  growth: "성장",
  world: "세계",
  versus: "겨루기",
};

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    slug: "overview",
    title: "게임 개요",
    summary: "모험을 시작하기 전에 전체 흐름과 장기 목표를 살펴봅니다.",
    group: "intro",
  },
  {
    slug: "controls",
    title: "화면과 조작",
    summary: "메인 탭과 알림·이벤트·꾸미기·환경 설정의 사용법을 안내합니다.",
    group: "intro",
  },
  {
    slug: "combat",
    title: "전투 시스템",
    summary: "행동 순서부터 피해·방어·치명타·회피·상태이상까지 설명합니다.",
    group: "combat",
  },
  {
    slug: "hunting",
    title: "사냥과 사냥터",
    summary: "사냥터 선택, 스태미나 소모, 전리품과 희귀 탐사 규칙을 정리합니다.",
    group: "combat",
  },
  {
    slug: "coop",
    title: "협동 보스",
    summary: "공유 HP를 깎는 토벌 방식과 기여도별 보상을 안내합니다.",
    group: "combat",
  },
  {
    slug: "stats",
    title: "스탯과 성장",
    summary: "6대 스탯의 역할과 레벨업 성장, 스탯 한계를 설명합니다.",
    group: "growth",
  },
  {
    slug: "jobs",
    title: "직업·숙련도·전직",
    summary: "직업 계보와 전직 조건, 숙련도·숙달 포인트 사용처를 정리합니다.",
    group: "growth",
  },
  {
    slug: "skills",
    title: "스킬",
    summary: "스킬을 배우고 SP 한도 안에서 장착하는 방법을 안내합니다.",
    group: "growth",
  },
  {
    slug: "quests",
    title: "퀘스트와 업적",
    summary: "튜토리얼·일일·주간 퀘스트와 업적 보상 수령 방법을 설명합니다.",
    group: "growth",
  },
  {
    slug: "leveling",
    title: "레벨과 경험치",
    summary: "레벨업에 필요한 EXP와 신참 보너스, 전직 후 변화를 설명합니다.",
    group: "growth",
  },
  {
    slug: "equipment",
    title: "장비",
    summary: "장비 6개 부위와 위력·옵션·세트 효과를 읽는 방법을 안내합니다.",
    group: "growth",
  },
  {
    slug: "enhance",
    title: "장비 강화",
    summary: "강화 결과와 단계별 재료, 장비 파괴 위험, 폭풍 개량을 정리합니다.",
    group: "growth",
  },
  {
    slug: "economy",
    title: "골드·스태미나·회복",
    summary: "골드와 스태미나, HP·MP 충전약의 사용 방식을 설명합니다.",
    group: "world",
  },
  {
    slug: "town",
    title: "마을 시설",
    summary: "치료소·대장간·은행·생활 작업장·농장·주방 등 마을 시설을 소개합니다.",
    group: "world",
  },
  {
    slug: "guild",
    title: "길드",
    summary: "길드 가입부터 연구·시설·주간 활동·제작까지 한곳에 정리합니다.",
    group: "world",
  },
  {
    slug: "plaza",
    title: "광장과 소통",
    summary: "게시판·거래소·우편함·채팅방의 이용 방법을 안내합니다.",
    group: "world",
  },
  {
    slug: "compendium",
    title: "모험의 서",
    summary: "수집 기록과 칭호, 직업 계보를 확인하는 방법을 설명합니다.",
    group: "world",
  },
  {
    slug: "arena",
    title: "투기장과 대련",
    summary: "투기장 대전·일요일 챔피언십과 대련장을 안내합니다.",
    group: "versus",
  },
  {
    slug: "pastimes",
    title: "생활 콘텐츠",
    summary: "농장·주방·자동 벌목·자동 채광·낚시의 진행 방식과 보상을 안내합니다.",
    group: "world",
  },
];

export const MANUAL_SLUGS = MANUAL_SECTIONS.map((s) => s.slug);

export function getSection(slug: string): ManualSection | null {
  return MANUAL_SECTIONS.find((s) => s.slug === slug) ?? null;
}

export const DEFAULT_MANUAL_SLUG = MANUAL_SECTIONS[0]?.slug ?? "overview";
