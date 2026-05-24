// v2 거점 (Outpost) 정적 데이터 — minimum sketch.
//
// 좌표 공간: 0~10000 × 0~6000 (큰 대륙 느낌).
// 5 왕국이 모서리·중하단에 분산, 분쟁지대(중앙)에 점령 경쟁용 거점들, 그 사이 길/마을.
//
// 이름·좌표·종류 분포는 첫 sketch — user 가 보고 튜닝. 후속 PR 에서 이미지/스토리·실측
// 게임플레이 따라 조정.
//
// 분량 (54): 5 왕국 + 10 도시 + 15 거점 + 20 마을 + 4 절대 중립.

import type { Outpost } from "./types";

// 절대 중립 거점 — NPC 영구 운영. 모든 거점 점령 시에도 사냥 막히지 않게 sanity.
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
    position: { x: 5000, y: 200 },
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
    position: { x: 9800, y: 3000 },
    neutral: true,
    description: "대륙 동단의 자유 항구.",
  },
];

// 5 왕국 (tier 4) — 시작 세력. 각자 type 다르게 (광산/마탑/요새/마을/마을 mix).
const KINGDOMS: Outpost[] = [
  {
    id: "kingdom_noinbrost",
    name: "노인브로스트 왕국",
    type: "fort",
    tier: 4,
    position: { x: 1500, y: 600 },
    description: "북부 빙하 위에 세워진 시야와 영창의 왕국.",
  },
  {
    id: "kingdom_elbongard",
    name: "엘본가드 왕국",
    type: "tower",
    tier: 4,
    position: { x: 8500, y: 700 },
    description: "동부 숲 깊은 곳, 마법과 학문의 왕국.",
  },
  {
    id: "kingdom_darksden",
    name: "다크스든 왕국",
    type: "mine",
    tier: 4,
    position: { x: 1500, y: 5200 },
    description: "서남부 늪지대의 광부 왕국. 깊은 광맥을 지배한다.",
  },
  {
    id: "kingdom_seonachuld",
    name: "선아출드 왕국",
    type: "village",
    tier: 4,
    position: { x: 5000, y: 5400 },
    description: "중남부 평원의 농경 왕국. 가장 평화로운 시작점.",
  },
  {
    id: "kingdom_ragnarod",
    name: "라그나로드 왕국",
    type: "fort",
    tier: 4,
    position: { x: 8500, y: 5200 },
    description: "동남부 산악의 전쟁 왕국. 공성에 능하다.",
  },
];

// 도시 (tier 3) — 왕국 근처 2개씩. 점령 어렵지만 큰 효과.
const CITIES: Outpost[] = [
  // 노인브로스트 근처
  {
    id: "city_glacier_market",
    name: "빙하 시장",
    type: "village",
    tier: 3,
    position: { x: 2800, y: 1100 },
    description: "노인브로스트 인근 교역 도시.",
  },
  {
    id: "city_aurora_keep",
    name: "오로라 성채",
    type: "fort",
    tier: 3,
    position: { x: 600, y: 1800 },
  },
  // 엘본가드 근처
  {
    id: "city_silverleaf",
    name: "은잎 도시",
    type: "tower",
    tier: 3,
    position: { x: 7300, y: 1500 },
  },
  {
    id: "city_oakheart",
    name: "참나무 심부",
    type: "village",
    tier: 3,
    position: { x: 9400, y: 1700 },
  },
  // 다크스든 근처
  {
    id: "city_iron_pit",
    name: "철광 분지",
    type: "mine",
    tier: 3,
    position: { x: 2700, y: 4500 },
  },
  {
    id: "city_swamp_market",
    name: "늪 시장",
    type: "village",
    tier: 3,
    position: { x: 700, y: 4200 },
  },
  // 선아출드 근처
  {
    id: "city_goldfield",
    name: "황금 들",
    type: "village",
    tier: 3,
    position: { x: 4200, y: 4500 },
  },
  {
    id: "city_river_haven",
    name: "강의 안식처",
    type: "village",
    tier: 3,
    position: { x: 5800, y: 4500 },
  },
  // 라그나로드 근처
  {
    id: "city_ironpeak",
    name: "철봉",
    type: "fort",
    tier: 3,
    position: { x: 7300, y: 4500 },
  },
  {
    id: "city_thunder_camp",
    name: "천둥 야영지",
    type: "fort",
    tier: 3,
    position: { x: 9400, y: 4500 },
  },
];

