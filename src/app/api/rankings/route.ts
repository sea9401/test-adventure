import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getAdminEmailsList } from "@/lib/server/isAdmin";
import { kstWeekStartKey } from "@/adventure/tower/weeklyTypes";
import { pointsFromExp } from "@/lib/paragon";
import { derivePowerScore } from "@/adventure/data/v2/power";
import { isStoredAvatarId, type Avatar } from "@/adventure/profile/avatars";
import {
  derivePlayerCombatV2FromSaves,
  type SavedCharacterV2,
} from "@/lib/server/derivePlayerCombatV2";
import {
  FISHING_CODEX_KEY,
} from "@/adventure/v2/fishingCodex";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import { COOKING_SAVE_KEY } from "@/adventure/v2/cooking";
import { FISHING_PROGRESS_KEY } from "@/adventure/v2/fishingProgression";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { MASTERY_TOWER_SAVE_KEY } from "@/adventure/data/v2/masteryTower";
import { GUIDE_QUESTS_KEY } from "@/lib/server/v2QuestContext";
import {
  buildQuestCtx,
  parseClaimed,
} from "@/lib/server/v2QuestContext";
import { achievementSummary } from "@/adventure/data/v2/v2Quests";
import { parseFishCodex } from "@/adventure/v2/fishingCodex";
import {
  codexCompletionRankingFromSaves,
  lifeMasteryRankingFromSaves,
} from "@/lib/server/rankingMetrics";
import { readMuseunCosmeticAppearanceMap } from "@/lib/server/museunCosmetics";

// 관리자 계정을 랭킹에서 제외하는 SQL 필터. ADMIN_EMAILS 가 비어 있으면 빈 fragment.
// 호출처는 stats CTE 의 WHERE 절에 그대로 합성한다.
function excludeAdminEmails(): SQL {
  const emails = getAdminEmailsList();
  if (emails.length === 0) return sql``;
  const list = sql.join(
    emails.map((e) => sql`${e}`),
    sql`, `,
  );
  return sql`AND LOWER(u.email) NOT IN (${list})`;
}

const VALID_METRICS = [
  "level",
  "fame",
  "combatPower",
  "lifeMastery",
  "codexCompletion",
  "masteryTower",
  "achievementScore",
  "towerWeek",
  "towerChallenge",
] as const;
type Metric = (typeof VALID_METRICS)[number];
const isMetric = (v: string): v is Metric =>
  (VALID_METRICS as readonly string[]).includes(v);

const LIST_LIMIT = 100;
// 메모리 캐시 TTL — 리더보드는 약간 stale 해도 무방. 전투력은 여러 세이브를 조합해
// 산출하므로 30초 캐시로 반복 계산을 막는다. 단일 EC2 라 in-process 캐시면 충분.
// 캐시 미스만 SQL — 같은 metric 의 동시 cold-miss 는 inFlight promise 로 dedup.
const CACHE_TTL_MS = 30_000;

type RankRow = {
  userId: string;
  name: string;
  avatar: Avatar;
  level: number;
  /** 총 직업 숙련도 = 모든 직군 cumLevel 합(재전직 후에도 유지). level 탭 정렬·표시. */
  cumLevel: number;
  /** 파라곤 레벨 = 적립 EXP 로 획득한 총 포인트(0~150). 만렙 미만은 0. level 탭 표시·정렬용. */
  paragonLevel: number;
  fame: number;
  /** 캐릭터 화면과 같은 derivePowerScore 합성 전투력. */
  combatPower: number;
  /** 농사·벌목·채광·낚시 레벨 합계(각 50 상한). */
  lifeMastery: number;
  /** 직업 해금 + 장비 등록 + 어보 발견 수 / 전체 수집 가능 수. */
  codexCollected: number;
  codexTotal: number;
  /** 새 숙련의 탑(mastery-tower.v1) 역대 최고층. */
  masteryTowerFloor: number;
  /** 영구 업적에서 획득한 자동 합산 점수와 달성 개수. */
  achievementScore?: number;
  achievementCompleted?: number;
  /** towerWeek 한정 — 이번 주 최고층. 다른 metric 에서는 0. */
  weekHighest: number;
  /** towerChallenge 한정 — 도전 모드 영구 최고층. 다른 metric 에서는 0. */
  challengeHighest: number;
  rank: number;
};

const EMPTY_NEW_METRICS = {
  lifeMastery: 0,
  codexCollected: 0,
  codexTotal: 0,
  masteryTowerFloor: 0,
  achievementScore: 0,
  achievementCompleted: 0,
} as const;

type CacheEntry = {
  rows: RankRow[];
  computedAt: number;
  inFlight?: Promise<RankRow[]>;
};

const cache: Map<Metric, CacheEntry> = new Map();

function rankingAvatar(raw: unknown): Avatar {
  if (raw === "male") return "male1";
  if (raw === "female") return "female1";
  return isStoredAvatarId(raw) ? raw : "male1";
}

