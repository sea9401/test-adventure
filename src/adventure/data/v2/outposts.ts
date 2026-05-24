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
// 분량 (89): 5 왕국 + 10 도시 + 25 거점 + 45 마을 + 4 절대 중립.

import type { Outpost } from "./types";

// 절대 중립 거점 — NPC 영구 운영.
const NEUTRAL_OUTPOSTS: Outpost[] = [
  {
    id: "neutral_haven_central",
    name: "중앙 자유 도시",
    type: "village",
    tier: 3,
    position: { x: 5000, y: 3000 },
    neutral: true,
    description: "어느 세력에도 속하지 않는 자유 도시. 모든 모험가에게 열려 있다.",
  },
  {
    id: "neutral_north_outpost",
    name: "북단 자유 거점",
    type: "village",
    tier: 2,
    position: { x: 4800, y: 200 },
    neutral: true,
    description: "대륙 북단의 자유 항구. 항상 열려 있다.",
  },
  {
    id: "neutral_south_outpost",
    name: "남단 자유 거점",
    type: "village",
    tier: 2,
    position: { x: 5000, y: 5800 },
    neutral: true,
    description: "대륙 남단의 자유 항구.",
  },
  {
    id: "neutral_east_outpost",
    name: "동단 자유 거점",
    type: "village",
    tier: 2,
    position: { x: 9700, y: 3000 },
    neutral: true,
    description: "대륙 동단의 자유 항구.",
  },
];

// 5 왕국 — 각 biome 중심.
const KINGDOMS: Outpost[] = [
  {
    id: "kingdom_tatiholm",
    name: "타티홀름 왕국",
    type: "fort",
    tier: 4,
    position: { x: 1800, y: 1000 },
    description: "북부 빙하 위에 세워진 시야와 영창의 왕국.",
  },
  {
    id: "kingdom_silverbance",
    name: "실버벤스 왕국",
    type: "tower",
    tier: 4,
    position: { x: 6500, y: 800 },
    description: "동부 숲 깊은 곳, 마법과 학문의 왕국.",
  },
  {
    id: "kingdom_blackforge",
    name: "블랙포지 왕국",
    type: "mine",
    tier: 4,
    position: { x: 1500, y: 3500 },
    description: "서남부 산악의 광부 왕국. 깊은 광맥을 지배한다.",
  },
  {
    id: "kingdom_sunderhold",
    name: "선더홀드 왕국",
    type: "village",
    tier: 4,
    position: { x: 5000, y: 4900 },
    description: "중남부 사막의 농경 왕국. 가장 평화로운 시작점.",
  },
  {
    id: "kingdom_ragnarod",
    name: "라그나로드 왕국",
    type: "fort",
    tier: 4,
    position: { x: 8000, y: 3300 },
    description: "동남부 산악의 전쟁 왕국. 공성에 능하다.",
  },
];

// 도시 (tier 3) — 왕국 근처 2개씩.
const CITIES: Outpost[] = [
  // 타티홀름 영역 (빙하)
  { id: "city_glacier_market", name: "빙하 시장", type: "village", tier: 3, position: { x: 2800, y: 1300 }, description: "타티홀름 인근 교역 도시." },
  { id: "city_aurora_keep", name: "오로라 성채", type: "fort", tier: 3, position: { x: 700, y: 1500 } },
  // 실버벤스 영역 (숲)
  { id: "city_silverleaf", name: "은잎 도시", type: "tower", tier: 3, position: { x: 7800, y: 1100 } },
  { id: "city_oakheart", name: "참나무 심부", type: "village", tier: 3, position: { x: 5200, y: 1200 } },
  // 블랙포지 영역 (보라산)
  { id: "city_iron_pit", name: "철광 분지", type: "mine", tier: 3, position: { x: 2400, y: 4200 } },
  { id: "city_swamp_market", name: "늪 시장", type: "village", tier: 3, position: { x: 700, y: 4200 } },
  // 선더홀드 영역 (사막)
  { id: "city_goldfield", name: "황금 들", type: "village", tier: 3, position: { x: 4000, y: 4700 } },
  { id: "city_river_haven", name: "강의 안식처", type: "village", tier: 3, position: { x: 5900, y: 4700 } },
  // 라그나로드 영역 (붉은산)
  { id: "city_ironpeak", name: "철봉", type: "fort", tier: 3, position: { x: 7000, y: 4100 } },
  { id: "city_thunder_camp", name: "천둥 야영지", type: "fort", tier: 3, position: { x: 9000, y: 4200 } },
];

