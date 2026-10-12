// 전공 규칙 상수 — 화면(LifeMajorCard)도 쓰므로 다른 생활 모듈에 의존하지 않는다.
//   lifeMajor.ts 는 요리 상태를 거쳐 서버 전용 요리 카탈로그를 불러와 화면에서 값으로 import 할 수 없다.

export const LIFE_MAJOR_CHANGE_COOLDOWN_MS = 30 * 86_400_000;