async function fetchRows(metric: Metric): Promise<RankRow[]> {
  if (metric === "combatPower") return fetchCombatPowerRows();
  if (metric === "lifeMastery") return fetchLifeMasteryRows();
  if (metric === "codexCompletion") return fetchCodexCompletionRows();
  if (metric === "masteryTower") return fetchMasteryTowerRows();
  if (metric === "achievementScore") return fetchAchievementRows();
  if (metric === "towerWeek") return fetchTowerWeekRows();
  if (metric === "towerChallenge") return fetchTowerChallengeRows();
  // metric 은 isMetric 으로 검증된 닫힌 enum — sql 템플릿에 안전하게 합성.
  // level 탭 = "총 직업 숙련도"(cum_level) 순. API metric 키는 호환을 위해 level 유지.
  // cumLevel 은 재전직으로 리셋되지 않는 직군 숙련도라 장기 성장 진행이 그대로 반영된다.
  // 동률은 현재 레벨 → 갱신시각 순.
  const orderBy =
    metric === "level"
      ? sql`cum_level DESC, level DESC, updated_at ASC`
      : sql`fame DESC, updated_at ASC`;

  // 닉네임은 users.game_name 우선, 없으면 character-profile.v2 의 name fallback.
  const result = await db.execute(sql`
    WITH stats AS (
      SELECT
        u.id AS user_id,
        COALESCE(u.game_name, p.value->>'name') AS name,
        p.value->>'gender' AS avatar,
        COALESCE((c.value->>'level')::int, 1) AS level,
        COALESCE((c.value->>'fame')::bigint, 0) AS fame,
        -- 총 직업 숙련도 — proficiency.v2.groups[*].cumLevel 합. 저장 필드명은 호환상 cumLevel 이지만
        -- 현재 적립 단위는 사냥 승리다. regex 가드로 비정수 1행이 쿼리를 터뜨리는 것 방지.
        COALESCE(
          (
            SELECT SUM((g.value->>'cumLevel')::int)
            FROM jsonb_each(pr.value->'groups') AS g
            WHERE (g.value->>'cumLevel') ~ '^[0-9]+$'
          ),
          0
        ) AS cum_level,
        -- 파라곤 적립 EXP. 큰 값(만렙 후 누적)이라 bigint. 포인트 환산은 JS(pointsFromExp).
        COALESCE((pg.value->>'paragonExp')::bigint, 0) AS paragon_exp,
        COALESCE(c.updated_at, u.created_at) AS updated_at
      FROM users u
      LEFT JOIN saves_kv c ON c.user_id = u.id AND c.key = 'character.v2'
      LEFT JOIN saves_kv p ON p.user_id = u.id AND p.key = 'character-profile.v2'
      LEFT JOIN saves_kv pg ON pg.user_id = u.id AND pg.key = 'paragon.v1'
      LEFT JOIN saves_kv pr ON pr.user_id = u.id AND pr.key = 'proficiency.v2'
      WHERE COALESCE(u.game_name, p.value->>'name') IS NOT NULL
        ${excludeAdminEmails()}
    ),
    ranked AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY ${orderBy})::int AS rank
      FROM stats
    )
    SELECT user_id, name, avatar, level, cum_level, paragon_exp, fame, rank
    FROM ranked
    ORDER BY rank
  `);

  type DbRow = {
    user_id: string;
    name: string;
    avatar: string | null;
    level: number;
    cum_level: number;
    // node-postgres 는 bigint(int8) 를 문자열로 반환할 수 있어 number|string 모두 수용.
    paragon_exp: number | string;
    fame: number;
    rank: number;
  };
  return (result.rows as unknown as DbRow[]).map((r) => ({
    userId: String(r.user_id),
    name: String(r.name),
    avatar: rankingAvatar(r.avatar),
    level: Number(r.level),
    cumLevel: Number(r.cum_level),
    paragonLevel: pointsFromExp(Number(r.paragon_exp)),
    fame: Number(r.fame),
    combatPower: 0,
    ...EMPTY_NEW_METRICS,
    weekHighest: 0,
    challengeHighest: 0,
    rank: Number(r.rank),
  }));
}

