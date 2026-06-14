// v2 거점 (Outpost) 정적 데이터.
//
// 좌표 공간: 0~10000 × 0~6000 (큰 대륙 느낌).
// 새 biome 이미지(v2-continent.png — 텍스트/마커 0)의 5 biome 중심에 5 왕국 배치,
// 그 주변에 도시·거점·마을 분산. 깨끗한 배경 위에 SVG 마커가 단일 source-of-truth.
//
// Biome 영역 (대략):
//   - 빙하 (좌상): center (1800, 1000)
//   - 숲 (우상): center (6500, 800)
//   - 보라산 (좌중하): center (1500, 3500)
//   - 붉은산 (우중하): center (8000, 3300)
//   - 사막 (중하): center (5000, 4900)
//   - 평원 (중상~중) = 분쟁지대
//
// 분량 (40): 5 왕국 + 10 도시 + 13 거점 + 8 마을 + 4 절대 중립. (2026-06-14 96→40 축소)

import type { Outpost } from "./types";

// 미점령(NPC 운영) 거점의 기본 세율. 사냥 골드의 이만큼이 거점 금고에 누적되며
// (outpost_treasury 테이블), 점령/함락 시 자동 회수 + 수동 세금 회수의 재원이 된다.
export const OUTPOST_NPC_TAX_RATE = 0.15;

// 거점 금고 분배 — 회수자/점령자 본인 몫 %. 나머지는 길드 공용 금고로.
// 수동 회수(treasury/claim)와 점령 자동 회수(outpost/claim 함락·점령)가 공유하는 단일 출처.
export const TREASURY_CLAIMER_SHARE_PCT = 10;

export function treasuryShares(total: number): {
  claimerShare: number;
  guildShare: number;
} {
  const t = Math.max(0, Math.floor(total));
  const claimerShare = Math.floor((t * TREASURY_CLAIMER_SHARE_PCT) / 100);
  return { claimerShare, guildShare: t - claimerShare };
}

// 절대 중립 거점 — NPC 영구 운영.
const NEUTRAL_OUTPOSTS: Outpost[] = [
  {
    id: "neutral_haven_central",
    name: "리베라",
    type: "village",
    tier: 3,
    position: { x: 5000, y: 3000 },
    neutral: true,
    description: "어느 세력에도 속하지 않는 자유 도시. 모든 모험가에게 열려 있다.",
  },
  {
    id: "neutral_north_outpost",
    name: "보레아",
    type: "village",
    tier: 2,
    position: { x: 4800, y: 500 },
    neutral: true,
    description: "대륙 북단의 자유 항구. 항상 열려 있다.",
  },
  {
    id: "neutral_south_outpost",
    name: "노토스",
    type: "village",
    tier: 2,
    position: { x: 5000, y: 5280 },
    neutral: true,
    description: "대륙 남단의 자유 항구.",
  },
  {
    id: "neutral_east_outpost",
    name: "에우로스",
    type: "village",
    tier: 2,
    position: { x: 9000, y: 3000 },
    neutral: true,
    description: "대륙 동단의 자유 항구.",
  },
];

// 5 왕국 — 각 biome 중심.
const KINGDOMS: Outpost[] = [
  {
    id: "kingdom_tatiholm",
    name: "에이라 왕국",
    type: "fort",
    tier: 4,
    position: { x: 1800, y: 1000 },
    description: "북부 빙하 위에 세워진 시야와 영창의 왕국.",
  },
  {
    id: "kingdom_silverbance",
    name: "로렌 왕국",
    type: "tower",
    tier: 4,
    position: { x: 6500, y: 800 },
    description: "동부 숲 깊은 곳, 마법과 학문의 왕국.",
  },
  {
    id: "kingdom_blackforge",
    name: "코린 왕국",
    type: "mine",
    tier: 4,
    position: { x: 1500, y: 3500 },
    description: "서남부 산악의 광부 왕국. 깊은 광맥을 지배한다.",
  },
  {
    id: "kingdom_sunderhold",
    name: "세라 왕국",
    type: "village",
    tier: 4,
    position: { x: 5000, y: 4900 },
    description: "중남부 사막의 농경 왕국. 가장 평화로운 시작점.",
  },
  {
    id: "kingdom_ragnarod",
    name: "발렌 왕국",
    type: "fort",
    tier: 4,
    position: { x: 8000, y: 3300 },
    description: "동남부 산악의 전쟁 왕국. 공성에 능하다.",
  },
];

