// v2 단일 던전 — 8층 구조.
//
// 1~5층 = 1~100렙 캐릭 성장. 라이브 권역 밴드별 잡몹 그룹화 (×1.0).
//   캐릭 레벨에 맞는 층만 사냥 → Lv1 도 패배 0 보장.
// 6~8층 = 만렙 후 엔드 파밍. 라이브 별빛 권역 잡몹/엘리트 + 층별 FLOOR_DIFFICULTY
//         배수 적용 (hunt 시점에 scaleMonsterForFloor 로 hp/atk/def/exp 곱).
// 풀과 multiplier 는 다이얼링 — 배포 후 분포 보고 후속 PR 에서 조정.

import type { Dungeon, DungeonFloorId } from "./types";

// === 1층 — 변경 입구 (Lv 1~5) ========================================
// homeland 초입. 신캐 Lv1 도 안전한 풀.

const FLOOR1_ENEMIES = [
  "주정뱅이",
  "슬라임",
  "들개",
  "두더지",
  "박쥐",
  "동굴뱀",
  "거미",
  "산적",
  "들까마귀 떼",
  "갈대 살쾡이",
  "노상강도",
];

// === 2층 — 변경 외곽 (Lv 6~13) =======================================
// homeland 후반 · coast · midlands 시작.

const FLOOR2_ENEMIES = [
  "작은 광물 골렘",
  "호수 님프",
  "부서진 골렘",
  "떠도는 망령",
  "폐허 늑대",
  "집게발 게",
  "갯도요",
  "진흙 미꾸라지",
  "채석터 들개",
  "버려진 광부",
  "돌부스러기 골렘",
  "폐성벽 까마귀",
  "탈영 약탈자",
  "녹슨 자동인형",
];

// === 3층 — 산악 평원 (Lv 18~28) ======================================
// midlands · 산악 · 평원.

const FLOOR3_ENEMIES = [
  "산양",
  "바위 두꺼비",
  "산호초 사이렌",
  "갑각 약탈자",
  "가시 산호 골렘",
  "절벽 늑대",
  "돌풍 정령",
  "늑대 무리장",
  "들소",
  "초원 매",
  "떠돌이 약탈자",
];

// === 4층 — 화염 지대 (Lv 34~55) ======================================
// volcanic · dragonscale 일부.

const FLOOR4_ENEMIES = [
  "재먼지 골렘",
  "잿빛 들개",
  "불씨 도롱뇽",
  "불꽃 독수리",
  "화염 도마뱀",
  "산악 기사",
  "용골 광신도",
  "역병 하이에나",
  "묘지 그렘린",
  "용암 슬라임",
  "화산 두꺼비",
  "불꽃 골렘",
];

// === 5층 — 별빛 회랑 (Lv 70~100) =====================================
// skythrone 입구 ~ 별빛 권역 ~ 창공 옥좌. 만렙 도달까지의 마지막 성장구간.

const FLOOR5_ENEMIES = [
  // Lv 70 (skythrone 입구)
  "별점술사 잔영",
  "구름 사냥꾼",
  "운명 직조자",
  // Lv 75 (별빛 회랑 · 용비늘 묘지)
  "떠도는 시녀",
  "별빛 망령",
  "별궤도 자율기",
  "타락한 묘지기사",
  "잿빛 와이번",
  "용골 리치",
  // Lv 80 (선인의 폐도)
  "천공인 사관",
  "천공인 전사",
  "폐허의 거상",
  // Lv 85 (옥좌의 길)
  "황성 의장기수",
  "황성 호위병",
  "봉인 파편",
  // Lv 90 (창공의 옥좌)
  "별빛 사도",
  "옥좌의 검신",
  "잠든 황좌 거인",
];

// === 6층 — 균열 (엔드 entry) ========================================
// 라이브의 별빛 갱도(Lv100) ~ 별빛 협곡(Lv102) 잡몹. 만렙 진입 + 파라곤 시작.
// 스탯은 FLOOR_DIFFICULTY[6] = 1.2 배수.