// 거점 (tier 2) — 분쟁지대 4 + 길목/biome 경계 16.
const OUTPOSTS_T2: Outpost[] = [
  // 중앙 분쟁지대 (평원)
  { id: "war_central_fort", name: "중앙 요새", type: "fort", tier: 2, position: { x: 4500, y: 2800 }, description: "중앙 분쟁지대의 핵심 요새. 시야와 방어 보너스." },
  { id: "war_central_tower", name: "중앙 마탑", type: "tower", tier: 2, position: { x: 5500, y: 2800 }, description: "분쟁지대의 마탑. 점령 시 빠른 이동/사냥 효율." },
  { id: "war_central_mine", name: "중앙 광산", type: "mine", tier: 2, position: { x: 4800, y: 2300 }, description: "분쟁지대의 광산. 영지 자원 산출." },
  { id: "war_south_mine", name: "중앙 남광산", type: "mine", tier: 2, position: { x: 5200, y: 3400 } },
  // 평원 추가 거점 — 빈 공간 채움
  { id: "outpost_plain_fort", name: "평원 요새", type: "fort", tier: 2, position: { x: 3700, y: 2700 } },
  { id: "outpost_plain_tower", name: "평원 마탑", type: "tower", tier: 2, position: { x: 6200, y: 2400 } },
  { id: "outpost_central_post", name: "중앙 초소", type: "fort", tier: 2, position: { x: 5500, y: 3300 } },
  { id: "outpost_eastern_mine", name: "동남 광산", type: "mine", tier: 2, position: { x: 7400, y: 4500 } },
  { id: "outpost_southwest_mine", name: "남서 광산", type: "mine", tier: 2, position: { x: 3000, y: 5000 } },
  // 빙하-숲 경계
  { id: "outpost_frostgate", name: "서리 관문", type: "fort", tier: 2, position: { x: 3800, y: 1300 } },
  { id: "outpost_misttower", name: "안개 첨탑", type: "tower", tier: 2, position: { x: 7200, y: 2000 } },
  { id: "outpost_north_mine", name: "북부 광산", type: "mine", tier: 2, position: { x: 4500, y: 1700 } },
  // 보라산 (블랙포지) 영역
  { id: "outpost_west_fort", name: "서부 요새", type: "fort", tier: 2, position: { x: 1500, y: 2700 } },
  { id: "outpost_west_mine", name: "서부 갱도", type: "mine", tier: 2, position: { x: 2700, y: 3200 } },
  { id: "outpost_blackvein", name: "검은 광맥 거점", type: "mine", tier: 2, position: { x: 500, y: 3400 } },
  // 붉은산 (라그나로드) 영역
  { id: "outpost_east_tower", name: "동부 마탑", type: "tower", tier: 2, position: { x: 8400, y: 2500 } },
  { id: "outpost_east_fort", name: "동부 요새", type: "fort", tier: 2, position: { x: 8000, y: 4000 } },
  { id: "outpost_red_smith", name: "붉은 대장간", type: "fort", tier: 2, position: { x: 9300, y: 4700 } },
  // 사막 영역
  { id: "outpost_south_mine", name: "남부 광산", type: "mine", tier: 2, position: { x: 3500, y: 4500 } },
  { id: "outpost_south_fort", name: "남부 요새", type: "fort", tier: 2, position: { x: 6800, y: 4500 } },
  { id: "outpost_south_tower", name: "남부 마탑", type: "tower", tier: 2, position: { x: 4400, y: 4400 } },
  { id: "outpost_south_tower_2", name: "남부 외곽 마탑", type: "tower", tier: 2, position: { x: 5600, y: 4400 } },
  { id: "outpost_desert_caravan", name: "사막 대상 거점", type: "village", tier: 2, position: { x: 6200, y: 5600 } },
  // 빙하 (타티홀름) 추가
  { id: "outpost_glacier_watch", name: "빙하 망루", type: "tower", tier: 2, position: { x: 3200, y: 600 } },
  // 숲 (실버벤스) 추가
  { id: "outpost_forest_watch", name: "숲의 망루", type: "tower", tier: 2, position: { x: 8800, y: 1900 } },
];

