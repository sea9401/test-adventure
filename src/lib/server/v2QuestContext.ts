// 가이드 퀘스트 진행 상태(QuestCtx) 를 세이브 raw 값에서 조립. GET(무락 read)·claim(락 read) 양쪽이
// 같은 함수를 쓰도록 raw 값을 인자로 받는다(읽기는 호출부가 책임).
//   character.v2  → level·frontierDepth·specChosen·passivePicks
//   proficiency.v2 → tier·cultivations(현 직군)
//   adventure-log.v2 → battleCount·bossKills(보스 첫 처치 칭호 수)
//   equipment.v2  → equippedCount

import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import { parseProficiencyForChar } from "@/adventure/data/v2/proficiency";
import { parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import { BOSS_TITLE_IDS } from "@/adventure/data/v2/dungeonBosses";
import type { QuestCtx } from "@/adventure/data/v2/v2Quests";

type CharSave = {
  class?: unknown;
  level?: unknown;
  frontierDepth?: unknown;
  specChoice?: unknown;
  unlockedPassives?: unknown;
};

type AdventureLog = {
  monsters?: Record<string, { kills?: number }>;
  battleLosses?: number;
  titles?: Record<string, unknown>;
};

export function buildQuestCtx(args: {
  charRaw: unknown;
  proficiencyRaw: unknown;
  advLogRaw: unknown;
  equipmentRaw: unknown;
}): QuestCtx {
  const charSave = (args.charRaw ?? {}) as CharSave;

  const level =
    typeof charSave.level === "number"
      ? Math.max(1, Math.floor(charSave.level))
      : 1;
  const frontierDepth = Math.max(
    2,
    Math.floor(Number(charSave.frontierDepth) || 2),
  );
  const specChosen =
    typeof charSave.specChoice === "string" && charSave.specChoice.length > 0;
  const passivePicks = Array.isArray(charSave.unlockedPassives)
    ? charSave.unlockedPassives.filter((x) => typeof x === "string").length
    : 0;

  // 차수·수행 — 현 직군 그룹 기준(state 라우트와 동일 파생).
  const group = tier1ClassOf(parseV2Class(charSave.class));
  const prof = parseProficiencyForChar(args.proficiencyRaw, charSave);
  const g = prof.groups[group];
  const tier = g?.tier ?? 1;
  const cultivations = g?.cultivations ?? 0;

  // 전투 수 — monster kills 합 + 패배(랭킹 battleCount 정의와 동일). 보상 게이트라 숫자 강제
  // 변환(손상 세이브의 문자열 값이 "+" 로 연결돼 string>=number 오판정 → 오지급되는 일 방지).
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const advLog = (args.advLogRaw ?? {}) as AdventureLog;
  const battleCount =
    Object.values(advLog.monsters ?? {}).reduce(
      (sum, m) => sum + num(m?.kills),
      0,
    ) + num(advLog.battleLosses);
  const titles = advLog.titles ?? {};
  const bossKills = BOSS_TITLE_IDS.filter((id) => titles[id] != null).length;

  const { equipped } = parseEquipmentSave(args.equipmentRaw);
  const equippedCount = Object.values(equipped).filter(
    (iid) => iid != null,
  ).length;

  return {
    level,
    tier,
    specChosen,
    passivePicks,
    battleCount,
    frontierDepth,
    equippedCount,
    cultivations,
    bossKills,
  };
}

// guide-quests.v2 세이브 → 수령 완료 id 집합. (서버 전용 키 — SYNCED_KEYS 아님.)
export function parseClaimed(raw: unknown): Set<string> {
  const obj = (raw ?? {}) as { claimed?: unknown };
  if (!Array.isArray(obj.claimed)) return new Set();
  return new Set(obj.claimed.filter((x): x is string => typeof x === "string"));
}

export const GUIDE_QUESTS_KEY = "guide-quests.v2";
