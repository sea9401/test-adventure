// 표면(surface) 디자인 토큰 — 패널·카드·인셋 배경의 단일 출처(SSOT).
//
// 🔑 규칙(이거 매번 어기지 말 것):
//   - 페이지 배경(zinc-50 / zinc-950) 위에 "뜨는" 모든 면은 이 토큰 중 하나를 쓴다.
//   - **불투명이 기본.** 반투명 배경(`bg-*/40` 같은 알파)은 뒤 페이지가 비쳐 지저분해지므로
//     쓰지 않는다. 손으로 `bg-amber-50/40` 식 패널을 만들지 말 것 → SURFACE_* 를 import.
//   - 유일한 반투명 예외 = backdrop-blur 가 깔린 프로스티드 헤더(SURFACE_FROSTED).
//
// 단계(elevation): CARD/ACCENT 는 페이지 배경 위로 "떠오른" 패널, INSET 은 그 카드 "안으로
//   파인" 영역(카드보다 어둡게/연하게 = 안으로 들어가 보임). 새 컴포넌트는 색을 새로 고르지 말고
//   토큰을 재사용 — 같은 토큰이면 같은 높이로 읽힌다.

/** 기본 카드 — 페이지 배경 위에 뜨는 1단 패널(흰 / zinc-900, 테두리+그림자). 대부분의 패널. */
export const SURFACE_CARD =
  "rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900";

/** 인셋 — 카드 "안에서" 한 단계 파인 영역(슬롯 칸·서브 박스·리스트 행). 카드보다 어둡게 = recessed. */
export const SURFACE_INSET =
  "rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900";

/** 강조 패널 — 테마색(amber) 카드. 정착지처럼 정체성을 주는 패널. 불투명. */
export const SURFACE_ACCENT =
  "rounded-lg border border-amber-300 bg-amber-50 shadow-sm dark:border-amber-900/70 dark:bg-amber-950";

/** 프로스티드 헤더 — 반투명 + backdrop-blur(유일한 반투명 예외, 의도적). 지역 배경 위 헤더. */
export const SURFACE_FROSTED =
  "rounded-xl bg-white/75 shadow-sm backdrop-blur-sm dark:bg-zinc-900/80";
