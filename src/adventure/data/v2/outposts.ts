// v2 거점 (Outpost) 정적 데이터.
//
// 좌표 공간: 0~10000 × 0~6000 (큰 대륙 느낌).
// 영역별 색깔 (밀도·종류 분포)을 다르게 — 격자 대칭 회피, 자연 지형 느낌:
//   - 노인브로스트(북서) — 빙하·요새 중심, sparse
//   - 엘본가드(북동) — 숲·마탑 dense
//   - 다크스든(서남) — 광산 cluster, 적은 마을
//   - 선아출드(중남) — 평원·마을 dense, 작은 거점들
//   - 라그나로드(동남) — 산악·요새, 적당 밀도
//   - 분쟁지대(중앙) — 점령 경쟁 거점들, 빈 공백도 의도적
//
// 분량 (54): 5 왕국 + 10 도시 + 15 거점 + 20 마을 + 4 절대 중립.

import type { Outpost } from "./types";

// 절대 중립 거점 — NPC 영구 운영.
const NEUTRAL_OUTPOSTS: Outpost[] = [
  {
    id: "neutral_haven_central",
    name: "중앙 자유 도시",
    type: "village",
    tier: 3,
    position: { x: 4900, y: 2700 },
    neutral: true,
    description: "어느 세력에도 속하지 않는 자유 도시. 모든 모험가에게 열려 있다.",
  },
  {
    id: "neutral_north_outpost",
    name: "북단 자유 거점",
    type: "village",
    tier: 2,
    position: { x: 4700, y: 250 },
    neutral: true,
    description: "대륙 북단의 자유 항구. 항상 열려 있다.",
  },
  {
    id: "neutral_south_outpost",
    name: "남단 자유 거점",
    type: "village",
    tier: 2,
    position: { x: 3300, y: 5950 },
    neutral: true,
    description: "대륙 남단의 자유 항구.",
  },
  {
    id: "neutral_east_outpost",
    name: "동단 자유 거점",
    type: "village",
    tier: 2,
    position: { x: 9870, y: 2550 },
    neutral: true,
    description: "대륙 동단의 자유 항구.",
  },
];

// 5 왕국 (tier 4) — 비대칭 배치. 노인브로스트는 약간 안쪽, 엘본가드는 좌측 안쪽,
// 다크스든은 좌단 끝, 선아출드는 우측으로 살짝, 라그나로드는 동단 안.
const KINGDOMS: Outpost[] = [
  {
    id: "kingdom_noinbrost",
    name: "노인브로스트 왕국",
    type: "fort",
    tier: 4,
    position: { x: 2100, y: 750 },
    description: "북부 빙하 위에 세워진 시야와 영창의 왕국.",
  },
  {
    id: "kingdom_elbongard",
    name: "엘본가드 왕국",
    type: "tower",
    tier: 4,
    position: { x: 8400, y: 1300 },
    description: "동부 숲 깊은 곳, 마법과 학문의 왕국.",
  },
  {
    id: "kingdom_darksden",
    name: "다크스든 왕국",
    type: "mine",
    tier: 4,
    position: { x: 1100, y: 4800 },
    description: "서남부 늪지대의 광부 왕국. 깊은 광맥을 지배한다.",
  },
  {
    id: "kingdom_seonachuld",
    name: "선아출드 왕국",
    type: "village",
    tier: 4,
    position: { x: 5400, y: 5150 },
    description: "중남부 평원의 농경 왕국. 가장 평화로운 시작점.",
  },
  {
    id: "kingdom_ragnarod",
    name: "라그나로드 왕국",
    type: "fort",
    tier: 4,
    position: { x: 8700, y: 4900 },
    description: "동남부 산악의 전쟁 왕국. 공성에 능하다.",
  },
];

