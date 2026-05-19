import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guildLodgeDonations,
  guildLodgeState,
  guildMembers,
  guilds,
  savesKv,
  users,
} from "@/db/schema";
import {
  LODGE_RANK_MAX,
  LODGE_SLOGAN_MAX,
  isValidDonationKind,
  nextRankThreshold,
  rankReady,
  type DonationKind,
  type LodgeContributor,
  type LodgeResponse,
} from "@/adventure/data/guildLodge";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";

// 회관 서버 라이브러리 — donate / upgradeRank / setSlogan / readLodge 4개 진입점.
// 라우트는 권한별 status 매핑과 JSON 직렬화만 담당하고 비즈니스 로직은 전부 이쪽.
// 봉납 row 가 source of truth, guild_lodge_state 캐시는 같은 트랜잭션에서 upsert.

export type LodgeErrorCode =
  | "guild_not_found"
  | "not_member"
  | "not_master"
  | "invalid_kind"
  | "invalid_amount"
  | "insufficient_stardust"
  | "insufficient_gold"
  | "max_rank"
  | "not_ready"
  | "slogan_too_long";

const ERROR_STATUS: Record<LodgeErrorCode, 400 | 403 | 404 | 409> = {
  guild_not_found: 404,
  not_member: 403,
  not_master: 403,
  invalid_kind: 400,
  invalid_amount: 400,
  insufficient_stardust: 400,
  insufficient_gold: 400,
  max_rank: 409,
  not_ready: 409,
  slogan_too_long: 400,
};

export type LodgeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: LodgeErrorCode; status: 400 | 403 | 404 | 409 };

function err(code: LodgeErrorCode): LodgeResult<never> {
  return { ok: false, error: code, status: ERROR_STATUS[code] };
}

// KST 월요일 00:00 의 UTC 인스턴트 — guild_lodge_donations.created_at 비교용.
// data/ 의 kstWeekStartKey 는 YYYY-MM-DD 문자열을 돌려주는 반면 여기는 Date 가 필요.
function kstWeekStartUtc(now: Date = new Date()): Date {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const day = kstNow.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const kstMonday = new Date(kstNow);
  kstMonday.setUTCDate(kstNow.getUTCDate() - daysSinceMonday);
  kstMonday.setUTCHours(0, 0, 0, 0);
  return new Date(kstMonday.getTime() - KST_OFFSET_MS);
}

// 활성 길드 1행을 락. tombstone(disbandedAt!=NULL) 은 not_found 와 동일 취급.
async function lockActiveGuild(
  tx: DbExecutor,
  guildId: number,
): Promise<typeof guilds.$inferSelect | null> {
  const rows = await tx
    .select()
    .from(guilds)
    .where(and(eq(guilds.id, guildId), isNull(guilds.disbandedAt)))
    .for("update");
  return rows[0] ?? null;
}

async function isMember(
  tx: DbExecutor,
  guildId: number,
  userId: string,
): Promise<boolean> {
  const rows = await tx
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(
      and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)),
    )
    .limit(1);
  return rows.length > 0;
}

// 봉납자별 누계/주간 집계 — 같은 GROUP BY 를 두 번 호출하지 않도록
// CASE WHEN 으로 한 쿼리에 묶음. 멤버 이름은 users.gameName fallback.
async function readContributions(
  tx: DbExecutor,
  guildId: number,
  weekStart: Date,
): Promise<LodgeContributor[]> {
  const rows = await tx
    .select({
      userId: guildLodgeDonations.userId,
      totalStardust: sql<number>`COALESCE(SUM(CASE WHEN ${guildLodgeDonations.kind} = 'stardust' THEN ${guildLodgeDonations.amount} ELSE 0 END), 0)::int`,
      totalGold: sql<number>`COALESCE(SUM(CASE WHEN ${guildLodgeDonations.kind} = 'gold' THEN ${guildLodgeDonations.amount} ELSE 0 END), 0)::int`,
      weekStardust: sql<number>`COALESCE(SUM(CASE WHEN ${guildLodgeDonations.kind} = 'stardust' AND ${guildLodgeDonations.createdAt} >= ${weekStart} THEN ${guildLodgeDonations.amount} ELSE 0 END), 0)::int`,
      weekGold: sql<number>`COALESCE(SUM(CASE WHEN ${guildLodgeDonations.kind} = 'gold' AND ${guildLodgeDonations.createdAt} >= ${weekStart} THEN ${guildLodgeDonations.amount} ELSE 0 END), 0)::int`,
    })
    .from(guildLodgeDonations)
    .where(eq(guildLodgeDonations.guildId, guildId))
    .groupBy(guildLodgeDonations.userId);

  if (rows.length === 0) return [];
  const nameRows = await tx
    .select({ id: users.id, gameName: users.gameName })
    .from(users)
    .where(
      inArray(
        users.id,
        rows.map((r) => r.userId),
      ),
    );
  const nameById = new Map(nameRows.map((r) => [r.id, r.gameName] as const));
  // 누계 별빛 큰 순 — 회관 카드 표시 순서. 동률은 총 골드 큰 순.
  return rows
    .map((r) => ({
      userId: r.userId,
      name: nameById.get(r.userId) ?? "익명",
      weekStardust: r.weekStardust,
      weekGold: r.weekGold,
      totalStardust: r.totalStardust,
      totalGold: r.totalGold,
    }))
    .sort((a, b) =>
      b.totalStardust !== a.totalStardust
        ? b.totalStardust - a.totalStardust
        : b.totalGold - a.totalGold,
    );
}

