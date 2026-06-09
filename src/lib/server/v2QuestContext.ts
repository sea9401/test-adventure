// 가이드 퀘스트 진행 상태(QuestCtx) 를 세이브 raw 값 + 외부 신호로 조립. GET(무락 read)·claim(락 read)
// 양쪽이 같은 함수를 쓰도록 raw 값/extras 를 인자로 받는다(읽기는 호출부가 책임).
//   character.v2  → class·level·frontierDepth·specChosen·passivePicks
//   proficiency.v2 → tier·cultivations(현 직군)
//   adventure-log.v2 → battleCount·bossKills(보스 첫 처치 칭호 수)
//   equipment.v2  → equippedCount·uniqueOwned
//   extras(DB/별도 세이브) → hasGuild·hasTraded·arenaPlayed (assembleQuestExtras)

import { and, eq, or } from "drizzle-orm";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import { parseProficiencyForChar } from "@/adventure/data/v2/proficiency";
import {
  parseEquipmentSave,
  isUnique,
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { V2_JOB_SPECS } from "@/adventure/data/v2/v2JobSpecs";
import { BOSS_TITLE_IDS } from "@/adventure/data/v2/dungeonBosses";
import type { QuestCtx } from "@/adventure/data/v2/v2Quests";
import { readSave, type DbExecutor } from "@/lib/server/savesKv";
import { guildMembers, marketplaceListingsV2 } from "@/db/schema";
import { ARENA_HISTORY_KEY } from "@/lib/storage-keys";
import { parseArenaHistory } from "@/lib/server/arena";

type CharSave = {
  class?: unknown;
  level?: unknown;
  frontierDepth?: unknown;
  specChoice?: unknown;
  unlockedPassives?: unknown;
  gold?: unknown;
  discoveredOutpostIds?: unknown;
};

type AdventureLog = {
  monsters?: Record<string, { kills?: number }>;
  battleLosses?: number;
  titles?: Record<string, unknown>;
};

export type QuestExtras = {
  hasGuild: boolean;
  hasTraded: boolean;
  arenaPlayed: boolean;
  arenaWins: number;
};

export function buildQuestCtx(args: {
  charRaw: unknown;
  proficiencyRaw: unknown;
  advLogRaw: unknown;
  equipmentRaw: unknown;
  extras: QuestExtras;
}): QuestCtx {
  const charSave = (args.charRaw ?? {}) as CharSave;

  const cls = parseV2Class(charSave.class);
  const group = tier1ClassOf(cls);

  const level =
    typeof charSave.level === "number"
      ? Math.max(1, Math.floor(charSave.level))
      : 1;
  const frontierDepth = Math.max(
    2,
    Math.floor(Number(charSave.frontierDepth) || 2),
  );

  // 전문화 선택 = 현 직군의 유효한 계파를 골랐는가(타 직군 잔재 specChoice 오인 방지).
  const specIds = new Set((V2_JOB_SPECS[group] ?? []).map((s) => s.id));
  const specChosen =
    typeof charSave.specChoice === "string" && specIds.has(charSave.specChoice);
  const passivePicks = Array.isArray(charSave.unlockedPassives)
    ? charSave.unlockedPassives.filter((x) => typeof x === "string").length
    : 0;

  // 차수·수행 — 현 직군 그룹 기준(state 라우트와 동일 파생).
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
  const titleCount =
    titles && typeof titles === "object" ? Object.keys(titles).length : 0;

  const { owned, equipped } = parseEquipmentSave(args.equipmentRaw);
  const equippedCount = Object.values(equipped).filter(
    (iid) => iid != null,
  ).length;
  const uniqueOwned = owned.filter((it) => {
    const def = V2_EQUIPMENT[it.id as V2EquipmentId];
    return def ? isUnique(def) : false;
  }).length;

  const gold = num(charSave.gold);
  const outpostsDiscovered = Array.isArray(charSave.discoveredOutpostIds)
    ? charSave.discoveredOutpostIds.length
    : 0;

  return {
    class: cls,
    level,
    tier,
    specChosen,
    passivePicks,
    battleCount,
    frontierDepth,
    equippedCount,
    uniqueOwned,
    cultivations,
    bossKills,
    hasGuild: args.extras.hasGuild,
    hasTraded: args.extras.hasTraded,
    arenaPlayed: args.extras.arenaPlayed,
    arenaWins: args.extras.arenaWins,
    gold,
    outpostsDiscovered,
    titleCount,
  };
}

// 세이브 raw 외의 신호(DB·별도 세이브 키) 집계 — 길드 소속 / 거래소 거래 / 투기장 기록.
// GET 은 db, claim 은 tx 를 넘긴다(둘 다 읽기 전용 쿼리).
export async function assembleQuestExtras(
  ex: DbExecutor,
  userId: string,
): Promise<QuestExtras> {
  const [guildRows, tradeRows, arenaRaw] = await Promise.all([
    ex
      .select({ id: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1),
    ex
      .select({ id: marketplaceListingsV2.id })
      .from(marketplaceListingsV2)
      .where(
        and(
          eq(marketplaceListingsV2.status, "sold"),
          or(
            eq(marketplaceListingsV2.sellerId, userId),
            eq(marketplaceListingsV2.buyerId, userId),
          ),
        ),
      )
      .limit(1),
    readSave(ex, userId, ARENA_HISTORY_KEY, {}),
  ]);
  const arenaHistory = parseArenaHistory(arenaRaw);
  return {
    hasGuild: guildRows.length > 0,
    hasTraded: tradeRows.length > 0,
    arenaPlayed: arenaHistory.length > 0,
    arenaWins: arenaHistory.filter((e) => e.outcome === "win").length,
  };
}

// guide-quests.v2 세이브 → 수령 완료 id 집합. (서버 전용 키 — SYNCED_KEYS 아님.)
export function parseClaimed(raw: unknown): Set<string> {
  const obj = (raw ?? {}) as { claimed?: unknown };
  if (!Array.isArray(obj.claimed)) return new Set();
  return new Set(obj.claimed.filter((x): x is string => typeof x === "string"));
}

export const GUIDE_QUESTS_KEY = "guide-quests.v2";