async function fetchLifeMasteryRows(): Promise<RankRow[]> {
  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      COALESCE(u.game_name, p.value->>'name') AS name,
      p.value->>'gender' AS avatar,
      farm.value AS farm_save,
      wood.value AS woodcutting_save,
      mining.value AS mining_save,
      fishing.value AS fishing_save,
      cooking.value AS cooking_save,
      GREATEST(
        COALESCE(farm.updated_at, u.created_at),
        COALESCE(wood.updated_at, u.created_at),
        COALESCE(mining.updated_at, u.created_at),
        COALESCE(fishing.updated_at, u.created_at),
        COALESCE(cooking.updated_at, u.created_at)
      ) AS updated_at
    FROM users u
    LEFT JOIN saves_kv p ON p.user_id = u.id AND p.key = 'character-profile.v2'
    LEFT JOIN saves_kv farm ON farm.user_id = u.id AND farm.key = ${FARM_SAVE_KEY}
    LEFT JOIN saves_kv wood ON wood.user_id = u.id AND wood.key = ${WOODCUTTING_LOG_KEY}
    LEFT JOIN saves_kv mining ON mining.user_id = u.id AND mining.key = ${MINING_LOG_KEY}
    LEFT JOIN saves_kv fishing ON fishing.user_id = u.id AND fishing.key = ${FISHING_PROGRESS_KEY}
    LEFT JOIN saves_kv cooking ON cooking.user_id = u.id AND cooking.key = ${COOKING_SAVE_KEY}
    WHERE COALESCE(u.game_name, p.value->>'name') IS NOT NULL
      ${excludeAdminEmails()}
  `);
  type DbRow = {
    user_id: string;
    name: string;
    avatar: string | null;
    farm_save: unknown;
    woodcutting_save: unknown;
    mining_save: unknown;
    fishing_save: unknown;
    cooking_save: unknown;
    updated_at: Date | string;
  };
  return (result.rows as unknown as DbRow[])
    .map((r) => {
      const mastery = lifeMasteryRankingFromSaves({
        farmRaw: r.farm_save,
        woodcuttingRaw: r.woodcutting_save,
        miningRaw: r.mining_save,
        fishingRaw: r.fishing_save,
        cookingRaw: r.cooking_save,
      });
      return {
        userId: String(r.user_id),
        name: String(r.name),
        avatar: rankingAvatar(r.avatar),
        level: 1,
        cumLevel: 0,
        paragonLevel: 0,
        fame: 0,
        combatPower: 0,
        lifeMastery: mastery.totalLevel,
        codexCollected: 0,
        codexTotal: 0,
        masteryTowerFloor: 0,
        weekHighest: 0,
        challengeHighest: 0,
        rank: 0,
        totalXp: mastery.totalXp,
        updatedAtMs: new Date(r.updated_at).getTime(),
      };
    })
    .sort(
      (a, b) =>
        b.lifeMastery - a.lifeMastery ||
        b.totalXp - a.totalXp ||
        a.updatedAtMs - b.updatedAtMs ||
        a.userId.localeCompare(b.userId),
    )
    .map((r, index) => ({
      userId: r.userId,
      name: r.name,
      avatar: r.avatar,
      level: r.level,
      cumLevel: r.cumLevel,
      paragonLevel: r.paragonLevel,
      fame: r.fame,
      combatPower: r.combatPower,
      lifeMastery: r.lifeMastery,
      codexCollected: r.codexCollected,
      codexTotal: r.codexTotal,
      masteryTowerFloor: r.masteryTowerFloor,
      weekHighest: r.weekHighest,
      challengeHighest: r.challengeHighest,
      rank: index + 1,
    }));
}

async function fetchCodexCompletionRows(): Promise<RankRow[]> {
  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      COALESCE(u.game_name, p.value->>'name') AS name,
      p.value->>'gender' AS avatar,
      c.value AS character_save,
      pr.value AS proficiency_save,
      farm.value AS farm_save,
      cooking.value AS cooking_save,
      wood.value AS woodcutting_save,
      mining.value AS mining_save,
      quests.value AS quests_save,
      equipment_codex.value AS equipment_codex_save,
      fishing_codex.value AS fishing_codex_save,
      GREATEST(
        COALESCE(c.updated_at, u.created_at),
        COALESCE(pr.updated_at, u.created_at),
        COALESCE(farm.updated_at, u.created_at),
        COALESCE(cooking.updated_at, u.created_at),
        COALESCE(wood.updated_at, u.created_at),
        COALESCE(mining.updated_at, u.created_at),
        COALESCE(quests.updated_at, u.created_at),
        COALESCE(equipment_codex.updated_at, u.created_at),
        COALESCE(fishing_codex.updated_at, u.created_at)
      ) AS updated_at
    FROM users u
    LEFT JOIN saves_kv p ON p.user_id = u.id AND p.key = 'character-profile.v2'
    LEFT JOIN saves_kv c ON c.user_id = u.id AND c.key = 'character.v2'
    LEFT JOIN saves_kv pr ON pr.user_id = u.id AND pr.key = 'proficiency.v2'
    LEFT JOIN saves_kv farm ON farm.user_id = u.id AND farm.key = ${FARM_SAVE_KEY}
    LEFT JOIN saves_kv cooking ON cooking.user_id = u.id AND cooking.key = ${COOKING_SAVE_KEY}
    LEFT JOIN saves_kv wood ON wood.user_id = u.id AND wood.key = ${WOODCUTTING_LOG_KEY}
    LEFT JOIN saves_kv mining ON mining.user_id = u.id AND mining.key = ${MINING_LOG_KEY}
    LEFT JOIN saves_kv quests ON quests.user_id = u.id AND quests.key = ${GUIDE_QUESTS_KEY}
    LEFT JOIN saves_kv equipment_codex ON equipment_codex.user_id = u.id AND equipment_codex.key = ${EQUIPMENT_CODEX_KEY}
    LEFT JOIN saves_kv fishing_codex ON fishing_codex.user_id = u.id AND fishing_codex.key = ${FISHING_CODEX_KEY}
    WHERE COALESCE(u.game_name, p.value->>'name') IS NOT NULL
      ${excludeAdminEmails()}
  `);
  type DbRow = {
    user_id: string;
    name: string;
    avatar: string | null;
    character_save: unknown;
    proficiency_save: unknown;
    farm_save: unknown;
    cooking_save: unknown;
    woodcutting_save: unknown;
    mining_save: unknown;
    quests_save: unknown;
    equipment_codex_save: unknown;
    fishing_codex_save: unknown;
    updated_at: Date | string;
  };
  return (result.rows as unknown as DbRow[])
    .map((r) => {
      const codex = codexCompletionRankingFromSaves({
        characterRaw: r.character_save,
        proficiencyRaw: r.proficiency_save,
        farmRaw: r.farm_save,
        cookingRaw: r.cooking_save,
        woodcuttingRaw: r.woodcutting_save,
        miningRaw: r.mining_save,
        questsRaw: r.quests_save,
        equipmentCodexRaw: r.equipment_codex_save,
        fishingCodexRaw: r.fishing_codex_save,
      });
      return {
        userId: String(r.user_id),
        name: String(r.name),
        avatar: rankingAvatar(r.avatar),
        level: 1,
        cumLevel: 0,
        paragonLevel: 0,
        fame: 0,
        combatPower: 0,
        lifeMastery: 0,
        codexCollected: codex.collected,
        codexTotal: codex.total,
        masteryTowerFloor: 0,
        weekHighest: 0,
        challengeHighest: 0,
        rank: 0,
        updatedAtMs: new Date(r.updated_at).getTime(),
      };
    })
    .sort(
      (a, b) =>
        b.codexCollected - a.codexCollected ||
        a.updatedAtMs - b.updatedAtMs ||
        a.userId.localeCompare(b.userId),
    )
    .map((r, index) => ({
      userId: r.userId,
      name: r.name,
      avatar: r.avatar,
      level: r.level,
      cumLevel: r.cumLevel,
      paragonLevel: r.paragonLevel,
      fame: r.fame,
      combatPower: r.combatPower,
      lifeMastery: r.lifeMastery,
      codexCollected: r.codexCollected,
      codexTotal: r.codexTotal,
      masteryTowerFloor: r.masteryTowerFloor,
      weekHighest: r.weekHighest,
      challengeHighest: r.challengeHighest,
      rank: index + 1,
    }));
}