// 도시 (tier 3) — 왕국 근처 2개씩.
const CITIES: Outpost[] = [
  // 에이라 영역 (빙하)
  { id: "city_glacier_market", name: "이스마르크", type: "village", tier: 3, position: { x: 2800, y: 1300 }, description: "에이라 인근 교역 도시." },
  { id: "city_aurora_keep", name: "스카디아", type: "fort", tier: 3, position: { x: 1679, y: 1525 } },
  // 로렌 영역 (숲)
  { id: "city_silverleaf", name: "실바리엔", type: "tower", tier: 3, position: { x: 7800, y: 1100 } },
  { id: "city_oakheart", name: "엘다로스", type: "village", tier: 3, position: { x: 9000, y: 2300 } },
  // 코린 영역 (보라산)
  { id: "city_iron_pit", name: "카즈베르그", type: "mine", tier: 3, position: { x: 2400, y: 4200 } },
  { id: "city_swamp_market", name: "그룬다르", type: "village", tier: 3, position: { x: 1100, y: 4200 } },
  // 세라 영역 (사막)
  { id: "city_goldfield", name: "알 다하브", type: "village", tier: 3, position: { x: 4000, y: 4700 } },
  { id: "city_river_haven", name: "알 나하르", type: "village", tier: 3, position: { x: 5900, y: 4700 } },
  // 발렌 영역 (붉은산)
  { id: "city_ironpeak", name: "바르크라그", type: "fort", tier: 3, position: { x: 7000, y: 4100 } },
  { id: "city_thunder_camp", name: "그롬바르", type: "fort", tier: 3, position: { x: 9000, y: 4200 } },
];

// 거점 (tier 2) — 중앙 분쟁지대 전장 8 + 권역 길목 5. (맵 축소 96→40, 2026-06-14)
const OUTPOSTS_T2: Outpost[] = [
  // 중앙 분쟁지대 (평원) — 쟁탈 전장. ⚠️ 8개는 warOutposts.ts 쟁탈 풀이라 제거 금지.
  { id: "war_central_fort", name: "카스트라", type: "fort", tier: 2, position: { x: 4500, y: 2800 }, description: "중앙 분쟁지대의 핵심 요새. 시야와 방어 보너스." },
  { id: "war_central_tower", name: "아르카눔", type: "tower", tier: 2, position: { x: 5500, y: 2800 }, description: "분쟁지대 중앙의 마탑. 영창과 시야의 요충지." },
  { id: "war_central_mine", name: "베나리움", type: "mine", tier: 2, position: { x: 4800, y: 2300 }, description: "분쟁지대 중앙의 광산. 깊은 갱도가 뻗어 있다." },
  { id: "war_south_mine", name: "카베르나", type: "mine", tier: 2, position: { x: 5200, y: 3400 } },
  { id: "outpost_plain_fort", name: "발마르", type: "fort", tier: 2, position: { x: 3700, y: 2700 } },
  { id: "outpost_plain_tower", name: "알토렌", type: "tower", tier: 2, position: { x: 6200, y: 2400 } },
  { id: "outpost_central_post", name: "비길리아", type: "fort", tier: 2, position: { x: 5500, y: 3300 } },
  { id: "outpost_plain_square", name: "콩코르디아", type: "fort", tier: 2, position: { x: 4953, y: 2543 } },
  // 권역 길목 (권역당 1) — 외곽 요충지
  { id: "outpost_frostgate", name: "프로스트헤임", type: "fort", tier: 2, position: { x: 3800, y: 1300 } }, // 에이라(빙하)
  { id: "outpost_misttower", name: "미스랄렌", type: "tower", tier: 2, position: { x: 7200, y: 2000 } }, // 로렌(숲)
  { id: "outpost_west_fort", name: "두르가드", type: "fort", tier: 2, position: { x: 1500, y: 2700 } }, // 코린(보라산)
  { id: "outpost_south_mine", name: "하디라", type: "mine", tier: 2, position: { x: 3500, y: 4500 } }, // 세라(사막)
  { id: "outpost_east_fort", name: "그림홀드", type: "fort", tier: 2, position: { x: 8000, y: 4000 } }, // 발렌(붉은산)
];

// 마을 (tier 1) — 권역↔중앙 연결 마을만. (맵 축소 96→40, 필러 마을 43 제거)
const VILLAGES: Outpost[] = [
  { id: "village_silverpoint", name: "실프헤임", type: "village", tier: 1, position: { x: 2400, y: 1600 } }, // 에이라(빙하)
  { id: "village_dewfall", name: "로스니엘", type: "village", tier: 1, position: { x: 6000, y: 1500 } }, // 로렌(숲)
  { id: "village_oremouth", name: "카르문", type: "village", tier: 1, position: { x: 1900, y: 3000 } }, // 코린(보라산)
  { id: "village_wheatfield", name: "카므란", type: "village", tier: 1, position: { x: 4819, y: 4009 } }, // 세라(사막)
  { id: "village_iron_camp", name: "야른가스", type: "village", tier: 1, position: { x: 7300, y: 3300 } }, // 발렌(붉은산)
  { id: "village_crossroads_n", name: "비아노르", type: "village", tier: 1, position: { x: 4500, y: 2100 } }, // 분쟁 변두리 N
  { id: "village_crossroads_s", name: "비아수르", type: "village", tier: 1, position: { x: 5500, y: 3700 } }, // 분쟁 변두리 S
  { id: "village_grassland", name: "프라타", type: "village", tier: 1, position: { x: 3800, y: 2500 } }, // 중앙
];

