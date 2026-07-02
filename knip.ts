import type { KnipConfig } from "knip";

// knip — 미사용 파일/export/의존성 리포트. **report-only**: CI 게이트에 물리지 않고
// `npm run knip` 으로 수동 실행한다(스크립트에 --no-exit-code).
//
// 읽는 법:
//  - "Unused files" 가 가장 신뢰도 높은 신호(과거 v2/equipmentCodex.ts 같은 죽은 사본 탐지).
//  - "Unused exports" 는 정보성 — 상당수가 의도된 튜닝 다이얼 상수(문서 겸 export)이거나
//    파킹된 v1 척추(tutorial/coop/tower/crafting — 통삭제 금지 정책)다. 삭제 전 반드시
//    "죽어 보이지만 보존" 목록(specChoice 브리지·arenaBots 등)과 대조할 것.
const config: KnipConfig = {
  // Next(app router)·vitest 엔트리는 플러그인이 자동 인식 — 여기는 독립 실행물만 추가.
  // scripts/sim-*.ts 는 `node --import tsx` 로 수동 실행하는 밸런스 sim(엔트리 없으면 오탐).
  entry: ["scripts/*.{ts,mjs}", "src/db/*.mjs"],
  ignore: [
    // 서비스 워커 — 런타임 register 로 로드되어 정적 참조가 없다.
    "public/sw.js",
  ],
  ignoreDependencies: [
    // drizzle.config.ts 가 사용하는 @next/env 는 next 에 동봉(별도 설치 불필요).
    "@next/env",
    // scripts/inspect-user.mjs(운영 점검 스크립트)가 쓰는 ws — 전이 의존으로 충분.
    "ws",
  ],
};

export default config;