async function fetchAchievementRows(): Promise<RankRow[]> {
  const result = await db.execute(sql`
    WITH pvp AS (
      SELECT user_id,
        COALESCE(SUM(wins), 0)::bigint AS wins,
        COALESCE(SUM(wins + losses + draws), 0)::bigint AS matches
      FROM pvp_ratings GROUP BY user_id
    ), guild_activity AS (
      SELECT actor_user_id AS user_id,
        COUNT(*) FILTER (WHERE type = 'dining_meal')::bigint AS dining_meals,
        COUNT(*) FILTER (WHERE type = 'training_drill_claim')::bigint AS training_drills,
        COUNT(*) FILTER (WHERE type = 'exploration_expedition_claim')::bigint AS expeditions,
        COUNT(*) FILTER (WHERE type = 'workshop_delivery')::bigint AS workshop_deliveries,
        COUNT(*) FILTER (WHERE type = 'alchemy_craft')::bigint AS alchemy_crafts,
        COUNT(*) FILTER (WHERE type = 'trade_contract_complete')::bigint AS trade_contracts
      FROM guild_activity_log
      WHERE actor_user_id IS NOT NULL
      GROUP BY actor_user_id
    )
    SELECT
      u.id AS user_id,
      COALESCE(u.game_name, profile.value->>'name') AS name,
      profile.value->>'gender' AS avatar,
      character.value AS character_save,
      proficiency.value AS proficiency_save,
      adventure.value AS adventure_save,
      equipment.value AS equipment_save,
      skills.value AS skills_save,
      crafting.value AS crafting_save,
      farm.value AS farm_save,
      wood.value AS woodcutting_save,
      mining.value AS mining_save,
      fishing.value AS fishing_save,
      equipment_codex.value AS equipment_codex_save,
      tower.value AS tower_save,
      cooking.value AS cooking_save,
      quests.value AS quests_save,
      fishing_codex.value AS fishing_codex_save,
      COALESCE(pvp.wins, 0)::bigint AS arena_wins,
      COALESCE(pvp.matches, 0)::bigint AS arena_matches,
      COALESCE(guild_activity.dining_meals, 0)::bigint AS guild_dining_meals,
      COALESCE(guild_activity.training_drills, 0)::bigint AS guild_training_drills,
      COALESCE(guild_activity.expeditions, 0)::bigint AS guild_expeditions,
      COALESCE(guild_activity.workshop_deliveries, 0)::bigint AS guild_workshop_deliveries,
      COALESCE(guild_activity.alchemy_crafts, 0)::bigint AS guild_alchemy_crafts,
      COALESCE(guild_activity.trade_contracts, 0)::bigint AS guild_trade_contracts,
      EXISTS (SELECT 1 FROM guild_members gm WHERE gm.user_id = u.id) AS has_guild,
      EXISTS (
        SELECT 1 FROM marketplace_listings_v2 ml
        WHERE ml.status = 'sold' AND (ml.seller_id = u.id OR ml.buyer_id = u.id)
      ) AS has_traded,
      COALESCE(quests.updated_at, u.created_at) AS updated_at
    FROM users u
    LEFT JOIN saves_kv profile ON profile.user_id = u.id AND profile.key = 'character-profile.v2'
    LEFT JOIN saves_kv character ON character.user_id = u.id AND character.key = 'character.v2'
    LEFT JOIN saves_kv proficiency ON proficiency.user_id = u.id AND proficiency.key = 'proficiency.v2'
    LEFT JOIN saves_kv adventure ON adventure.user_id = u.id AND adventure.key = 'adventure-log.v2'
    LEFT JOIN saves_kv equipment ON equipment.user_id = u.id AND equipment.key = 'equipment.v2'
    LEFT JOIN saves_kv skills ON skills.user_id = u.id AND skills.key = 'skills.v2'
    LEFT JOIN saves_kv crafting ON crafting.user_id = u.id AND crafting.key = 'crafting.v2'
    LEFT JOIN saves_kv farm ON farm.user_id = u.id AND farm.key = ${FARM_SAVE_KEY}
    LEFT JOIN saves_kv wood ON wood.user_id = u.id AND wood.key = ${WOODCUTTING_LOG_KEY}
    LEFT JOIN saves_kv mining ON mining.user_id = u.id AND mining.key = ${MINING_LOG_KEY}
    LEFT JOIN saves_kv fishing ON fishing.user_id = u.id AND fishing.key = ${FISHING_PROGRESS_KEY}
    LEFT JOIN saves_kv equipment_codex ON equipment_codex.user_id = u.id AND equipment_codex.key = ${EQUIPMENT_CODEX_KEY}
    LEFT JOIN saves_kv tower ON tower.user_id = u.id AND tower.key = ${MASTERY_TOWER_SAVE_KEY}
    LEFT JOIN saves_kv cooking ON cooking.user_id = u.id AND cooking.key = ${COOKING_SAVE_KEY}
    LEFT JOIN saves_kv quests ON quests.user_id = u.id AND quests.key = ${GUIDE_QUESTS_KEY}
    LEFT JOIN saves_kv fishing_codex ON fishing_codex.user_id = u.id AND fishing_codex.key = ${FISHING_CODEX_KEY}
    LEFT JOIN pvp ON pvp.user_id = u.id
    LEFT JOIN guild_activity ON guild_activity.user_id = u.id
    WHERE COALESCE(u.game_name, profile.value->>'name') IS NOT NULL
      ${excludeAdminEmails()}
  `);
  type DbRow = {
    user_id: string; name: string; avatar: string | null;
    character_save: unknown; proficiency_save: unknown; adventure_save: unknown;
    equipment_save: unknown; skills_save: unknown; crafting_save: unknown;
    farm_save: unknown; woodcutting_save: unknown; mining_save: unknown;
    fishing_save: unknown; equipment_codex_save: unknown; tower_save: unknown;
    cooking_save: unknown; quests_save: unknown; fishing_codex_save: unknown;
    arena_wins: number | string; arena_matches: number | string;
    guild_dining_meals: number | string;
    guild_training_drills: number | string;
    guild_expeditions: number | string;
    guild_workshop_deliveries: number | string;
    guild_alchemy_crafts: number | string;
    guild_trade_contracts: number | string;
    has_guild: boolean; has_traded: boolean;
    updated_at: Date | string;
  };
  return (result.rows as unknown as DbRow[])
    .map((r) => {
      const fishCodex = parseFishCodex(r.fishing_codex_save);
      const fishCaught = Object.values(fishCodex.fish).reduce(
        (sum, entry) => sum + Math.max(0, entry.totalCaught ?? 0),
        0,
      );
      const ctx = buildQuestCtx({
        charRaw: r.character_save,
        proficiencyRaw: r.proficiency_save,
        advLogRaw: r.adventure_save,
        equipmentRaw: r.equipment_save,
        skillsRaw: r.skills_save,
        craftingRaw: r.crafting_save,
        farmRaw: r.farm_save,
        woodcuttingRaw: r.woodcutting_save,
        miningRaw: r.mining_save,
        fishingProgressRaw: r.fishing_save,
        equipmentCodexRaw: r.equipment_codex_save,
        masteryTowerRaw: r.tower_save,
        cookingRaw: r.cooking_save,
        extras: {
          hasGuild: r.has_guild,
          hasTraded: r.has_traded,
          arenaPlayed: Number(r.arena_matches) > 0,
          arenaWins: Number(r.arena_wins),
          fishSpecies: Object.keys(fishCodex.fish).length,
          fishCaught,
          arenaTimes: [],
          guildDiningMeals: Number(r.guild_dining_meals ?? 0),
          guildTrainingDrills: Number(r.guild_training_drills ?? 0),
          guildExpeditions: Number(r.guild_expeditions ?? 0),
          guildWorkshopDeliveries: Number(r.guild_workshop_deliveries ?? 0),
          guildAlchemyCrafts: Number(r.guild_alchemy_crafts ?? 0),
          guildTradeContracts: Number(r.guild_trade_contracts ?? 0),
        },
      });
      const summary = achievementSummary(ctx, parseClaimed(r.quests_save));
      return {
        userId: String(r.user_id), name: String(r.name), avatar: rankingAvatar(r.avatar),
        level: 1, cumLevel: 0, paragonLevel: 0, fame: 0, combatPower: 0,
        lifeMastery: 0, codexCollected: 0, codexTotal: 0, masteryTowerFloor: 0,
        achievementScore: summary.score,
        achievementCompleted: summary.completed,
        weekHighest: 0, challengeHighest: 0, rank: 0,
        updatedAtMs: new Date(r.updated_at).getTime(),
      };
    })
    .sort((a, b) =>
      b.achievementScore - a.achievementScore ||
      b.achievementCompleted - a.achievementCompleted ||
      a.updatedAtMs - b.updatedAtMs ||
      a.userId.localeCompare(b.userId),
    )
    .map(({ updatedAtMs: _updatedAtMs, ...r }, index) => ({ ...r, rank: index + 1 }));
}

