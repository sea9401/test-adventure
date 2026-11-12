// 전공 규칙 상수 — 화면(LifeMajorCard)도 쓰므로 다른 생활 모듈에 의존하지 않는다.
//   lifeMajor.ts 는 요리 상태를 거쳐 서버 전용 요리 카탈로그를 불러와 화면에서 값으로 import 할 수 없다.

export const LIFE_MAJOR_CHANGE_COOLDOWN_MS = 30 * 86_400_000;

/** 전공을 고르는 생활 기록 화면까지의 경로. 캐릭터 메뉴에 따로 항목이 없어 안내 문구에 함께 적는다. */
export const LIFE_RECORD_PATH = "캐릭터 > 내 정보 > 생활 기록";

/** 명장 제작(명장 요리·단련 촉매·명장 등급 전투 준비물)에 필요한 주전공 명장 단계. */
export const LIFE_MAJOR_CRAFT_MIN_STAGE = 3;
