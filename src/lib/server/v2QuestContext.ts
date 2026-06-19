// 가이드 퀘스트 진행 상태(QuestCtx) 를 세이브 raw 값 + 외부 신호로 조립. GET(무락 read)·claim(락 read)
// 양쪽이 같은 함수를 쓰도록 raw 값/extras 를 인자로 받는다(읽기는 호출부가 책임).
//   character.v2  → class·level·frontierDepth·specChoice(→직업 tier 브리지)
//   proficiency.v2 → cultivations(현 직군). tier = 직업 카탈로그 tier(jobIdFromLegacy)
//   adventure-log.v2 → battleCount·bossKills(보스 첫 처치 칭호 수)
//   equipment.v2  → equippedCount·uniqueOwned
//   extras(DB/별도 세이브) → hasGuild·hasTraded·arenaPlayed (assembleQuestExtras)

import { and, eq, or, sql } from "drizzle-orm";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  V2_JOB_CATALOG,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  parseProficiencyForChar,
  totalCumLevel,
} from "@/adventure/data/v2/proficiency";
import {
  parseEquipmentSave,
  isUnique,
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import { BOSS_TITLE_IDS } from "@/adventure/data/v2/coopBosses";
import type { QuestCtx } from "@/adventure/data/v2/v2Quests";
import type { RepeatSignals } from "@/adventure/data/v2/v2RepeatQuests";
import { readSave, type DbExecutor } from "@/lib/server/savesKv";
import {
  guildMembers,
  marketplaceListingsV2,
  outpostClaimAttempts,
  outpostOccupations,
} from "@/db/schema";
import { ARENA_HISTORY_KEY } from "@/lib/storage-keys";
import { parseArenaHistory } from "@/lib/server/arena";
import { parseFishCodex } from "@/adventure/v2/fishingCodex";
import { parseTreasureCodex } from "@/adventure/v2/treasureCodex";

type CharSave = {
  class?: unknown;
  level?: unknown;
  frontierDepth?: unknown;
  specChoice?: unknown; // 직업 사다리 브리지(jobIdFromLegacy) — tier 파생용
  gold?: unknown;
  discoveredOutpostIds?: unknown;
  materials?: Record<string, unknown>;
};

type AdventureLog = {
  monsters?: Record<string, { kills?: number }>;
  battleLosses?: number;
  titles?: Record<string, unknown>;
  // 전쟁 카운터(2026-06-11) — eject/claim/treasury 라우트가 누적. 옛 세이브엔 없음(0 취급).
  warCaptures?: unknown;
  warEjectWins?: unknown;
  warTreasuryGold?: unknown;
};

export type QuestExtras = {
  hasGuild: boolean;
  hasTraded: boolean;
  arenaPlayed: boolean;
  arenaWins: number;
  // 전쟁의 길 — outpost_claim_attempts/occupations 파생.
  claimAttempted: boolean;
  hasOutpost: boolean;
  siegeWins: number;
  // 생활의 달인 — 도감 세이브 파생(fishing-codex.v1 / treasure-codex.v1).
  fishSpecies: number;
  antiquesFound: number;
  // 반복 퀘스트(차분 판정) — 누적치/타임스탬프.
  siegeAttempts: number;
  fishCaught: number;
  arenaTimes: number[];
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

  // 전직 진행(tier 1~4) — 코어루프는 proficiency 차수를 폐지(flattenGroupTiers 로 항상 1)하므로
  //   현 직업의 카탈로그 tier 로 본다(직업 사다리 = jobIdFromLegacy(class, specChoice) → 카탈로그).
  //   specChoice 는 advance-class 가 써주는 직업 저장 브리지(전문화 패시브와 무관).
  const spec =
    typeof charSave.specChoice === "string" ? charSave.specChoice : null;
  const tier = V2_JOB_CATALOG[jobIdFromLegacy(cls, spec)]?.tier ?? 1;
  // 수행 횟수 — 현 직군 그룹 기준(state 라우트와 동일 파생).
  const prof = parseProficiencyForChar(args.proficiencyRaw, charSave);
  const g = prof.groups[group];
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
  // 강화의 길 — 보유 장비 최고 강화 레벨 + 강화석 보유 합(붉은+푸른).
  const maxEnhanceLevel = owned.reduce(
    (max, it) => Math.max(max, it.enhance?.level ?? 0),
    0,
  );
  const mats = charSave.materials ?? {};
  const enhanceStones =
    num(mats[ENHANCE_STONE_MATERIAL_ID.red]) +
    num(mats[ENHANCE_STONE_MATERIAL_ID.blue]);

  const gold = num(charSave.gold);
  const outpostsDiscovered = Array.isArray(charSave.discoveredOutpostIds)
    ? charSave.discoveredOutpostIds.length
    : 0;

  // 확장 신호(2026-06-11) — 누적레벨·몬스터 종 수·전쟁 카운터.
  const cumLevel = totalCumLevel(prof);
  const speciesKilled = Object.values(advLog.monsters ?? {}).filter(
    (m) => num(m?.kills) > 0,
  ).length;
  const warCaptures = num(advLog.warCaptures);
  const warEjectWins = num(advLog.warEjectWins);
  const warTreasuryGold = num(advLog.warTreasuryGold);

  return {
    class: cls,
    level,
    tier,
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
    cumLevel,
    speciesKilled,
    claimAttempted: args.extras.claimAttempted,
    hasOutpost: args.extras.hasOutpost,
    siegeWins: args.extras.siegeWins,
    warCaptures,
    warEjectWins,
    warTreasuryGold,
    fishSpecies: args.extras.fishSpecies,
    antiquesFound: args.extras.antiquesFound,
    maxEnhanceLevel,
    enhanceStones,
  };
}

// 세이브 raw 외의 신호(DB·별도 세이브 키) 집계 — 길드 소속 / 거래소 거래 / 투기장 기록.
// GET 은 db, claim 은 tx 를 넘긴다(둘 다 읽기 전용 쿼리).
export async function assembleQuestExtras(
  ex: DbExecutor,
  userId: string,
): Promise<QuestExtras> {
  const [guildRows, tradeRows, arenaRaw, claimAgg, fishRaw, treasureRaw] =
    await Promise.all([
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
      // 점령 시도/승리 — (attackerUserId, createdAt) 인덱스 단일 집계.
      ex
        .select({
          total: sql<number>`count(*)::int`,
          wins: sql<number>`count(*) filter (where ${outpostClaimAttempts.won})::int`,
        })
        .from(outpostClaimAttempts)
        .where(eq(outpostClaimAttempts.attackerUserId, userId)),
      readSave(ex, userId, "fishing-codex.v1", {}),
      readSave(ex, userId, "treasure-codex.v1", {}),
    ]);
  const arenaHistory = parseArenaHistory(arenaRaw);

  // 내 길드 점령 거점 보유 — 길드 소속일 때만 1쿼리 추가.
  const guildId = guildRows[0]?.id ?? null;
  let hasOutpost = false;
  if (guildId != null) {
    const occ = await ex
      .select({ id: outpostOccupations.outpostId })
      .from(outpostOccupations)
      .where(eq(outpostOccupations.occupiedByGuildId, guildId))
      .limit(1);
    hasOutpost = occ.length > 0;
  }

  const fishCodex = parseFishCodex(fishRaw);
  return {
    hasGuild: guildRows.length > 0,
    hasTraded: tradeRows.length > 0,
    arenaPlayed: arenaHistory.length > 0,
    arenaWins: arenaHistory.filter((e) => e.outcome === "win").length,
    claimAttempted: (claimAgg[0]?.total ?? 0) > 0,
    hasOutpost,
    siegeWins: claimAgg[0]?.wins ?? 0,
    fishSpecies: Object.keys(fishCodex.fish).length,
    antiquesFound: Object.keys(parseTreasureCodex(treasureRaw).antiques).length,
    siegeAttempts: claimAgg[0]?.total ?? 0,
    fishCaught: Object.values(fishCodex.fish).reduce(
      (sum, e) => sum + Math.max(0, e.totalCaught ?? 0),
      0,
    ),
    arenaTimes: arenaHistory
      .map((e) => new Date(e.at).getTime())
      .filter((t) => Number.isFinite(t)),
  };
}

// guide-quests.v2 세이브 → 수령 완료 id 집합. (서버 전용 키 — SYNCED_KEYS 아님.)
export function parseClaimed(raw: unknown): Set<string> {
  const obj = (raw ?? {}) as { claimed?: unknown };
  if (!Array.isArray(obj.claimed)) return new Set();
  return new Set(obj.claimed.filter((x): x is string => typeof x === "string"));
}

export const GUIDE_QUESTS_KEY = "guide-quests.v2";
export const REPEAT_QUESTS_KEY = "repeat-quests.v2";

// guide-quests.v2 를 무락 read → 수령 완료 퀘스트 id 집합. 직업 해금 questCompleted 조건의
// 데이터 소스(JobUnlockContext.completedQuestIds). 읽기 전용 게이트라 lock 불필요(readSave).
// 반복 퀘스트(repeat-quests.v2)는 영구 완료가 아니라 제외 — questCompleted 는 1회성 가이드 완료만.
export async function loadCompletedQuestIds(
  exec: DbExecutor,
  userId: string,
): Promise<Set<string>> {
  const raw = await readSave(exec, userId, GUIDE_QUESTS_KEY, {});
  return parseClaimed(raw);
}

// 반복 퀘스트 신호 — adventure-log 누적치 + extras. ctx(가이드용)와 분리된 얇은 조립.
export function buildRepeatSignals(
  advLogRaw: unknown,
  extras: QuestExtras,
): RepeatSignals {
  const advLog = (advLogRaw ?? {}) as AdventureLog & {
    enhanceAttempts?: unknown;
  };
  const n = (v: unknown): number => {
    const x = typeof v === "number" ? v : Number(v);
    return Number.isFinite(x) ? Math.max(0, x) : 0;
  };
  const battleCount =
    Object.values(advLog.monsters ?? {}).reduce(
      (sum, m) => sum + n(m?.kills),
      0,
    ) + n(advLog.battleLosses);
  return {
    battleCount,
    siegeAttempts: extras.siegeAttempts,
    siegeWins: extras.siegeWins,
    warTreasuryGold: n(advLog.warTreasuryGold),
    fishCaught: extras.fishCaught,
    enhanceAttempts: n(advLog.enhanceAttempts),
    arenaTimes: extras.arenaTimes,
  };
}
