// v2 사냥터 — 8개 구역.
//
// 1~5구역 = 1~100렙 캐릭 성장 (들판→숲→산→화산→설원, 지상 지형). ×1.0.
//   캐릭 레벨에 맞는 구역만 사냥 → Lv1 도 패배 0 보장.
// 6~8구역 = 만렙 후 엔드 파밍 (별빛 폐허→별빛 성채→창공의 옥좌). 구역별 FLOOR_DIFFICULTY
//           배수 적용 (hunt 시점에 scaleMonsterForFloor 로 hp/atk/def/exp 곱).
//
// 표시 이름(name)은 지형에 맞춘 v2 고유 이름이고, 스탯/스킬 출처(key)는 라이브 MONSTERS.
// 둘이 분리돼 있어 출처가 무엇이든 지형에 맞는 이름을 붙인다 (예: 출처가 "박쥐"여도 들판선 "멧토끼").
// 풀과 multiplier 는 다이얼링 — 배포 후 분포 보고 후속 PR 에서 조정.

import type { Dungeon, DungeonEnemy, DungeonFloorId } from "./types";

// === 1구역 — 들판 (Lv 1~5) ===========================================
// 신캐 Lv1 도 안전한 풀.

const FLOOR1_ENEMIES: DungeonEnemy[] = [
  { key: "주정뱅이", name: "부랑자" },
  { key: "슬라임", name: "점액 덩어리" },
  { key: "들개", name: "들개" },
  { key: "두더지", name: "두더지" },
  { key: "박쥐", name: "멧토끼" },
  { key: "동굴뱀", name: "풀뱀" },
  { key: "거미", name: "들거미" },
  { key: "산적", name: "산적" },
  { key: "들까마귀 떼", name: "까마귀 떼" },
  { key: "갈대 살쾡이", name: "살쾡이" },
  { key: "노상강도", name: "노상강도" },
];

// === 2구역 — 숲 (Lv 6~13) ============================================

const FLOOR2_ENEMIES: DungeonEnemy[] = [
  { key: "작은 광물 골렘", name: "돌 골렘" },
  { key: "호수 님프", name: "물의 정령" },
  { key: "부서진 골렘", name: "불곰" },
  { key: "떠도는 망령", name: "숲 망령" },
  { key: "폐허 늑대", name: "회색 늑대" },
  { key: "집게발 게", name: "큰 가재" },
  { key: "갯도요", name: "올빼미" },
  { key: "진흙 미꾸라지", name: "늪 도롱뇽" },
  { key: "채석터 들개", name: "멧돼지" },
  { key: "버려진 광부", name: "길 잃은 나무꾼" },
  { key: "돌부스러기 골렘", name: "바위 골렘" },
  { key: "폐성벽 까마귀", name: "큰 까마귀" },
  { key: "탈영 약탈자", name: "숲 도적" },
  { key: "녹슨 자동인형", name: "가시 넝쿨" },
];

// === 3구역 — 산 (Lv 18~28) ===========================================

const FLOOR3_ENEMIES: DungeonEnemy[] = [
  { key: "산양", name: "산양" },
  { key: "바위 두꺼비", name: "바위 두꺼비" },
  { key: "산호초 사이렌", name: "하피" },
  { key: "갑각 약탈자", name: "바위게" },
  { key: "가시 산호 골렘", name: "가시 골렘" },
  { key: "절벽 늑대", name: "절벽 늑대" },
  { key: "돌풍 정령", name: "돌풍 정령" },
  { key: "늑대 무리장", name: "늑대 우두머리" },
  { key: "들소", name: "들소" },
  { key: "초원 매", name: "산매" },
  { key: "떠돌이 약탈자", name: "산적" },
];

// === 4구역 — 화산 (Lv 34~55) =========================================

const FLOOR4_ENEMIES: DungeonEnemy[] = [
  { key: "재먼지 골렘", name: "잿더미 골렘" },
  { key: "잿빛 들개", name: "잿빛 들개" },
  { key: "불씨 도롱뇽", name: "불도롱뇽" },
  { key: "불꽃 독수리", name: "불새" },
  { key: "화염 도마뱀", name: "화염 도마뱀" },
  { key: "산악 기사", name: "화염 기사" },
  { key: "용골 광신도", name: "불의 광신도" },
  { key: "역병 하이에나", name: "잿빛 하이에나" },
  { key: "묘지 그렘린", name: "재 그렘린" },
  { key: "용암 슬라임", name: "용암 슬라임" },
  { key: "화산 두꺼비", name: "화산 두꺼비" },
  { key: "불꽃 골렘", name: "마그마 골렘" },
];

// === 5구역 — 설원 (Lv 70~100) ========================================
// 만렙 도달까지의 마지막 성장구간. (별빛/창공은 엔드게임부터.)