const FLOOR6_ENEMIES: string[] = [
  // Lv 100 (별빛 갱도)
  "별빛 박쥐",
  "별빛 동굴뱀",
  "별빛 광물 골렘",
  // Lv 102 (별빛 협곡)
  "별빛 절벽 늑대",
  "별빛 돌풍 정령",
  "별빛 늑대 무리장",
];

// === 7층 — 어둠 (엔드 중반) =========================================
// 라이브의 별빛 산호초(Lv104) ~ 별빛 성채(Lv106) 잡몹. 만렙 + 중반 파라곤.
// 스탯은 FLOOR_DIFFICULTY[7] = 2.0 배수.

const FLOOR7_ENEMIES: string[] = [
  // Lv 104 (별빛 산호초)
  "별빛 산호초 사이렌",
  "별빛 갑각 약탈자",
  "별빛 가시 산호 골렘",
  // Lv 106 (별빛 성채)
  "별빛 폐성벽 까마귀",
  "별빛 탈영 약탈자",
  "별빛 녹슨 자동인형",
];

// === 8층 — 심연 (엔드 최종) =========================================
// 별빛 권역의 엘리트/지역 보스급 4종. 만렙 + 만개 파라곤 + 풀세팅 전제.
// 스탯은 FLOOR_DIFFICULTY[8] = 4.0 배수.

const FLOOR8_ENEMIES: string[] = [
  "별빛 광맥 수호자", // 별빛 갱도 엘리트 (pierce)
  "별빛 거인 잔영",   // 별빛 협곡 엘리트 (heavy_blow)
  "수심의 메아리",    // 별빛 산호초 엘리트 (enrage)
  "성문지기 잔영",    // 별빛 성채 엘리트 (heavy_blow)
];

// === 층별 난이도 multiplier =========================================
// hp/atk/def/exp 에 동시 적용. 1.0 = 라이브 베이스 그대로.
// 배포 후 도달시간/처치시간 분포 보고 조정.
//
// 1~5 = 라이브 성장 곡선 그대로 (×1.0). 캐릭 레벨에 맞는 층만 골라 사냥.
// 6 = 만렙 entry, 베이스 별빛 ×1.2.
// 7 = 만렙 + 풀세팅 도전, 별빛 ×2.0.
// 8 = 만렙 + 만개 파라곤 + 풀세팅 종착, 별빛 엘리트 ×4.0.

export const FLOOR_DIFFICULTY: Record<DungeonFloorId, number> = {
  1: 1.0,
  2: 1.0,
  3: 1.0,
  4: 1.0,
  5: 1.0,
  6: 1.2,
  7: 2.0,
  8: 4.0,
};

export const MAIN_DUNGEON: Dungeon = {
  id: "main",
  name: "심층의 미궁",
  floors: [
    {
      id: 1,
      name: "1층 — 변경 입구",
      requirement: { kind: "level", min: 1, max: 5 },
      enemies: FLOOR1_ENEMIES,
    },
    {
      id: 2,
      name: "2층 — 변경 외곽",
      requirement: { kind: "level", min: 6, max: 13 },
      enemies: FLOOR2_ENEMIES,
    },
    {
      id: 3,
      name: "3층 — 산악 평원",
      requirement: { kind: "level", min: 18, max: 28 },
      enemies: FLOOR3_ENEMIES,
    },
    {
      id: 4,
      name: "4층 — 화염 지대",
      requirement: { kind: "level", min: 34, max: 55 },
      enemies: FLOOR4_ENEMIES,
    },
    {
      id: 5,
      name: "5층 — 별빛 회랑",
      requirement: { kind: "level", min: 70, max: 100 },
      enemies: FLOOR5_ENEMIES,
    },
    {
      id: 6,
      name: "6층 — 균열",
      requirement: { kind: "endgame", tier: "entry" },
      enemies: FLOOR6_ENEMIES,
    },
    {
      id: 7,
      name: "7층 — 어둠",
      requirement: { kind: "endgame", tier: "mid" },
      enemies: FLOOR7_ENEMIES,
    },
    {
      id: 8,
      name: "8층 — 심연",
      requirement: { kind: "endgame", tier: "max" },
      enemies: FLOOR8_ENEMIES,
    },
  ],
};