// 거점 (tier 2) — 왕국 사이 길목 + 분쟁지대. 종류별 효과.
const OUTPOSTS_T2: Outpost[] = [
  // 분쟁지대 (중앙) — 점령 경쟁 핵심
  {
    id: "war_central_fort",
    name: "중앙 요새",
    type: "fort",
    tier: 2,
    position: { x: 4500, y: 3000 },
    description: "중앙 분쟁지대의 핵심 요새. 시야와 방어 보너스.",
  },
  {
    id: "war_central_tower",
    name: "중앙 마탑",
    type: "tower",
    tier: 2,
    position: { x: 5500, y: 3000 },
    description: "분쟁지대의 마탑. 점령 시 빠른 이동/사냥 효율.",
  },
  {
    id: "war_central_mine",
    name: "중앙 광산",
    type: "mine",
    tier: 2,
    position: { x: 5000, y: 2500 },
    description: "분쟁지대의 광산. 영지 자원 산출.",
  },
  {
    id: "war_south_mine",
    name: "중앙 남광산",
    type: "mine",
    tier: 2,
    position: { x: 5000, y: 3500 },
  },
  // 북부 라인 (노인브로스트 ↔ 엘본가드 길목)
  {
    id: "outpost_frostgate",
    name: "서리 관문",
    type: "fort",
    tier: 2,
    position: { x: 3500, y: 1000 },
  },
  {
    id: "outpost_misttower",
    name: "안개 첨탑",
    type: "tower",
    tier: 2,
    position: { x: 6500, y: 1000 },
  },
  {
    id: "outpost_north_mine",
    name: "북부 광산",
    type: "mine",
    tier: 2,
    position: { x: 5000, y: 1500 },
  },
  // 서부 라인 (노인브로스트 ↔ 다크스든 길목)
  {
    id: "outpost_west_fort",
    name: "서부 요새",
    type: "fort",
    tier: 2,
    position: { x: 1500, y: 3000 },
  },
  {
    id: "outpost_west_mine",
    name: "서부 갱도",
    type: "mine",
    tier: 2,
    position: { x: 2000, y: 3500 },
  },
  // 동부 라인 (엘본가드 ↔ 라그나로드 길목)
  {
    id: "outpost_east_tower",
    name: "동부 마탑",
    type: "tower",
    tier: 2,
    position: { x: 8500, y: 3000 },
  },
  {
    id: "outpost_east_fort",
    name: "동부 요새",
    type: "fort",
    tier: 2,
    position: { x: 8000, y: 3500 },
  },
  // 남부 라인
  {
    id: "outpost_south_mine",
    name: "남부 광산",
    type: "mine",
    tier: 2,
    position: { x: 3500, y: 5000 },
  },
  {
    id: "outpost_south_fort",
    name: "남부 요새",
    type: "fort",
    tier: 2,
    position: { x: 6500, y: 5000 },
  },
  {
    id: "outpost_south_tower",
    name: "남부 마탑",
    type: "tower",
    tier: 2,
    position: { x: 4500, y: 4800 },
  },
  {
    id: "outpost_south_tower_2",
    name: "남부 외곽 마탑",
    type: "tower",
    tier: 2,
    position: { x: 5500, y: 4800 },
  },
];

// 마을 (tier 1) — 가장 작은 거점. 곳곳 흩어짐. 사냥 hub 역할 + 상점/저장소.
const VILLAGES: Outpost[] = [
  // 노인브로스트 영역
  { id: "village_snowbrook", name: "눈시내 마을", type: "village", tier: 1, position: { x: 800, y: 700 } },
  { id: "village_frostpine", name: "서릿솔 마을", type: "village", tier: 1, position: { x: 2200, y: 300 } },
  { id: "village_icefall", name: "얼음폭포 마을", type: "village", tier: 1, position: { x: 700, y: 2200 } },
  { id: "village_silverpoint", name: "은점 마을", type: "village", tier: 1, position: { x: 2500, y: 2400 } },
  // 엘본가드 영역
  { id: "village_birchgrove", name: "자작나무 숲 마을", type: "village", tier: 1, position: { x: 7800, y: 300 } },
  { id: "village_mosslake", name: "이끼 호수 마을", type: "village", tier: 1, position: { x: 9200, y: 700 } },
  { id: "village_dewfall", name: "이슬골 마을", type: "village", tier: 1, position: { x: 7500, y: 2300 } },
  { id: "village_starlit", name: "별빛 마을", type: "village", tier: 1, position: { x: 9500, y: 2400 } },
  // 다크스든 영역
  { id: "village_dustford", name: "먼지 여울 마을", type: "village", tier: 1, position: { x: 700, y: 4800 } },
  { id: "village_marshend", name: "늪끝 마을", type: "village", tier: 1, position: { x: 2300, y: 4800 } },
  { id: "village_oremouth", name: "광맥 어귀 마을", type: "village", tier: 1, position: { x: 800, y: 5700 } },
  { id: "village_oldquarry", name: "옛 채석 마을", type: "village", tier: 1, position: { x: 2500, y: 5800 } },
  // 선아출드 영역
  { id: "village_oxford", name: "소나무 들 마을", type: "village", tier: 1, position: { x: 4200, y: 5800 } },
  { id: "village_wheatfield", name: "밀밭 마을", type: "village", tier: 1, position: { x: 5800, y: 5800 } },
  { id: "village_orchard", name: "과수원 마을", type: "village", tier: 1, position: { x: 5000, y: 5800 } },
  // 라그나로드 영역
  { id: "village_ashrock", name: "잿바위 마을", type: "village", tier: 1, position: { x: 7800, y: 5700 } },
  { id: "village_hammer_camp", name: "망치 야영 마을", type: "village", tier: 1, position: { x: 9300, y: 5800 } },
  { id: "village_redspring", name: "붉은 샘 마을", type: "village", tier: 1, position: { x: 7500, y: 4800 } },
  // 중앙 분쟁지대 주변 작은 마을 (점령 쉬운 자리)
  { id: "village_crossroads_n", name: "북쪽 갈림길 마을", type: "village", tier: 1, position: { x: 5000, y: 2200 } },
  { id: "village_crossroads_s", name: "남쪽 갈림길 마을", type: "village", tier: 1, position: { x: 5000, y: 3800 } },
];

export const OUTPOSTS: Outpost[] = [
  ...NEUTRAL_OUTPOSTS,
  ...KINGDOMS,
  ...CITIES,
  ...OUTPOSTS_T2,
  ...VILLAGES,
];

// 맵 좌표 공간 — 클라/서버 모두 같은 값 참조.
export const MAP_BOUNDS = { width: 10000, height: 6000 } as const;

// 대륙 이름 (user 의 비전 png 기준 — 변경 가능).
export const CONTINENT_NAME = "아스토리아 대륙";