// 마을 (tier 1) — biome 안 산재.
const VILLAGES: Outpost[] = [
  // 타티홀름 영역 (빙하)
  { id: "village_snowbrook", name: "눈시내 마을", type: "village", tier: 1, position: { x: 1200, y: 1700 } },
  { id: "village_frostpine", name: "서릿솔 마을", type: "village", tier: 1, position: { x: 2500, y: 500 } },
  { id: "village_silverpoint", name: "은점 마을", type: "village", tier: 1, position: { x: 2400, y: 1600 } },
  { id: "village_glacier_pass", name: "빙하 고개 마을", type: "village", tier: 1, position: { x: 1300, y: 300 } },
  { id: "village_iceshelf", name: "얼음 선반 마을", type: "village", tier: 1, position: { x: 3000, y: 1900 } },
  { id: "village_northern_fjord", name: "북부 협만 마을", type: "village", tier: 1, position: { x: 2200, y: 200 } },
  // 실버벤스 영역 (숲)
  { id: "village_birchgrove", name: "자작나무 숲 마을", type: "village", tier: 1, position: { x: 8500, y: 400 } },
  { id: "village_mosslake", name: "이끼 호수 마을", type: "village", tier: 1, position: { x: 9100, y: 1500 } },
  { id: "village_dewfall", name: "이슬골 마을", type: "village", tier: 1, position: { x: 6000, y: 1500 } },
  { id: "village_starlit", name: "별빛 마을", type: "village", tier: 1, position: { x: 8200, y: 2300 } },
  { id: "village_deepwood", name: "깊은 숲 마을", type: "village", tier: 1, position: { x: 7000, y: 200 } },
  { id: "village_forest_clearing", name: "숲 공터 마을", type: "village", tier: 1, position: { x: 9500, y: 700 } },
  { id: "village_oakshade", name: "참나무 그늘 마을", type: "village", tier: 1, position: { x: 5500, y: 600 } },
  // 블랙포지 영역 (보라산)
  { id: "village_dustford", name: "먼지 여울 마을", type: "village", tier: 1, position: { x: 500, y: 4900 } },
  { id: "village_marshend", name: "늪끝 마을", type: "village", tier: 1, position: { x: 2300, y: 4500 } },
  { id: "village_oremouth", name: "광맥 어귀 마을", type: "village", tier: 1, position: { x: 1900, y: 3000 } },
  { id: "village_oldquarry", name: "옛 채석 마을", type: "village", tier: 1, position: { x: 2900, y: 3700 } },
  { id: "village_purple_ridge", name: "보라 능선 마을", type: "village", tier: 1, position: { x: 1000, y: 4500 } },
  { id: "village_deep_cavern", name: "깊은 동굴 마을", type: "village", tier: 1, position: { x: 2700, y: 4400 } },
  { id: "village_obsidian", name: "흑요석 마을", type: "village", tier: 1, position: { x: 1700, y: 3900 } },
  // 선더홀드 영역 (사막)
  { id: "village_oxford", name: "소나무 들 마을", type: "village", tier: 1, position: { x: 3700, y: 5400 } },
  { id: "village_wheatfield", name: "밀밭 마을", type: "village", tier: 1, position: { x: 6300, y: 5400 } },
  { id: "village_orchard", name: "과수원 마을", type: "village", tier: 1, position: { x: 5100, y: 5500 } },
  { id: "village_dune_market", name: "사구 시장 마을", type: "village", tier: 1, position: { x: 4500, y: 5500 } },
  { id: "village_oasis", name: "오아시스 마을", type: "village", tier: 1, position: { x: 5500, y: 5800 } },
  { id: "village_sandstone", name: "사암 마을", type: "village", tier: 1, position: { x: 3300, y: 5500 } },
  // 라그나로드 영역 (붉은산)
  { id: "village_ashrock", name: "잿바위 마을", type: "village", tier: 1, position: { x: 8500, y: 4400 } },
  { id: "village_hammer_camp", name: "망치 야영 마을", type: "village", tier: 1, position: { x: 9300, y: 3200 } },
  { id: "village_redspring", name: "붉은 샘 마을", type: "village", tier: 1, position: { x: 8400, y: 2500 } },
  { id: "village_redrock", name: "붉은 바위 마을", type: "village", tier: 1, position: { x: 9500, y: 3500 } },
  { id: "village_iron_camp", name: "철 야영 마을", type: "village", tier: 1, position: { x: 7300, y: 3300 } },
  { id: "village_summit", name: "정상 마을", type: "village", tier: 1, position: { x: 8500, y: 3000 } },
  // 분쟁지대 변두리
  { id: "village_crossroads_n", name: "북쪽 갈림길 마을", type: "village", tier: 1, position: { x: 4500, y: 2100 } },
  { id: "village_crossroads_s", name: "남쪽 갈림길 마을", type: "village", tier: 1, position: { x: 5500, y: 3700 } },
  // 평원 추가 마을 — 빈 공간 채움
  { id: "village_grassland", name: "들녘 마을", type: "village", tier: 1, position: { x: 3800, y: 2500 } },
  { id: "village_meadow", name: "풀밭 마을", type: "village", tier: 1, position: { x: 4200, y: 1800 } },
  { id: "village_river_bend", name: "강굽이 마을", type: "village", tier: 1, position: { x: 5800, y: 2400 } },
  { id: "village_sandhill", name: "사구 마을", type: "village", tier: 1, position: { x: 6300, y: 3200 } },
  { id: "village_reedside", name: "갈대 마을", type: "village", tier: 1, position: { x: 4000, y: 3400 } },
  { id: "village_central_north", name: "중앙 북녘 마을", type: "village", tier: 1, position: { x: 5500, y: 2200 } },
  // biome 경계 추가 마을
  { id: "village_eastern_bluff", name: "동남 절벽 마을", type: "village", tier: 1, position: { x: 7200, y: 4900 } },
  { id: "village_southwest_pass", name: "남서 후미 마을", type: "village", tier: 1, position: { x: 2500, y: 5600 } },
  { id: "village_north_minor", name: "서리 들 마을", type: "village", tier: 1, position: { x: 3500, y: 700 } },
  { id: "village_north_pass", name: "북고개 마을", type: "village", tier: 1, position: { x: 6300, y: 1400 } },
  // frontier
  { id: "village_icefall", name: "얼음폭포 마을", type: "village", tier: 1, position: { x: 500, y: 2000 } },
];

export const OUTPOSTS: Outpost[] = [
  ...NEUTRAL_OUTPOSTS,
  ...KINGDOMS,
  ...CITIES,
  ...OUTPOSTS_T2,
  ...VILLAGES,
];

export const MAP_BOUNDS = { width: 10000, height: 6000 } as const;
export const CONTINENT_NAME = "아스토리아 대륙";