export async function readLodge(
  guildId: number,
  userId: string,
): Promise<LodgeResult<LodgeResponse>> {
  return db.transaction(async (tx) => {
    const guild = await lockActiveGuild(tx, guildId);
    if (!guild) return err("guild_not_found");
    if (!(await isMember(tx, guildId, userId))) return err("not_member");

    const stateRow = (
      await tx
        .select()
        .from(guildLodgeState)
        .where(eq(guildLodgeState.guildId, guildId))
        .limit(1)
    )[0];

    const stardustTotal = stateRow?.stardustTotal ?? 0;
    const goldTotal = stateRow?.goldTotal ?? 0;
    const lastDonationAt = stateRow?.lastDonationAt ?? null;

    const weekStart = kstWeekStartUtc();
    const contributions = await readContributions(tx, guildId, weekStart);
    const mine = contributions.find((c) => c.userId === userId);

    const next = nextRankThreshold(guild.lodgeRank);
    return {
      ok: true as const,
      data: {
        rank: guild.lodgeRank,
        slogan: guild.lodgeSlogan ?? null,
        stardustTotal,
        goldTotal,
        lastDonationAt: lastDonationAt
          ? lastDonationAt.toISOString()
          : null,
        nextRank: next
          ? {
              rank: next.rank,
              stardustReq: next.stardust,
              goldReq: next.gold,
              ready: rankReady({ stardustTotal, goldTotal }, guild.lodgeRank),
            }
          : null,
        myDonations: {
          weekStardust: mine?.weekStardust ?? 0,
          weekGold: mine?.weekGold ?? 0,
          totalStardust: mine?.totalStardust ?? 0,
          totalGold: mine?.totalGold ?? 0,
        },
        contributions,
      } satisfies LodgeResponse,
    };
  });
}

// 캐릭터 잔고에서 별빛/골드 차감 — character.v2 (gold) + inventory.v2 (materials.stardust).
// saves_kv 두 키를 같은 트랜잭션에서 잠근 뒤 mutate. version 은 upsertSave 가 +1.
async function debitDonation(
  tx: DbExecutor,
  userId: string,
  kind: DonationKind,
  amount: number,
): Promise<LodgeErrorCode | null> {
  if (kind === "gold") {
    const charRow = (
      await tx
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
        .for("update")
        .limit(1)
    )[0];
    const char = (charRow?.value ?? {}) as Record<string, unknown>;
    const gold = typeof char.gold === "number" ? char.gold : 0;
    if (gold < amount) return "insufficient_gold";
    await upsertSave(tx, userId, "character.v2", { ...char, gold: gold - amount });
    return null;
  }
  const invRow = (
    await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "inventory.v2")))
      .for("update")
      .limit(1)
  )[0];
  const inv = (invRow?.value ?? {}) as Record<string, unknown>;
  const mats =
    (inv.materials as Record<string, number> | undefined) ?? {};
  const have = mats.stardust ?? 0;
  if (have < amount) return "insufficient_stardust";
  const nextMats = { ...mats, stardust: have - amount };
  await upsertSave(tx, userId, "inventory.v2", { ...inv, materials: nextMats });
  return null;
}

// rank=0 회관의 첫 봉납이면 자동으로 ★1 건립 — 마스터 trigger 대신 누구든 첫 봉납으로.
// 자연스러운 게이트라 별도 [건립] 버튼 X. (멤버 봉납이 마스터 봉납보다 빨라도 건립된다.)
async function donateInternal(
  tx: DbExecutor,
  guild: typeof guilds.$inferSelect,
  userId: string,
  kind: DonationKind,
  amount: number,
): Promise<LodgeResult<LodgeResponse>> {
  const debitErr = await debitDonation(tx, userId, kind, amount);
  if (debitErr) return err(debitErr);

  await tx
    .insert(guildLodgeDonations)
    .values({ guildId: guild.id, userId, kind, amount });

  await tx
    .insert(guildLodgeState)
    .values({
      guildId: guild.id,
      stardustTotal: kind === "stardust" ? amount : 0,
      goldTotal: kind === "gold" ? amount : 0,
      lastDonationAt: new Date(),
    })
    .onConflictDoUpdate({
      target: guildLodgeState.guildId,
      set: {
        stardustTotal:
          kind === "stardust"
            ? sql`${guildLodgeState.stardustTotal} + ${amount}`
            : guildLodgeState.stardustTotal,
        goldTotal:
          kind === "gold"
            ? sql`${guildLodgeState.goldTotal} + ${amount}`
            : guildLodgeState.goldTotal,
        lastDonationAt: new Date(),
      },
    });

  if (guild.lodgeRank === 0) {
    await tx
      .update(guilds)
      .set({ lodgeRank: 1 })
      .where(eq(guilds.id, guild.id));
  }

  return readLodge(guild.id, userId);
}

