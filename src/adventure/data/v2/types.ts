// v2 게임의 핵심 데이터 타입.
// 라이브의 권역(region) 시스템을 폐기하고 던전(Dungeon) + 거점(Outpost) 두 시스템으로 대체.
// 라이브의 전투 엔진·스킬·아이템·강화·마법부여는 그대로 재활용 (Monster 타입 등도 공유).

// === 던전 (PvE 성장의 주 무대) ===

// 단일 던전 5층. 1~2 캐릭 성장(1~100렙) / 3~5 만렙 후 엔드 파밍.
export type DungeonFloorId = 1 | 2 | 3 | 4 | 5;

// 권장 강도. 1~2 는 레벨 범위, 3~5 는 만렙 후 단계로 표현.
export type DungeonFloorRequirement =
  | { kind: "level"; min: number; max: number } // 1~2층
  | { kind: "endgame"; tier: "entry" | "mid" | "max" }; // 3~5층

export type DungeonFloor = {
  id: DungeonFloorId;
  name: string;
  requirement: DungeonFloorRequirement;
  // 출현 몬스터 (라이브 Monster 의 이름 키 그대로 사용).
  enemies: string[];
  // 가중치 안 주면 균등.
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

// 종류 — 점령 시 길드가 얻는 효과의 결을 결정.
export type OutpostType =
  | "mine"     // 광산 — 영지 자원 산출 (식량·광물 등)
  | "tower"    // 마탑 — 거점 전용 버프 (이동·시야·사냥 효율)
  | "fort"     // 요새 — 방어 보너스 + 군사 생산
  | "village"; // 마을 (일반) — 상점·hub + 사냥장

// 등급 — 강도/점령 난이도/효과 크기 4 단계.
export type OutpostTier = 1 | 2 | 3 | 4;
// 1 = 마을, 2 = 거점, 3 = 도시, 4 = 왕국

// 점령된 거점의 입장 정책 (점령 길드가 결정).
export type OutpostPolicy =
  | "open"        // 모두 입장 가능 (세금만 받음)
  | "alliance"    // 동맹 + 자기 길드만
  | "guild-only"; // 자기 길드원만

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