// 도시 (tier 3) — 왕국 근처 2개씩, 비대칭 위치 (모든 방향에 균등 배치 X).
const CITIES: Outpost[] = [
  // 노인브로스트 영역
  {
    id: "city_glacier_market",
    name: "빙하 시장",
    type: "village",
    tier: 3,
    position: { x: 3000, y: 1450 },
    description: "노인브로스트 인근 교역 도시.",
  },
  {
    id: "city_aurora_keep",
    name: "오로라 성채",
    type: "fort",
    tier: 3,
    position: { x: 700, y: 1500 },
  },
  // 엘본가드 영역
  {
    id: "city_silverleaf",
    name: "은잎 도시",
    type: "tower",
    tier: 3,
    position: { x: 7100, y: 800 },
  },
  {
    id: "city_oakheart",
    name: "참나무 심부",
    type: "village",
    tier: 3,
    position: { x: 9300, y: 2300 },
  },
  // 다크스든 영역
  {
    id: "city_iron_pit",
    name: "철광 분지",
    type: "mine",
    tier: 3,
    position: { x: 2400, y: 5500 },
  },
  {
    id: "city_swamp_market",
    name: "늪 시장",
    type: "village",
    tier: 3,
    position: { x: 800, y: 4200 },
  },
  // 선아출드 영역
  {
    id: "city_goldfield",
    name: "황금 들",
    type: "village",
    tier: 3,
    position: { x: 4400, y: 4400 },
  },
  {
    id: "city_river_haven",
    name: "강의 안식처",
    type: "village",
    tier: 3,
    position: { x: 6200, y: 4700 },
  },
  // 라그나로드 영역
  {
    id: "city_ironpeak",
    name: "철봉",
    type: "fort",
    tier: 3,
    position: { x: 7300, y: 5400 },
  },
  {
    id: "city_thunder_camp",
    name: "천둥 야영지",
    type: "fort",
    tier: 3,
    position: { x: 9500, y: 4300 },
  },
];

// 거점 (tier 2) — 분쟁지대 4 + 비대칭 길목 11. 동서남북 균등 분포 X — 어떤 길은 dense, 어떤 길은 sparse.
const OUTPOSTS_T2: Outpost[] = [
  // 분쟁지대 (중앙) — 살짝 비대칭. 마탑+요새 가까이, 광산 위·아래로 떨어짐.
  {
    id: "war_central_fort",
    name: "중앙 요새",
    type: "fort",
    tier: 2,
    position: { x: 4400, y: 2900 },
    description: "중앙 분쟁지대의 핵심 요새. 시야와 방어 보너스.",
  },
  {
    id: "war_central_tower",
    name: "중앙 마탑",
    type: "tower",
    tier: 2,
    position: { x: 5600, y: 2900 },
    description: "분쟁지대의 마탑. 점령 시 빠른 이동/사냥 효율.",
  },
  {
    id: "war_central_mine",
    name: "중앙 광산",
    type: "mine",
    tier: 2,
    position: { x: 5000, y: 2300 },
    description: "분쟁지대의 광산. 영지 자원 산출.",
  },
  {
    id: "war_south_mine",
    name: "중앙 남광산",
    type: "mine",
    tier: 2,
    position: { x: 5200, y: 3700 },
  },
  // 북부 — 노인브로스트 ↔ 엘본가드 길. 안개 첨탑이 엘본가드 쪽에 더 가깝게 비대칭.
  {
    id: "outpost_frostgate",
    name: "서리 관문",
    type: "fort",
    tier: 2,
    position: { x: 4000, y: 1100 },
  },
  {
    id: "outpost_misttower",
    name: "안개 첨탑",
    type: "tower",
    tier: 2,
    position: { x: 7200, y: 1900 },
  },
  {
    id: "outpost_north_mine",
    name: "북부 광산",
    type: "mine",
    tier: 2,
    position: { x: 5200, y: 1700 },
  },
  // 서부 — 다크스든의 광산 클러스터 확장
  {
    id: "outpost_west_fort",
    name: "서부 요새",
    type: "fort",
    tier: 2,
    position: { x: 1800, y: 3200 },
  },
  {
    id: "outpost_west_mine",
    name: "서부 갱도",
    type: "mine",
    tier: 2,
    position: { x: 2300, y: 3800 },
  },
  // 동부 — 엘본가드/라그나로드 사이 험준한 라인. 마탑 + 요새 mix
  {
    id: "outpost_east_tower",
    name: "동부 마탑",
    type: "tower",
    tier: 2,
    position: { x: 8800, y: 2900 },
  },
  {
    id: "outpost_east_fort",
    name: "동부 요새",
    type: "fort",
    tier: 2,
    position: { x: 7800, y: 3700 },
  },
  // 남부 — 라그나로드 ↔ 선아출드 ↔ 다크스든 거점 산포 (비대칭, 일부 cluster)
  {
    id: "outpost_south_mine",
    name: "남부 광산",
    type: "mine",
    tier: 2,
    position: { x: 3700, y: 4900 },
  },
  {
    id: "outpost_south_fort",
    name: "남부 요새",
    type: "fort",
    tier: 2,
    position: { x: 6800, y: 4400 },
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
    position: { x: 5800, y: 4900 },
  },
];