// 봉납 입력 검증 — pure. 라우트 진입 직후 호출 + 라이브러리도 한 번 더 보호.
// 상한 1e9 는 정수 overflow 가드 (별빛/골드 모두 32bit int 컬럼이라 SUM 오버플로우 방지).
export function validateDonationInput(
  kind: unknown,
  amount: unknown,
):
  | { ok: true; kind: DonationKind; amount: number }
  | { ok: false; error: "invalid_kind" | "invalid_amount" } {
  if (!isValidDonationKind(kind)) return { ok: false, error: "invalid_kind" };
  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > 1_000_000_000
  ) {
    return { ok: false, error: "invalid_amount" };
  }
  return { ok: true, kind, amount };
}

export async function donate(
  guildId: number,
  userId: string,
  kind: unknown,
  amount: unknown,
): Promise<LodgeResult<LodgeResponse>> {
  const validated = validateDonationInput(kind, amount);
  if (!validated.ok) return err(validated.error);
  const { kind: dk, amount: amt } = validated;
  return db.transaction(async (tx) => {
    const guild = await lockActiveGuild(tx, guildId);
    if (!guild) return err("guild_not_found");
    if (!(await isMember(tx, guildId, userId))) return err("not_member");
    return donateInternal(tx, guild, userId, dk, amt);
  });
}

export async function upgradeRank(
  guildId: number,
  userId: string,
): Promise<LodgeResult<{ rank: number }>> {
  return db.transaction(async (tx) => {
    const guild = await lockActiveGuild(tx, guildId);
    if (!guild) return err("guild_not_found");
    if (guild.masterId !== userId) return err("not_master");
    if (guild.lodgeRank >= LODGE_RANK_MAX) return err("max_rank");

    // 상태 캐시를 잠그고 임계 재검증 — 봉납 race 와 동시 진행돼도 일관성 유지.
    const stateRow = (
      await tx
        .select()
        .from(guildLodgeState)
        .where(eq(guildLodgeState.guildId, guildId))
        .for("update")
        .limit(1)
    )[0];
    const snapshot = {
      stardustTotal: stateRow?.stardustTotal ?? 0,
      goldTotal: stateRow?.goldTotal ?? 0,
    };
    if (!rankReady(snapshot, guild.lodgeRank)) return err("not_ready");

    const nextRank = guild.lodgeRank + 1;
    await tx
      .update(guilds)
      .set({ lodgeRank: nextRank })
      .where(eq(guilds.id, guildId));
    return { ok: true as const, data: { rank: nextRank } };
  });
}

// 슬로건 정규화 — trim, 길이 검증, 빈 문자열 → NULL.
// 라우트 PATCH 와 동일한 의미를 클라가 미리 점검할 수 있도록 pure 분리.
export function sanitizeSlogan(
  raw: string,
):
  | { ok: true; slogan: string | null }
  | { ok: false; error: "slogan_too_long" } {
  const trimmed = raw.trim();
  if (trimmed.length > LODGE_SLOGAN_MAX) {
    return { ok: false, error: "slogan_too_long" };
  }
  return { ok: true, slogan: trimmed.length === 0 ? null : trimmed };
}

export async function setSlogan(
  guildId: number,
  userId: string,
  rawSlogan: string,
): Promise<LodgeResult<{ slogan: string | null }>> {
  const sanitized = sanitizeSlogan(rawSlogan);
  if (!sanitized.ok) return err(sanitized.error);
  const next = sanitized.slogan;

  return db.transaction(async (tx) => {
    const guild = await lockActiveGuild(tx, guildId);
    if (!guild) return err("guild_not_found");
    if (guild.masterId !== userId) return err("not_master");
    await tx
      .update(guilds)
      .set({ lodgeSlogan: next })
      .where(eq(guilds.id, guildId));
    return { ok: true as const, data: { slogan: next } };
  });
}

// 마지막 봉납 시각 정렬 (헬퍼 — 클라가 안 쓰지만 admin 등 미래용).
export async function recentDonations(
  guildId: number,
  limit = 20,
): Promise<
  Array<{
    userId: string;
    kind: DonationKind;
    amount: number;
    createdAt: string;
  }>
> {
  const rows = await db
    .select()
    .from(guildLodgeDonations)
    .where(eq(guildLodgeDonations.guildId, guildId))
    .orderBy(desc(guildLodgeDonations.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    userId: r.userId,
    kind: r.kind as DonationKind,
    amount: r.amount,
    createdAt: r.createdAt.toISOString(),
  }));
}

// 노출하지 않는 헬퍼 — 테스트에서 임포트해 KST 경계 검증.
export const __testing = {
  kstWeekStartUtc,
  ERROR_STATUS,
};