async function fetchMasteryTowerRows(): Promise<RankRow[]> {
  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      COALESCE(u.game_name, p.value->>'name') AS name,
      p.value->>'gender' AS avatar,
      tower.value AS tower_save,
      COALESCE(tower.updated_at, u.created_at) AS updated_at
    FROM users u
    INNER JOIN saves_kv tower ON tower.user_id = u.id AND tower.key = ${MASTERY_TOWER_SAVE_KEY}
    LEFT JOIN saves_kv p ON p.user_id = u.id AND p.key = 'character-profile.v2'
    WHERE COALESCE(u.game_name, p.value->>'name') IS NOT NULL
      ${excludeAdminEmails()}
  `);
  type DbRow = {
    user_id: string;
    name: string;
    avatar: string | null;
    tower_save: unknown;
    updated_at: Date | string;
  };
  return (result.rows as unknown as DbRow[])
    .map((r) => {
      const raw =
        r.tower_save && typeof r.tower_save === "object"
          ? (r.tower_save as Record<string, unknown>)
          : {};
      const masteryTowerFloor = Math.max(
        0,
        Math.min(50, Math.floor(Number(raw.lifetimeBestFloor) || 0)),
      );
      return {
        userId: String(r.user_id),
        name: String(r.name),
        avatar: rankingAvatar(r.avatar),
        level: 1,
        cumLevel: 0,
        paragonLevel: 0,
        fame: 0,
        combatPower: 0,
        lifeMastery: 0,
        codexCollected: 0,
        codexTotal: 0,
        masteryTowerFloor,
        weekHighest: 0,
        challengeHighest: 0,
        rank: 0,
        updatedAtMs: new Date(r.updated_at).getTime(),
      };
    })
    .filter((r) => r.masteryTowerFloor > 0)
    .sort(
      (a, b) =>
        b.masteryTowerFloor - a.masteryTowerFloor ||
        a.updatedAtMs - b.updatedAtMs ||
        a.userId.localeCompare(b.userId),
    )
    .map((r, index) => ({
      userId: r.userId,
      name: r.name,
      avatar: r.avatar,
      level: r.level,
      cumLevel: r.cumLevel,
      paragonLevel: r.paragonLevel,
      fame: r.fame,
      combatPower: r.combatPower,
      lifeMastery: r.lifeMastery,
      codexCollected: r.codexCollected,
      codexTotal: r.codexTotal,
      masteryTowerFloor: r.masteryTowerFloor,
      weekHighest: r.weekHighest,
      challengeHighest: r.challengeHighest,
      rank: index + 1,
    }));
}

async function fetchCombatPowerRows(): Promise<RankRow[]> {
  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      COALESCE(u.game_name, p.value->>'name') AS name,
      p.value->>'gender' AS avatar,
      c.value AS character_save,
      e.value AS equipment_save,
      pr.value AS proficiency_save,
      sk.value AS skills_save,
      GREATEST(
        COALESCE(c.updated_at, u.created_at),
        COALESCE(e.updated_at, u.created_at),
        COALESCE(pr.updated_at, u.created_at),
        COALESCE(sk.updated_at, u.created_at)
      ) AS updated_at
    FROM users u
    LEFT JOIN saves_kv p ON p.user_id = u.id AND p.key = 'character-profile.v2'
    LEFT JOIN saves_kv c ON c.user_id = u.id AND c.key = 'character.v2'
    LEFT JOIN saves_kv e ON e.user_id = u.id AND e.key = 'equipment.v2'
    LEFT JOIN saves_kv pr ON pr.user_id = u.id AND pr.key = 'proficiency.v2'
    LEFT JOIN saves_kv sk ON sk.user_id = u.id AND sk.key = 'skills.v2'
    WHERE COALESCE(u.game_name, p.value->>'name') IS NOT NULL
      ${excludeAdminEmails()}
  `);
  type DbRow = {
    user_id: string;
    name: string;
    avatar: string | null;
    character_save: unknown;
    equipment_save: unknown;
    proficiency_save: unknown;
    skills_save: unknown;
    updated_at: Date | string;
  };
  return (result.rows as unknown as DbRow[])
    .flatMap((r) => {
      const combat = derivePlayerCombatV2FromSaves({
        character: r.character_save as SavedCharacterV2 | undefined,
        equipmentSave: r.equipment_save,
        proficiencyRaw: r.proficiency_save,
        skillsRaw: r.skills_save,
        includeCookingBuff: false,
      });
      if (!combat) return [];
      const combatPower = derivePowerScore({
        atk: combat.player.atk,
        magicAtk: combat.player.magicAtk ?? 0,
        def: combat.player.def,
        spd: combat.player.spd,
        maxHp: combat.maxHp,
        maxMp: combat.player.maxMp ?? 0,
      });
      const character = r.character_save as SavedCharacterV2;
      return [{
        userId: String(r.user_id),
        name: String(r.name),
        avatar: rankingAvatar(r.avatar),
        level: Math.max(1, Number(character.level) || 1),
        cumLevel: 0,
        paragonLevel: 0,
        fame: 0,
        combatPower,
        ...EMPTY_NEW_METRICS,
        weekHighest: 0,
        challengeHighest: 0,
        rank: 0,
        updatedAtMs: new Date(r.updated_at).getTime(),
      }];
    })
    .sort(
      (a, b) =>
        b.combatPower - a.combatPower ||
        a.updatedAtMs - b.updatedAtMs ||
        a.userId.localeCompare(b.userId),
    )
    .map((r, index) => ({
      userId: r.userId,
      name: r.name,
      avatar: r.avatar,
      level: r.level,
      cumLevel: r.cumLevel,
      paragonLevel: r.paragonLevel,
      fame: r.fame,
      combatPower: r.combatPower,
      lifeMastery: r.lifeMastery,
      codexCollected: r.codexCollected,
      codexTotal: r.codexTotal,
      masteryTowerFloor: r.masteryTowerFloor,
      weekHighest: r.weekHighest,
      challengeHighest: r.challengeHighest,
      rank: index + 1,
    }));
}

