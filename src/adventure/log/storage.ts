import { TITLE_RENAMES } from "@/adventure/data/titles";

export type MonsterLogEntry = {
  encountered: boolean;
  kills: number;
  firstSeenAt?: number;
  lastKilledAt?: number;
};

export type TownLogEntry = {
  visited: boolean;
  firstVisitedAt?: number;
  npcsTalkedTo: string[];
};

export type NpcLogEntry = {
  talkCount: number;
  firstTalkAt?: number;
};

// 칭호는 한 번 획득하면 끝 — 등록 시각만 기록.
export type TitleLogEntry = {
  obtainedAt: number;
};

// 도감에 등록된 장비 — itemId 별로, "한 번이라도 보유/장착한 적 있는" 변형 키 목록.
// 변형 키: "base" | "d1"|"d2"(정교한/빼어난) | "c-2"|"c-1"|"c1"|"c2"(제작 등급).
// 인벤토리에서 폐기·판매해도 여기서는 사라지지 않는다(컬렉션 로그).
export type DiscoveredEquipmentEntry = {
  firstSeenAt: number;
  variants: string[];
};

export type AdventureLog = {
  monsters: Record<string, MonsterLogEntry>;
  towns: Record<string, TownLogEntry>;
  npcs: Record<string, NpcLogEntry>;
  titles: Record<string, TitleLogEntry>;
  /** 도감에 등록된 장비 — key 는 ItemId. 보유 여부와 무관하게 누적된다. */
  discoveredEquipment?: Record<string, DiscoveredEquipmentEntry>;
  /** 누적 전투 패배 횟수 — 칭호/통계용. */
  battleLosses?: number;
  /** 누적 글로벌 채팅 발화 횟수 — '수다쟁이' 칭호용. */
  chatCount?: number;
  /** 누적 치료소 이용 횟수 — '환자' 칭호용. */
  healingCount?: number;
  /** 누적 무피해 승리 횟수 — 광살참 스킬북 100회 업적용. */
  noDamageWins?: number;
  /**
   * 모험의 서 등록 마일스톤으로 지금까지 수령한 단련 포인트 수.
   * 가용 = floor(eligible entries / 20) - claimed. (compendiumReward.ts 참조)
   */
  compendiumPointsClaimed?: number;
};

export const ADVENTURE_LOG_KEY = "adventure-log.v2";

// 몬스터 이름이 바뀌었을 때 기존 도감 데이터를 새 이름으로 옮기기 위한 매핑.
export const MONSTER_RENAMES: Record<string, string> = {
  "호수 정령": "호수 님프",
  두더쥐: "두더지",
  // 천공 라인 잡몹 — "정찰병/골렘" 어휘 일원화 해소.
  "별빛 정찰자": "별점술사 잔영",
  "회랑 정찰자": "떠도는 시녀",
  "회랑의 골렘": "별궤도 자율기",
  "폐도 정찰병": "천공인 사관",
  "옛 천공의 골렘": "폐허의 거상",
  "폐허의 운기": "폐허의 거상",
  "길의 정찰관": "황성 의장기수",
  "옥좌의 호위": "옥좌의 검신",
  "봉인된 황좌 골렘": "잠든 황좌 거인",
};

function mergeMonsterEntries(
  a: MonsterLogEntry,
  b: MonsterLogEntry,
): MonsterLogEntry {
  return {
    encountered: a.encountered || b.encountered,
    kills: a.kills + b.kills,
    firstSeenAt:
      a.firstSeenAt !== undefined && b.firstSeenAt !== undefined
        ? Math.min(a.firstSeenAt, b.firstSeenAt)
        : (a.firstSeenAt ?? b.firstSeenAt),
    lastKilledAt:
      a.lastKilledAt !== undefined && b.lastKilledAt !== undefined
        ? Math.max(a.lastKilledAt, b.lastKilledAt)
        : (a.lastKilledAt ?? b.lastKilledAt),
  };
}

export function migrateMonsters(
  monsters: Record<string, MonsterLogEntry>,
): Record<string, MonsterLogEntry> {
  const next: Record<string, MonsterLogEntry> = { ...monsters };
  for (const [oldName, newName] of Object.entries(MONSTER_RENAMES)) {
    const oldEntry = next[oldName];
    if (!oldEntry) continue;
    const existing = next[newName];
    next[newName] = existing
      ? mergeMonsterEntries(existing, oldEntry)
      : oldEntry;
    delete next[oldName];
  }
  return next;
}

// 칭호 ID 가 바뀐 경우(임계값/네이밍 정리 등) 옛 키를 새 키로 옮긴다.
// 신 키가 이미 있으면 그쪽을 살리고(원래 obtainedAt 보존) 구 키만 제거.
export function migrateTitles(
  titles: Record<string, TitleLogEntry>,
): Record<string, TitleLogEntry> {
  let next: Record<string, TitleLogEntry> | null = null;
  for (const [oldId, newId] of Object.entries(TITLE_RENAMES)) {
    if (!titles[oldId]) continue;
    if (!next) next = { ...titles };
    if (!next[newId]) next[newId] = next[oldId];
    delete next[oldId];
  }
  return next ?? titles;
}

export const emptyAdventureLog = (): AdventureLog => ({
  monsters: {},
  towns: {},
  npcs: {},
  titles: {},
  discoveredEquipment: {},
  battleLosses: 0,
  chatCount: 0,
  healingCount: 0,
  compendiumPointsClaimed: 0,
});

