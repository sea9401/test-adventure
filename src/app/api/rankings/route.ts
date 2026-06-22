import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getAdminEmailsList } from "@/lib/server/isAdmin";
import { kstWeekStartKey } from "@/adventure/tower/weeklyTypes";
import { pointsFromExp } from "@/lib/paragon";

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
  "battleCount",
  "towerWeek",
  "towerChallenge",
] as const;
type Metric = (typeof VALID_METRICS)[number];
const isMetric = (v: string): v is Metric =>
  (VALID_METRICS as readonly string[]).includes(v);

const LIST_LIMIT = 100;
// 메모리 캐시 TTL — 리더보드는 약간 stale 해도 무방. 매 요청마다 saves_kv 의
// adventure-log.v2 jsonb 를 jsonb_each 로 풀스캔(모든 유저 × 모든 몬스터 kills
// 합산)하던 핫경로를 30초 캐시로 막는다. 단일 EC2 라 in-process 캐시면 충분.
// 캐시 미스만 SQL — 같은 metric 의 동시 cold-miss 는 inFlight promise 로 dedup.
const CACHE_TTL_MS = 30_000;

type RankRow = {
  userId: string;
  name: string;
  level: number;
  /** 총 누적 레벨 = 모든 직군 cumLevel 합(환생/전직 누적, 리셋 안 됨). level 탭 정렬·표시. */
  cumLevel: number;
  /** 파라곤 레벨 = 적립 EXP 로 획득한 총 포인트(0~150). 만렙 미만은 0. level 탭 표시·정렬용. */
  paragonLevel: number;
  fame: number;
  battleCount: number;
  /** towerWeek 한정 — 이번 주 최고층. 다른 metric 에서는 0. */
  weekHighest: number;
  /** towerChallenge 한정 — 도전 모드 영구 최고층. 다른 metric 에서는 0. */
  challengeHighest: number;
  rank: number;
};

type CacheEntry = {
  rows: RankRow[];
  computedAt: number;
  inFlight?: Promise<RankRow[]>;
};

const cache: Map<Metric, CacheEntry> = new Map();