// 주간 최고층 랭킹 — tower-weekly.v1 의 weekStartedAt 가 현재 KST 주와 같은 행만 노출.
// 이전 주 잔여 기록(아직 새 주에 참여 안 한 유저)은 자연 제외 → 리스트는 항상 "이번 주" 만.
async function fetchTowerWeekRows(): Promise<RankRow[]> {
  const thisWeek = kstWeekStartKey();
  const result = await db.execute(sql`
    WITH stats AS (
      SELECT
        u.id AS user_id,
        COALESCE(u.game_name, p.value->>'name') AS name,
        p.value->>'gender' AS avatar,
        COALESCE((c.value->>'level')::int, 1) AS level,
        COALESCE((c.value->>'fame')::bigint, 0) AS fame,
        COALESCE((w.value->>'weekHighest')::int, 0) AS week_highest,
        COALESCE(w.updated_at, u.created_at) AS updated_at
      FROM users u
      INNER JOIN saves_kv w ON w.user_id = u.id AND w.key = 'tower-weekly.v1'
      LEFT JOIN saves_kv c ON c.user_id = u.id AND c.key = 'character.v2'
      LEFT JOIN saves_kv p ON p.user_id = u.id AND p.key = 'character-profile.v2'
      WHERE w.value->>'weekStartedAt' = ${thisWeek}
        AND COALESCE((w.value->>'weekHighest')::int, 0) > 0
        AND COALESCE(u.game_name, p.value->>'name') IS NOT NULL
        ${excludeAdminEmails()}
    ),
    ranked AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY week_highest DESC, updated_at ASC)::int AS rank
      FROM stats
    )
    SELECT user_id, name, avatar, level, fame, week_highest, rank
    FROM ranked
    ORDER BY rank
  `);
  type DbRow = {
    user_id: string;
    name: string;
    avatar: string | null;
    level: number;
    fame: number;
    week_highest: number;
    rank: number;
  };
  return (result.rows as unknown as DbRow[]).map((r) => ({
    userId: String(r.user_id),
    name: String(r.name),
    avatar: rankingAvatar(r.avatar),
    level: Number(r.level),
    cumLevel: 0, // 고탑 탭은 숙련도 미사용.
    paragonLevel: 0, // 고탑(주간) 탭은 층(F.) 표시 — 파라곤 미사용.
    fame: Number(r.fame),
    combatPower: 0,
    ...EMPTY_NEW_METRICS,
    weekHighest: Number(r.week_highest),
    challengeHighest: 0,
    rank: Number(r.rank),
  }));
}

