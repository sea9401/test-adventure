// 메뉴얼 섹션 메타데이터. 슬러그 ↔ 제목/요약/그룹.
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
    summary: "이 게임이 어떤 게임인지, 큰 흐름과 목표.",
    group: "intro",
  },
  {
    slug: "controls",
    title: "화면과 조작",
    summary: "5개 메인 탭, 상단바·설정 메뉴, 화면 전환 방식.",
    group: "intro",
  },
  {
    slug: "combat",
    title: "전투 시스템",
    summary: "속도 타임라인, 데미지·방어, 속성, 치명·회피, 상태이상.",
    group: "combat",
  },
  {
    slug: "hunting",
    title: "사냥과 사냥터",
    summary: "프론티어 깊이 밴드, 단발·일괄 사냥, 스태미나, 전리품, 레어맵.",
    group: "combat",
  },
  {
    slug: "coop",
    title: "협동 보스",
    summary: "소환서 수집, 소환, 공유 HP 토벌, SP 열매·보스 유니크 보상.",
    group: "combat",
  },
  {
    slug: "stats",
    title: "스탯과 성장",
    summary: "6대 스탯의 전투 환산, 자동 성장과 한계치.",
    group: "growth",
  },
  {
    slug: "jobs",
    title: "직업·숙련도·전직",
    summary: "4직군에서 전직으로 뻗는 직업 트리, 숙달 포인트, 계보 전직, 수행.",
    group: "growth",
  },
  {
    slug: "skills",
    title: "스킬",
    summary: "액티브 스킬 습득·장착 슬롯, 직업 전용 스킬.",
    group: "growth",
  },
  {
    slug: "leveling",
    title: "레벨과 경험치",
    summary: "EXP 곡선, 경험치 배율, 신참 보너스, 전직 리셋.",
    group: "growth",
  },
  {
    slug: "equipment",
    title: "장비",
    summary: "6슬롯 개체 장비, 위력→스탯 환산, 옵션 편차, 세트.",
    group: "growth",
  },
  {
    slug: "enhance",
    title: "장비 강화",
    summary: "+0~+10 강화, 4갈래 결과, 강화석(붉은/푸른).",
    group: "growth",
  },
  {
    slug: "economy",
    title: "골드·스태미나·회복",
    summary: "골드의 쓰임, 스태미나 소모·회복, HP·MP 회복.",
    group: "world",
  },
  {
    slug: "town",
    title: "마을 시설",
    summary: "치료소·상점·대장간·낚시터·발굴 감정소.",
    group: "world",
  },
  {
    slug: "guild",
    title: "길드",
    summary: "창단·가입 신청·초대, 길드 운영과 금고.",
    group: "world",
  },
  {
    slug: "outpost",
    title: "지도 · 거점 · 정착지",
    summary: "자유 타일 이동, 길드 영토 정착(마을·도시·대도시), 점령·세금·수비·영주·토벌.",
    group: "world",
  },
  {
    slug: "plaza",
    title: "광장과 소통",
    summary: "게시판·전체 소식·우편함·랭킹·공지·채팅.",
    group: "world",
  },
  {
    slug: "compendium",
    title: "모험의 서",
    summary: "재료·어보·유물 도감과 전직 게이트.",
    group: "world",
  },
  {
    slug: "arena",
    title: "투기장과 대련",
    summary: "1대1 투기장, 훈련장 허수아비 대련(빌드 시험).",
    group: "versus",
  },
  {
    slug: "pastimes",
    title: "낚시와 발굴",
    summary: "낚시 미니게임·주간 대회, 보물 발굴과 거래.",
    group: "versus",
  },
];

export const MANUAL_SLUGS = MANUAL_SECTIONS.map((s) => s.slug);

export function getSection(slug: string): ManualSection | null {
  return MANUAL_SECTIONS.find((s) => s.slug === slug) ?? null;
}

export const DEFAULT_MANUAL_SLUG = MANUAL_SECTIONS[0]?.slug ?? "overview";