// 마을 (tier 1) — 영역별로 수 다르게 + 위치 비대칭. 일부 frontier (외딴 곳) 도.
const VILLAGES: Outpost[] = [
  // 노인브로스트 (sparse 빙하 — 3 마을, 비대칭)
  { id: "village_snowbrook", name: "눈시내 마을", type: "village", tier: 1, position: { x: 1300, y: 1200 } },
  { id: "village_frostpine", name: "서릿솔 마을", type: "village", tier: 1, position: { x: 2700, y: 400 } },
  { id: "village_silverpoint", name: "은점 마을", type: "village", tier: 1, position: { x: 2900, y: 1900 } },
  // 엘본가드 (dense 숲 — 4 마을)
  { id: "village_birchgrove", name: "자작나무 숲 마을", type: "village", tier: 1, position: { x: 7900, y: 500 } },
  { id: "village_mosslake", name: "이끼 호수 마을", type: "village", tier: 1, position: { x: 9500, y: 1000 } },
  { id: "village_dewfall", name: "이슬골 마을", type: "village", tier: 1, position: { x: 6800, y: 2400 } },
  { id: "village_starlit", name: "별빛 마을", type: "village", tier: 1, position: { x: 9700, y: 2700 } },
  // 다크스든 (광산 cluster — 4 마을, 광맥 줄기)
  { id: "village_dustford", name: "먼지 여울 마을", type: "village", tier: 1, position: { x: 500, y: 5400 } },
  { id: "village_marshend", name: "늪끝 마을", type: "village", tier: 1, position: { x: 2700, y: 5200 } },
  { id: "village_oremouth", name: "광맥 어귀 마을", type: "village", tier: 1, position: { x: 1800, y: 4300 } },
  { id: "village_oldquarry", name: "옛 채석 마을", type: "village", tier: 1, position: { x: 3000, y: 5800 } },
  // 선아출드 (dense 평원 — 3 마을)
  { id: "village_oxford", name: "소나무 들 마을", type: "village", tier: 1, position: { x: 4500, y: 5700 } },
  { id: "village_wheatfield", name: "밀밭 마을", type: "village", tier: 1, position: { x: 6400, y: 5400 } },
  { id: "village_orchard", name: "과수원 마을", type: "village", tier: 1, position: { x: 5100, y: 5800 } },
  // 라그나로드 (산악 — 3 마을, 사이사이 길)
  { id: "village_ashrock", name: "잿바위 마을", type: "village", tier: 1, position: { x: 8200, y: 5500 } },
  { id: "village_hammer_camp", name: "망치 야영 마을", type: "village", tier: 1, position: { x: 9300, y: 5800 } },
  { id: "village_redspring", name: "붉은 샘 마을", type: "village", tier: 1, position: { x: 7500, y: 4400 } },
  // 분쟁지대 변두리 (2 마을, 양 갈림길)
  { id: "village_crossroads_n", name: "북쪽 갈림길 마을", type: "village", tier: 1, position: { x: 4700, y: 1900 } },
  { id: "village_crossroads_s", name: "남쪽 갈림길 마을", type: "village", tier: 1, position: { x: 5400, y: 3900 } },
  // frontier — 외딴 마을 (대륙 끝, 빈 공백 사이)
  { id: "village_icefall", name: "얼음폭포 마을", type: "village", tier: 1, position: { x: 500, y: 2800 } },
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