// 도전 모드 영구 최고층 랭킹 — tower-challenge.v1.progress.highestFloor.
// 시즌 개념 없이 누적이라 한 번 F50 찍은 자는 계속 노출. 0 인 유저는 제외.
async function fetchTowerChallengeRows(): Promise<RankRow[]> {
  const result = await db.execute(sql`
    WITH stats AS (
      SELECT
        u.id AS user_id,
        COALESCE(u.game_name, p.value->>'name') AS name,
        p.value->>'gender' AS avatar,
        COALESCE((c.value->>'level')::int, 1) AS level,
        COALESCE((c.value->>'fame')::bigint, 0) AS fame,
        COALESCE((ch.value->'progress'->>'highestFloor')::int, 0) AS challenge_highest,
        COALESCE(ch.updated_at, u.created_at) AS updated_at
      FROM users u
      INNER JOIN saves_kv ch ON ch.user_id = u.id AND ch.key = 'tower-challenge.v1'
      LEFT JOIN saves_kv c ON c.user_id = u.id AND c.key = 'character.v2'
      LEFT JOIN saves_kv p ON p.user_id = u.id AND p.key = 'character-profile.v2'
      WHERE COALESCE((ch.value->'progress'->>'highestFloor')::int, 0) > 0
        AND COALESCE(u.game_name, p.value->>'name') IS NOT NULL
        ${excludeAdminEmails()}
    ),
    ranked AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY challenge_highest DESC, updated_at ASC)::int AS rank
      FROM stats
    )
    SELECT user_id, name, avatar, level, fame, challenge_highest, rank
    FROM ranked
    ORDER BY rank
  `);
  type DbRow = {
    user_id: string;
    name: string;
    avatar: string | null;
    level: number;
    fame: number;
    challenge_highest: number;
    rank: number;
  };
  return (result.rows as unknown as DbRow[]).map((r) => ({
    userId: String(r.user_id),
    name: String(r.name),
    avatar: rankingAvatar(r.avatar),
    level: Number(r.level),
    cumLevel: 0, // 고탑 탭은 숙련도 미사용.
    paragonLevel: 0, // 고탑(도전) 탭은 층(F.) 표시 — 파라곤 미사용.
    fame: Number(r.fame),
    combatPower: 0,
    ...EMPTY_NEW_METRICS,
    weekHighest: 0,
    challengeHighest: Number(r.challenge_highest),
    rank: Number(r.rank),
  }));
}