async function fetchRows(metric: Metric): Promise<RankRow[]> {
  if (metric === "towerWeek") return fetchTowerWeekRows();
  if (metric === "towerChallenge") return fetchTowerChallengeRows();
  // metric 은 isMetric 으로 검증된 닫힌 enum — sql 템플릿에 안전하게 합성.
  // level 탭 = "총 누적 레벨"(cum_level) 순. cumLevel 은 환생으로 리셋되지 않는 직군 누적 레벨이라
  // 차수 환생/전직 진행이 그대로 반영된다(현재 레벨은 차수 안에서 리셋되므로 랭킹 부적합).
  // 동률은 현재 레벨 → 갱신시각 순.
  const orderBy =
    metric === "level"
      ? sql`cum_level DESC, level DESC, updated_at ASC`
      : metric === "fame"
        ? sql`fame DESC, updated_at ASC`
        : sql`battle_count DESC, updated_at ASC`;

  // 닉네임은 users.game_name 우선, 없으면 character-profile.v2 의 name fallback.
  const result = await db.execute(sql`
    WITH stats AS (
      SELECT
        u.id AS user_id,
        COALESCE(u.game_name, p.value->>'name') AS name,
        COALESCE((c.value->>'level')::int, 1) AS level,
        COALESCE((c.value->>'fame')::bigint, 0) AS fame,
        -- 총 누적 레벨 — proficiency.v2 의 모든 직군 cumLevel 합(환생/전직 누적, 리셋 안 됨).
        -- prof 미기록(옛 세이브)이면 0 → 현재 레벨로 바닥 처리(GREATEST). 차수 진행분 반영.
        -- 정수 문자열만 캐스트(regex 가드) — 단 한 행이라도 비정수면 ::int 가 쿼리 전체를
        -- 터뜨리므로 방어. cumLevel 은 항상 음 아닌 정수(posInt)라 ^[0-9]+$ 로 충분.
        GREATEST(
          COALESCE((
            SELECT SUM((g.value->>'cumLevel')::int)
            FROM jsonb_each(pr.value->'groups') AS g
            WHERE (g.value->>'cumLevel') ~ '^[0-9]+$'
          ), 0),
          COALESCE((c.value->>'level')::int, 1)
        ) AS cum_level,
        -- 파라곤 적립 EXP. 큰 값(만렙 후 누적)이라 bigint. 포인트 환산은 JS(pointsFromExp).
        COALESCE((pg.value->>'paragonExp')::bigint, 0) AS paragon_exp,
        (
          COALESCE((
            SELECT SUM((m.value->>'kills')::bigint)
            FROM jsonb_each(l.value->'monsters') AS m
            WHERE (m.value->>'kills') IS NOT NULL
          ), 0)
          + COALESCE((l.value->>'battleLosses')::bigint, 0)
        ) AS battle_count,
        COALESCE(c.updated_at, u.created_at) AS updated_at
      FROM users u
      LEFT JOIN saves_kv c ON c.user_id = u.id AND c.key = 'character.v2'
      LEFT JOIN saves_kv l ON l.user_id = u.id AND l.key = 'adventure-log.v2'
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
    SELECT user_id, name, level, cum_level, paragon_exp, fame, battle_count, rank
    FROM ranked
    ORDER BY rank
  `);

  type DbRow = {
    user_id: string;
    name: string;
    level: number;
    cum_level: number;
    // node-postgres 는 bigint(int8) 를 문자열로 반환할 수 있어 number|string 모두 수용.
    paragon_exp: number | string;
    fame: number;
    battle_count: number;
    rank: number;
  };
  return (result.rows as unknown as DbRow[]).map((r) => ({
    userId: String(r.user_id),
    name: String(r.name),
    level: Number(r.level),
    cumLevel: Number(r.cum_level),
    paragonLevel: pointsFromExp(Number(r.paragon_exp)),
    fame: Number(r.fame),
    battleCount: Number(r.battle_count),
    weekHighest: 0,
    challengeHighest: 0,
    rank: Number(r.rank),
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
    SELECT user_id, name, level, fame, week_highest, rank
    FROM ranked
    ORDER BY rank
  `);
  type DbRow = {
    user_id: string;
    name: string;
    level: number;
    fame: number;
    week_highest: number;
    rank: number;
  };
  return (result.rows as unknown as DbRow[]).map((r) => ({
    userId: String(r.user_id),
    name: String(r.name),
    level: Number(r.level),
    cumLevel: 0, // 고탑 탭은 누적레벨 미사용.
    paragonLevel: 0, // 고탑(주간) 탭은 층(F.) 표시 — 파라곤 미사용.
    fame: Number(r.fame),
    battleCount: 0,
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
    SELECT user_id, name, level, fame, challenge_highest, rank
    FROM ranked
    ORDER BY rank
  `);
  type DbRow = {
    user_id: string;
    name: string;
    level: number;
    fame: number;
    challenge_highest: number;
    rank: number;
  };
  return (result.rows as unknown as DbRow[]).map((r) => ({
    userId: String(r.user_id),
    name: String(r.name),
    level: Number(r.level),
    cumLevel: 0, // 고탑 탭은 누적레벨 미사용.
    paragonLevel: 0, // 고탑(도전) 탭은 층(F.) 표시 — 파라곤 미사용.
    fame: Number(r.fame),
    battleCount: 0,
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

// GET /api/rankings?metric=level|fame|battleCount
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

  const list = rows.slice(0, LIST_LIMIT).map((r) => ({
    rank: r.rank,
    name: r.name,
    level: r.level,
    cumLevel: r.cumLevel,
    paragonLevel: r.paragonLevel,
    fame: r.fame,
    battleCount: r.battleCount,
    weekHighest: r.weekHighest,
    challengeHighest: r.challengeHighest,
    mine: r.userId === userId,
  }));

  const myRow = rows.find((r) => r.userId === userId);
  const me = myRow
    ? {
        rank: myRow.rank,
        name: myRow.name,
        level: myRow.level,
        cumLevel: myRow.cumLevel,
        paragonLevel: myRow.paragonLevel,
        fame: myRow.fame,
        battleCount: myRow.battleCount,
        weekHighest: myRow.weekHighest,
        challengeHighest: myRow.challengeHighest,
      }
    : null;

  return Response.json({ list, me });
}