export const OUTPOSTS: Outpost[] = [
  ...NEUTRAL_OUTPOSTS,
  ...KINGDOMS,
  ...CITIES,
  ...OUTPOSTS_T2,
  ...VILLAGES,
];

// id → Outpost / id → type 역참조 맵. 라우트(`/outpost/[id]`)·배경 이미지 선택 등
// 여러 곳에서 같은 맵을 쓰도록 단일 소스로 export (예전엔 V2GameFlow 안에 인라인 정의).
export const OUTPOST_BY_ID = new Map(OUTPOSTS.map((o) => [o.id, o] as const));
export const OUTPOST_TYPE_BY_ID = new Map<string, Outpost["type"]>(
  OUTPOSTS.map((o) => [o.id, o.type]),
);

export const MAP_BOUNDS = { width: 10000, height: 6000 } as const;
export const CONTINENT_NAME = "아스토리아 대륙";

// === 왕국 고유색 (지도 구분용) =======================================
// 거점 종류는 아이콘으로 구분하므로, 마커 채움색은 "소속 왕국"을 나타낸다(5 왕국 distinct hue).
// 소유 표시 링 색(내 길드=초록·적=빨강·중립=금·NPC=흰)과 겹치지 않는 색으로 고른다.
export const KINGDOM_COLORS: Record<string, string> = {
  kingdom_tatiholm: "#3b82f6", // 에이라 — 북부 빙하(청)
  kingdom_silverbance: "#8b5cf6", // 로렌 — 동부 마법(보라)
  kingdom_blackforge: "#ec4899", // 코린 — 서남 광산(자홍)
  kingdom_sunderhold: "#06b6d4", // 세라 — 중남 사막(청록)
  kingdom_ragnarod: "#f97316", // 발렌 — 동남 전쟁(주황)
};

// 거점 → 소속 왕국색. 소속 = 지리적으로 가장 가까운 왕국 수도(거점 방어 게이트와 동일 기준).
// 모든 거점(중립·분쟁지대 포함)이 어느 한 왕국 영역에 든다. 수도 자신은 자기 색.
// 모듈 로드 시 1회 precompute (렌더마다 최근접 재계산 회피).
// 거점 → 소속 왕국 수도 id. 색·이름 모두 이걸로 파생.
const KINGDOM_ID_BY_OUTPOST: Map<string, string> = (() => {
  const capitals = OUTPOSTS.filter((o) => o.tier === 4);
  const map = new Map<string, string>();
  for (const o of OUTPOSTS) {
    let bestId = capitals[0]?.id;
    let bestD = Infinity;
    for (const c of capitals) {
      const d = Math.hypot(
        o.position.x - c.position.x,
        o.position.y - c.position.y,
      );
      if (d < bestD) {
        bestD = d;
        bestId = c.id;
      }
    }
    if (bestId) map.set(o.id, bestId);
  }
  return map;
})();

// 거점이 속한 왕국 수도 id (지리적 최근).
export function kingdomIdOf(o: Outpost): string | undefined {
  return KINGDOM_ID_BY_OUTPOST.get(o.id);
}

// 지도 마커 채움색 — 거점이 속한 왕국의 고유색. 미등록 시 회색 폴백.
export function kingdomColorOf(o: Outpost): string {
  const id = KINGDOM_ID_BY_OUTPOST.get(o.id);
  return (id && KINGDOM_COLORS[id]) || "#5d5d68";
}

// 거점이 속한 왕국 이름(예: "에이라 왕국"). NPC 운영 거점 표기(소속 왕국)에 사용.
export function kingdomNameOf(o: Outpost): string | undefined {
  const id = KINGDOM_ID_BY_OUTPOST.get(o.id);
  return id ? OUTPOST_BY_ID.get(id)?.name : undefined;
}

// 분쟁지대(중앙 자유 도시 인근) 마커 채움색 — 어느 왕국색과도 구분되는 무소속 슬레이트.
// 어느 거점이 분쟁지대인지(중앙에서 N홉)는 그래프 의존이라 outpostGraph.CONFLICT_ZONE_IDS 참고.
export const OUTPOST_CONFLICT_COLOR = "#64748b";

// 신규 플레이어 시작 거점 — 중앙 자유 도시(어느 세력에도 속하지 않는 중립 허브). 현재
// 위치가 아직 기록되지 않았을 때(부트스트랩) 인접 이동 게이트·발견 시드의 기준점으로 쓴다.
export const START_OUTPOST_ID = "neutral_haven_central";