async function getRows(metric: Metric): Promise<RankRow[]> {
  const now = Date.now();
  const entry = cache.get(metric);
  if (entry && now - entry.computedAt < CACHE_TTL_MS) {
    return entry.rows;
  }
  if (entry?.inFlight) return entry.inFlight;

  const promise = fetchRows(metric).then(
    (rows) => {
      cache.set(metric, { rows, computedAt: Date.now() });
      return rows;
    },
    (err: unknown) => {
      // 실패 시 inFlight 만 클리어해 다음 요청이 재시도 — 기존 stale 캐시는 보존.
      const e = cache.get(metric);
      if (e && e.inFlight === promise) {
        cache.set(metric, { rows: e.rows, computedAt: e.computedAt });
      }
      throw err;
    },
  );
  cache.set(metric, {
    rows: entry?.rows ?? [],
    computedAt: entry?.computedAt ?? 0,
    inFlight: promise,
  });
  return promise;
}

// GET /api/rankings?metric=level|combatPower|lifeMastery|codexCompletion|masteryTower|achievementScore
// 응답: { list: 상위 LIST_LIMIT, me: 본인 row+rank | null }.
// 본인 row 도 캐시 스냅샷에서 찾으므로 갓 레벨업한 직후엔 다음 캐시 갱신까지
// 갱신값이 안 보일 수 있음 (의도된 trade-off — 부하 대비 30초 staleness).
export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const metric = url.searchParams.get("metric") ?? "level";
  if (!isMetric(metric)) {
    return new Response(`unknown metric: ${metric}`, { status: 400 });
  }

  const rows = await getRows(metric);
  const visibleRows = rows.slice(0, LIST_LIMIT);
  const myRow = rows.find((r) => r.userId === userId);
  const cosmeticByUser = await readMuseunCosmeticAppearanceMap([
    ...visibleRows.map((r) => r.userId),
    ...(myRow ? [myRow.userId] : []),
  ]);

  const list = visibleRows.map((r) => ({
    rank: r.rank,
    name: r.name,
    avatar: r.avatar,
    level: r.level,
    cumLevel: r.cumLevel,
    paragonLevel: r.paragonLevel,
    fame: r.fame,
    combatPower: r.combatPower,
    lifeMastery: r.lifeMastery,
    codexCollected: r.codexCollected,
    codexTotal: r.codexTotal,
    masteryTowerFloor: r.masteryTowerFloor,
    achievementScore: r.achievementScore ?? 0,
    achievementCompleted: r.achievementCompleted ?? 0,
    weekHighest: r.weekHighest,
    challengeHighest: r.challengeHighest,
    mine: r.userId === userId,
    profileBorder: cosmeticByUser.get(r.userId)?.profileBorder ?? null,
    chatNameEffect: cosmeticByUser.get(r.userId)?.chatNameEffect ?? null,
  }));

  const me = myRow
    ? {
        rank: myRow.rank,
        name: myRow.name,
        avatar: myRow.avatar,
        level: myRow.level,
        cumLevel: myRow.cumLevel,
        paragonLevel: myRow.paragonLevel,
        fame: myRow.fame,
        combatPower: myRow.combatPower,
        lifeMastery: myRow.lifeMastery,
        codexCollected: myRow.codexCollected,
        codexTotal: myRow.codexTotal,
        masteryTowerFloor: myRow.masteryTowerFloor,
        achievementScore: myRow.achievementScore ?? 0,
        achievementCompleted: myRow.achievementCompleted ?? 0,
        weekHighest: myRow.weekHighest,
        challengeHighest: myRow.challengeHighest,
        profileBorder:
          cosmeticByUser.get(myRow.userId)?.profileBorder ?? null,
        chatNameEffect:
          cosmeticByUser.get(myRow.userId)?.chatNameEffect ?? null,
      }
    : null;

  return Response.json({ list, me });
}
