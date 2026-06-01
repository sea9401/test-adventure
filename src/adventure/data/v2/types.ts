// v2 게임의 핵심 데이터 타입.
// 라이브의 권역(region) 시스템을 폐기하고 던전(Dungeon) + 거점(Outpost) 두 시스템으로 대체.
// 라이브의 전투 엔진·스킬·아이템·강화·마법부여는 그대로 재활용 (Monster 타입 등도 공유).

import type { V2Element } from "./elements";
import type { V2MonsterStatusSkillId } from "./v2Skills";

// === 던전 (PvE 성장의 주 무대) ===

// 단일 던전 8층. 1~5 캐릭 성장(1~100렙, 라이브 권역 밴드별 분할) / 6~8 만렙 후 엔드 파밍.
export type DungeonFloorId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// 권장 강도. 1~5 는 권장 파워(derive 합성 스탯-파워, docs §8), 6~8 은 만렙 후 단계.
// 레벨 리셋 루프(전직 시 Lv1)로 레벨은 진척 척도가 못 돼 파워로 전환(PR-7). 하드 게이트는
// 아니고 권장 지표 — 플레이어가 "내 파워" 와 비교해 층을 고른다(난이도는 몹 강도로 자율 조정).
export type DungeonFloorRequirement =
  | { kind: "power"; min: number } // 1~5층 권장 파워(잠정 — PR-9 sim 캘리브)
  | { kind: "endgame"; tier: "entry" | "mid" | "max" }; // 6~8층

// 사냥터 출현 몬스터 — key 는 라이브 MONSTERS 의 스탯/스킬 출처, name 은 화면 표시 이름.
// 둘을 분리해, 표시 이름을 라이브 몬스터와 무관하게(지형에 맞게) 붙일 수 있다.
// image 는 v2 전용 초상화(이름과 짝). 없으면 BattleScene 이 라이브 MONSTERS 이미지로 폴백.
// element = PR-1 전투 재설계 — 몬스터 속성(상성 카운터). 미지정 = 무속성.
export type DungeonEnemy = {
  key: string;
  name: string;
  image?: string;
  element?: V2Element;
  /** PR-9 — 이 사냥터 몹이 플레이어에게 거는 상태이상 스킬(monsterOnly v2 스킬). v2 전용(라이브 무영향).
   *  hunt 가 enemyMonster.v2Skills 로 시드 → 엔진 적 페이즈에서 DoT/디버프 적용. */
  statusSkill?: V2MonsterStatusSkillId;
};

export type DungeonFloor = {
  id: DungeonFloorId;
  name: string;
  requirement: DungeonFloorRequirement;
  // 출현 몬스터. key = 라이브 Monster 스탯 출처, name = 표시 이름.
  enemies: DungeonEnemy[];
  // 가중치 안 주면 균등. key 기준.
  encounterWeights?: Record<string, number>;
  // 보스 (있는 층만). enemies 와 별개로 보스 도전 슬롯.
  boss?: { monsterName: string };
};

export type Dungeon = {
  id: "main"; // 단일 던전이라 id 고정. 미래에 다른 던전 추가하면 union 으로 확장.
  name: string;
  floors: DungeonFloor[];
};

// === 거점 (Outpost — 던전 입장 hub + 점령 대상) ===

// 종류 — 거점의 테마 + NPC 챔피언(점령 일기토) 성향을 결정.
// 자원 채집 경제는 폐기. 현재는 챔피언 성향만 차별화하며, 종류별 점령 버프는 후속.
export type OutpostType =
  | "mine"     // 광산 — 광부 챔피언(탱키)
  | "tower"    // 마탑 — 마법사 챔피언(고화력·저방어)
  | "fort"     // 요새 — 기사 챔피언(균형·방어)
  | "village"; // 마을 — 상점·hub + 사냥장. 기본 챔피언

// 등급 — 강도/점령 난이도/효과 크기 4 단계.
export type OutpostTier = 1 | 2 | 3 | 4;
// 1 = 마을, 2 = 거점, 3 = 도시, 4 = 왕국

// 점령된 거점의 입장 정책 (점령 길드가 결정).
// 동맹(alliance) 정책은 동맹 시스템 구현 전까지 옵션에서 제외 — 추후 추가 시
// "alliance" 식별자로 합류 예정 (저장된 옛 값은 hunt 가 open 으로 대우).
export type OutpostPolicy =
  | "open"         // 모두 입장 가능 (세금만 받음)
  | "guild-only";  // 점령 길드 멤버만 입장

export type Outpost = {
  id: string;
  name: string;
  type: OutpostType;
  tier: OutpostTier;
  position: { x: number; y: number };
  // 절대 중립 거점 — 점령 불가. 모든 거점이 길드 점령된 상황의 sanity 보장.
  // NPC 가 영구 운영. 세금 없음(또는 NPC 가 가져감 — TBD).
  neutral?: boolean;
  // 짧은 설명/플레이버 (UI 노출용).
  description?: string;
};

// === 런타임 점령 상태 ===
// DB 에 저장될 점령 상태. 정적 데이터(Outpost)와 분리.

export type OutpostOccupation = {
  outpostId: string;
  // null = NPC (미점령 또는 절대 중립). guild id = 그 길드 소유.
  occupiedByGuildId: string | null;
  // 점령 시점.
  occupiedAt?: string; // ISO date
  // 점령 길드가 설정한 입장 정책.
  policy: OutpostPolicy;
  // 골드 세금율 (0~1). 점령 길드가 자기 거점 정책으로 설정. open 정책에서만 의미.
  taxRate: number;
};