const FLOOR5_ENEMIES: DungeonEnemy[] = [
  { key: "별점술사 잔영", name: "얼음 점쟁이" },
  { key: "구름 사냥꾼", name: "눈보라 사냥꾼" },
  { key: "운명 직조자", name: "서리 마녀" },
  { key: "떠도는 시녀", name: "설원 망령" },
  { key: "별빛 망령", name: "눈의 망령" },
  { key: "별궤도 자율기", name: "얼음 자동인형" },
  { key: "타락한 묘지기사", name: "서리 기사" },
  { key: "잿빛 와이번", name: "서리 와이번" },
  { key: "용골 리치", name: "얼음 리치" },
  { key: "천공인 사관", name: "설인 주술사" },
  { key: "천공인 전사", name: "설인 전사" },
  { key: "폐허의 거상", name: "얼음 거상" },
  { key: "황성 의장기수", name: "눈표범" },
  { key: "황성 호위병", name: "빙벽 파수병" },
  { key: "봉인 파편", name: "얼음 정령" },
  { key: "별빛 사도", name: "서리 사도" },
  { key: "옥좌의 검신", name: "빙하 검사" },
  { key: "잠든 황좌 거인", name: "잠든 얼음 거인" },
];

// === 6구역 — 별빛 폐허 (엔드 entry) ==================================
// 만렙 진입 + 파라곤 시작. 스탯은 FLOOR_DIFFICULTY[6] = 1.2 배수.

const FLOOR6_ENEMIES: DungeonEnemy[] = [
  { key: "별빛 박쥐", name: "별빛 박쥐" },
  { key: "별빛 동굴뱀", name: "폐허 독사" },
  { key: "별빛 광물 골렘", name: "폐허 골렘" },
  { key: "별빛 절벽 늑대", name: "별빛 늑대" },
  { key: "별빛 돌풍 정령", name: "별가루 정령" },
  { key: "별빛 늑대 무리장", name: "폐허 망령" },
];

// === 7구역 — 별빛 성채 (엔드 중반) ===================================
// 만렙 + 중반 파라곤. 스탯은 FLOOR_DIFFICULTY[7] = 2.0 배수.

const FLOOR7_ENEMIES: DungeonEnemy[] = [
  { key: "별빛 산호초 사이렌", name: "별빛 하피" },
  { key: "별빛 갑각 약탈자", name: "성채 약탈자" },
  { key: "별빛 가시 산호 골렘", name: "성벽 골렘" },
  { key: "별빛 폐성벽 까마귀", name: "성채 까마귀" },
  { key: "별빛 탈영 약탈자", name: "성채 기사" },
  { key: "별빛 녹슨 자동인형", name: "성채 수문장" },
];

// === 8구역 — 창공의 옥좌 (엔드 최종) =================================
// 별빛 권역의 엘리트/지역 보스급 4종. 스탯은 FLOOR_DIFFICULTY[8] = 4.0 배수.

const FLOOR8_ENEMIES: DungeonEnemy[] = [
  { key: "별빛 광맥 수호자", name: "옥좌의 수호자" }, // pierce
  { key: "별빛 거인 잔영", name: "창공 거인" }, // heavy_blow
  { key: "수심의 메아리", name: "별의 메아리" }, // enrage
  { key: "성문지기 잔영", name: "옥좌의 문지기" }, // heavy_blow
];

// === 구역별 난이도 multiplier =======================================
// hp/atk/def/exp 에 동시 적용. 1.0 = 라이브 베이스 그대로.
// 배포 후 도달시간/처치시간 분포 보고 조정.
//
// 1~5 = 라이브 성장 곡선 그대로 (×1.0). 캐릭 레벨에 맞는 구역만 골라 사냥.
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
  name: "사냥터",
  floors: [
    {
      id: 1,
      name: "들판",
      requirement: { kind: "level", min: 1, max: 5 },
      enemies: FLOOR1_ENEMIES,
    },
    {
      id: 2,
      name: "숲",
      requirement: { kind: "level", min: 6, max: 13 },
      enemies: FLOOR2_ENEMIES,
    },
    {
      id: 3,
      name: "산",
      requirement: { kind: "level", min: 18, max: 28 },
      enemies: FLOOR3_ENEMIES,
    },
    {
      id: 4,
      name: "화산",
      requirement: { kind: "level", min: 34, max: 55 },
      enemies: FLOOR4_ENEMIES,
    },
    {
      id: 5,
      name: "설원",
      requirement: { kind: "level", min: 70, max: 100 },
      enemies: FLOOR5_ENEMIES,
    },
    {
      id: 6,
      name: "별빛 폐허",
      requirement: { kind: "endgame", tier: "entry" },
      enemies: FLOOR6_ENEMIES,
    },
    {
      id: 7,
      name: "별빛 성채",
      requirement: { kind: "endgame", tier: "mid" },
      enemies: FLOOR7_ENEMIES,
    },
    {
      id: 8,
      name: "창공의 옥좌",
      requirement: { kind: "endgame", tier: "max" },
      enemies: FLOOR8_ENEMIES,
    },
  ],
};
