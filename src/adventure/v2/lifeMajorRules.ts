// 전공 규칙 상수 — 화면(LifeMajorCard)도 쓰므로 다른 생활 모듈에 의존하지 않는다.
//   lifeMajor.ts 는 요리 상태를 거쳐 서버 전용 요리 카탈로그를 불러와 화면에서 값으로 import 할 수 없다.

export const LIFE_MAJOR_CHANGE_COOLDOWN_MS = 86_400_000;

/** 전공을 고르는 생활 기록 화면까지의 경로. 캐릭터 메뉴에 따로 항목이 없어 안내 문구에 함께 적는다. */
export const LIFE_RECORD_PATH = "캐릭터 > 내 정보 > 생활 기록";

/** 명장 제작(명장 요리·단련 촉매·명장 등급 전투 준비물)에 필요한 주전공 명장 단계. */
export const LIFE_MAJOR_CRAFT_MIN_STAGE = 3;

/** 생활별 거장 칭호를 받는 등급. */
export const LIFE_MAJOR_GRAND_TITLE_GRADE = 10;
/** 칭호 ‘생활의 거장’을 받는 거장 등급 합계. */
export const LIFE_MAJOR_GRAND_TOTAL_TITLE_GRADE = 50;

// ── 생활 명성과 편의 해금 ─────────────────────────────────────────────
// 명성 = 다섯 생활의 명장 단계 합계 + 거장 등급 합계. 명성이 오르면 반복 조작을 줄이는 편의가 열린다.
// 생산량과 전투 수치는 바꾸지 않는다.

export type LifePerkId = "auto_restart" | "farm_replant" | "bulk_processing" | "collect_all";

/** 대량 처리 편의가 열렸을 때의 한 번 처리 한도(기본은 가공 100회, 요리 20개). */
export const LIFE_PERK_PROCESS_BATCH_LIMIT = 300;
export const LIFE_PERK_COOKING_CRAFT_LIMIT = 50;

export type LifePerk = { id: LifePerkId; renown: number; name: string; description: string };

/** 명성 순서. */
export const LIFE_PERKS: readonly LifePerk[] = [
  {
    id: "auto_restart",
    renown: 5,
    name: "정산하고 다시 시작",
    description: "자동 벌목·채광을 정산하면서 같은 채집지에서 같은 작업을 바로 다시 시작합니다.",
  },
  {
    id: "farm_replant",
    renown: 10,
    name: "수확하고 다시 심기",
    description: "다 자란 밭을 모두 수확하고 같은 작물을 바로 다시 심습니다.",
  },
  {
    id: "bulk_processing",
    renown: 20,
    name: "대량 처리",
    description: `재료 가공을 한 번에 ${LIFE_PERK_PROCESS_BATCH_LIMIT}회, 요리를 한 번에 ${LIFE_PERK_COOKING_CRAFT_LIMIT}개까지 합니다.`,
  },
  {
    id: "collect_all",
    renown: 30,
    name: "생활 한 번에 정산",
    description: "버튼 하나로 자동 채집 정산과 재시작, 밭 수확과 다시 심기, 목장 수거와 사료 채우기를 합니다.",
  },
];

export function lifePerkUnlocked(renown: number, id: LifePerkId): boolean {
  const perk = LIFE_PERKS.find((entry) => entry.id === id);
  return perk !== undefined && Number.isFinite(renown) && renown >= perk.renown;
}
