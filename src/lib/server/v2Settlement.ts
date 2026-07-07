import { and, eq, sql } from "drizzle-orm";
import type { db as dbType } from "@/db";
import {
  guildSettlementBuildingLevels,
  outpostOccupations,
  outpostVillages,
  tileSettlements,
  userSettlementResources,
  v2GuildResources,
} from "@/db/schema";
import { tileOutpostId } from "@/adventure/data/v2/tileWarfare";
import { getGuildId } from "./v2EnsureSoloGuild";
import { isGuildMasterOrManager } from "./guildAdmin";
import {
  lockGuildResources,
  upsertGuildResources,
} from "./v2GuildResources";
import { lockSaveForUpdate, upsertSave } from "./savesKv";
import { spendGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  VILLAGE_TIERS,
  PRODUCTION_KINDS,
  INITIAL_UNLOCKED_SLOTS,
  MAX_SLOTS_BY_TIER,
  clampUnlockedSlots,
  isSettlementBuildingId,
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
  settlementBuildingSlot,
  type SettlementBuildingId,
  type VillageTier,
  type ProductionJob,
  type ProductionKind,
  type SettlementBuildings,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

// ── 마을(outpost_villages) 영속 ──────────────────────────────────────────
export type VillageRow = {
  outpostId: string;
  /** 길드 마을이면 길드 id, 솔로(무길드) 타일 정착지면 null. ownerUserId 와 정확히 하나만 set. */
  guildId: number | null;
  /** 솔로(무길드) 타일 정착지 소유자. 길드 마을이면 null. */
  ownerUserId: string | null;
  tier: VillageTier;
  name: string | null;
  /** [레거시] 옛 한-마을-한-종류 특화. 신규 마을은 null — 종류는 칸별 slotKinds 가 결정. */
  productionKind: ProductionKind | null;
  /** 해금된 칸 수 — [0, MAX_SLOTS_BY_TIER]. 길드 골드로 한 칸씩 해금, 단계 업그레이드로 판 확장. */
  unlockedSlots: number;
  /** 칸 인덱스 → 생산 종류(해금 시 선택, 영구). 슬롯 i 는 slotKinds[i] 만 생산. */
  slotKinds: Record<number, ProductionKind>;
  /** 건축물 슬롯 인덱스 → 건축물 id. */
  buildings: SettlementBuildings;
  /** 슬롯(문자열 인덱스) → 진행 중 작업. 빈 슬롯은 키 없음. */
  jobs: Record<string, ProductionJob>;
};

function parseTier(v: unknown): VillageTier {
  return (VILLAGE_TIERS as string[]).includes(v as string)
    ? (v as VillageTier)
    : "village";
}

function parseProductionKind(v: unknown): ProductionKind | null {
  return typeof v === "string" && (PRODUCTION_KINDS as string[]).includes(v)
    ? (v as ProductionKind)
    : null;
}

function parseJobs(v: unknown): Record<string, ProductionJob> {
  if (typeof v !== "object" || v === null) return {};
  const out: Record<string, ProductionJob> = {};
  for (const [slot, raw] of Object.entries(v as Record<string, unknown>)) {
    // 슬롯 키 = 음이 아닌 정수 문자열만(손상 jsonb 의 범위 밖/음수 키 차단).
    const slotNum = Number(slot);
    if (!Number.isInteger(slotNum) || slotNum < 0 || String(slotNum) !== slot) {
      continue;
    }
    if (typeof raw !== "object" || raw === null) continue;
    const j = raw as Partial<ProductionJob>;
    if (
      typeof j.kind === "string" &&
      (PRODUCTION_KINDS as string[]).includes(j.kind) &&
      typeof j.startedAt === "number" &&
      Number.isFinite(j.startedAt) &&
      j.startedAt >= 0 // 음수 startedAt(즉시 수확 익스플로잇) 차단.
    ) {
      out[slot] = { kind: j.kind as ProductionKind, startedAt: j.startedAt };
    }
  }
  return out;
}

// 해금 칸 수 — 저장값을 단계 판 범위로 보정. 진행 중 작업이 있는 칸은 절대 잠그지 않는다
//   (옛 데이터/판 축소가 활성 슬롯을 숨겨 수확 불가가 되는 사고 방지), 단 판 최대 안에서.
function parseUnlockedSlots(
  v: unknown,
  tier: VillageTier,
  jobs: Record<string, ProductionJob>,
): number {
  let n = clampUnlockedSlots(
    tier,
    typeof v === "number" ? v : INITIAL_UNLOCKED_SLOTS,
  );
  for (const slot of Object.keys(jobs)) {
    const idx = Number(slot);
    if (Number.isInteger(idx) && idx + 1 > n) {
      n = Math.min(MAX_SLOTS_BY_TIER[tier], idx + 1);
    }
  }
  return n;
}

// 칸별 생산 종류 파싱 + 레거시 소급. slotKinds 가 비어 있고 옛 productionKind 가 있으면
//   해금된 칸 전부를 그 종류로 채운다(한-마을-한-종류 옛 마을 호환).
function parseSlotKinds(
  v: unknown,
  legacyKind: ProductionKind | null,
  unlockedSlots: number,
): Record<number, ProductionKind> {
  const out: Record<number, ProductionKind> = {};
  if (typeof v === "object" && v !== null) {
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
      const idx = Number(k);
      if (
        Number.isInteger(idx) &&
        idx >= 0 &&
        String(idx) === k &&
        typeof raw === "string" &&
        (PRODUCTION_KINDS as string[]).includes(raw)
      ) {
        out[idx] = raw as ProductionKind;
      }
    }
  }
  if (Object.keys(out).length === 0 && legacyKind != null) {
    for (let i = 0; i < unlockedSlots; i++) out[i] = legacyKind;
  }
  return out;
}

function parseBuildings(
  v: unknown,
  unlockedSlots: number,
): SettlementBuildings {
  const out: SettlementBuildings = {};
  if (typeof v !== "object" || v === null) return out;
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0 || idx >= unlockedSlots || String(idx) !== k) {
      continue;
    }
    if (isSettlementBuildingId(raw)) {
      out[idx] = settlementBuildingSlot(raw, 1);
      continue;
    }
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      const obj = raw as Record<string, unknown>;
      if (isSettlementBuildingId(obj.id)) {
        out[idx] = settlementBuildingSlot(obj.id, obj.level);
      }
    }
  }
  return out;
}

// 점령 이관 정규화 — village row 가 현 소유 길드와 다르면(빼앗긴 거점) 현 길드 소유로 갱신하고
//   진행 중 작업을 비운다(이전 길드의 작물은 승계 안 함). tier/name(점령한 구조물)은 유지.
//   → GET 목록의 "내 마을" 귀속·수확 재화 귀속이 항상 현 소유자 기준이 되도록.
export function normalizeVillageOwner(
  village: VillageRow,
  guildId: number,
): VillageRow {
  if (village.guildId === guildId) return village;
  return { ...village, guildId, jobs: {} };
}

// 마을 lock + read (SELECT FOR UPDATE). 없으면 null.
export async function lockVillage(
  tx: Tx,
  outpostId: string,
): Promise<VillageRow | null> {
  const row = (
    await tx
      .select()
      .from(outpostVillages)
      .where(eq(outpostVillages.outpostId, outpostId))
      .for("update")
      .limit(1)
  )[0];
  if (!row) return null;
  const tier = parseTier(row.tier);
  const jobs = parseJobs(row.jobs);
  const productionKind = parseProductionKind(row.productionKind);
  const unlockedSlots = parseUnlockedSlots(row.unlockedSlots, tier, jobs);
  return {
    outpostId: row.outpostId,
    guildId: row.guildId,
    ownerUserId: row.ownerUserId ?? null,
    tier,
    name: row.name ?? null,
    productionKind,
    unlockedSlots,
    slotKinds: parseSlotKinds(row.slotKinds, productionKind, unlockedSlots),
    buildings: parseBuildings(row.buildings, unlockedSlots),
    jobs,
  };
}

// 단건 읽기(lock 없이) — UI/GET 용(특정 거점/타일 마을 1개).
export async function readVillage(
  tx: Tx,
  outpostId: string,
): Promise<VillageRow | null> {
  const row = (
    await tx
      .select()
      .from(outpostVillages)
      .where(eq(outpostVillages.outpostId, outpostId))
      .limit(1)
  )[0];
  if (!row) return null;
  const tier = parseTier(row.tier);
  const jobs = parseJobs(row.jobs);
  const productionKind = parseProductionKind(row.productionKind);
  const unlockedSlots = parseUnlockedSlots(row.unlockedSlots, tier, jobs);
  return {
    outpostId: row.outpostId,
    guildId: row.guildId,
    ownerUserId: row.ownerUserId ?? null,
    tier,
    name: row.name ?? null,
    productionKind,
    unlockedSlots,
    slotKinds: parseSlotKinds(row.slotKinds, productionKind, unlockedSlots),
    buildings: parseBuildings(row.buildings, unlockedSlots),
    jobs,
  };
}

// read only (lock 없이) — UI 목록용.
export async function readVillagesOfGuild(
  tx: Tx,
  guildId: number,
): Promise<VillageRow[]> {
  const rows = await tx
    .select()
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  return rows.map((row) => {
    const tier = parseTier(row.tier);
    const jobs = parseJobs(row.jobs);
    const productionKind = parseProductionKind(row.productionKind);
    const unlockedSlots = parseUnlockedSlots(row.unlockedSlots, tier, jobs);
    return {
      outpostId: row.outpostId,
      guildId: row.guildId,
      ownerUserId: row.ownerUserId ?? null,
      tier,
      name: row.name ?? null,
      productionKind,
      unlockedSlots,
      slotKinds: parseSlotKinds(row.slotKinds, productionKind, unlockedSlots),
      buildings: parseBuildings(row.buildings, unlockedSlots),
      jobs,
    };
  });
}

export async function upsertVillage(tx: Tx, row: VillageRow): Promise<void> {
  await tx
    .insert(outpostVillages)
    .values({
      outpostId: row.outpostId,
      guildId: row.guildId,
      ownerUserId: row.ownerUserId,
      tier: row.tier,
      name: row.name,
      productionKind: row.productionKind,
      unlockedSlots: row.unlockedSlots,
      slotKinds: row.slotKinds,
      buildings: row.buildings,
      jobs: row.jobs,
    })
    .onConflictDoUpdate({
      target: outpostVillages.outpostId,
      set: {
        guildId: row.guildId,
        ownerUserId: row.ownerUserId,
        tier: row.tier,
        name: row.name,
        productionKind: row.productionKind,
        unlockedSlots: row.unlockedSlots,
        slotKinds: row.slotKinds,
        buildings: row.buildings,
        jobs: row.jobs,
      },
    });
}

// ── 길드 건축물 레벨 보관 ───────────────────────────────────────────────────
// 슬롯 폐기/전쟁 점령으로 건물이 사라질 때 최고 레벨을 길드 단위로 저장한다.
// 같은 길드가 같은 건물을 다시 배치하면 이 레벨로 복구한다. 솔로 정착지는 보관 대상이 아니다.
export async function rememberGuildSettlementBuildingLevel(
  tx: Tx,
  guildId: number,
  buildingId: SettlementBuildingId,
  level: number,
): Promise<void> {
  const safeLevel = settlementBuildingLevelOf({ level });
  await tx
    .insert(guildSettlementBuildingLevels)
    .values({ guildId, buildingId, level: safeLevel })
    .onConflictDoUpdate({
      target: [
        guildSettlementBuildingLevels.guildId,
        guildSettlementBuildingLevels.buildingId,
      ],
      set: {
        level: sql`greatest(${guildSettlementBuildingLevels.level}, ${safeLevel})`,
        updatedAt: new Date(),
      },
    });
}

export async function rememberGuildSettlementBuildings(
  tx: Tx,
  village: VillageRow,
): Promise<void> {
  if (village.guildId == null) return;
  for (const raw of Object.values(village.buildings)) {
    const buildingId = settlementBuildingIdOf(raw);
    if (!buildingId) continue;
    await rememberGuildSettlementBuildingLevel(
      tx,
      village.guildId,
      buildingId,
      settlementBuildingLevelOf(raw),
    );
  }
}

export async function readGuildSettlementBuildingLevel(
  tx: Tx,
  guildId: number,
  buildingId: SettlementBuildingId,
): Promise<number | null> {
  const row = (
    await tx
      .select({ level: guildSettlementBuildingLevels.level })
      .from(guildSettlementBuildingLevels)
      .where(
        and(
          eq(guildSettlementBuildingLevels.guildId, guildId),
          eq(guildSettlementBuildingLevels.buildingId, buildingId),
        ),
      )
      .limit(1)
  )[0];
  return row ? settlementBuildingLevelOf({ level: row.level }) : null;
}

// ── 길드 정착지 재화 풀(v2_guild_resources.settlement jsonb) ───────────────
// 🔑 gold 와 같은 row 지만 컬럼이 달라 서로 안 건드림(각 upsert 가 자기 컬럼만 set).
function parseResources(v: unknown): SettlementResources {
  if (typeof v !== "object" || v === null) return {};
  const out: SettlementResources = {};
  for (const k of PRODUCTION_KINDS) {
    const n = (v as Record<string, unknown>)[k];
    if (typeof n === "number" && Number.isFinite(n) && n > 0) {
      out[k] = Math.floor(n);
    }
  }
  return out;
}

export async function lockGuildSettlement(
  tx: Tx,
  guildId: number,
): Promise<SettlementResources> {
  // row 보장(없으면 빈 row) — gold default 0·settlement default {}.
  await tx
    .insert(v2GuildResources)
    .values({ guildId })
    .onConflictDoNothing();
  const row = (
    await tx
      .select({ settlement: v2GuildResources.settlement })
      .from(v2GuildResources)
      .where(eq(v2GuildResources.guildId, guildId))
      .for("update")
      .limit(1)
  )[0];
  return parseResources(row?.settlement);
}

export async function upsertGuildSettlement(
  tx: Tx,
  guildId: number,
  resources: SettlementResources,
): Promise<void> {
  const safe = parseResources(resources);
  await tx
    .insert(v2GuildResources)
    .values({ guildId, settlement: safe })
    .onConflictDoUpdate({
      target: v2GuildResources.guildId,
      set: { settlement: safe, updatedAt: new Date() },
    });
}

// read only (lock 없이) — UI/GET 용.
export async function readGuildSettlement(
  tx: Tx,
  guildId: number,
): Promise<SettlementResources> {
  const row = (
    await tx
      .select({ settlement: v2GuildResources.settlement })
      .from(v2GuildResources)
      .where(eq(v2GuildResources.guildId, guildId))
      .limit(1)
  )[0];
  return parseResources(row?.settlement);
}

// ── 솔로(무길드) 정착지 재화 풀 — 길드 풀 헬퍼의 1인 미러(user_settlement_resources) ──────
export async function lockSoloSettlement(
  tx: Tx,
  userId: string,
): Promise<SettlementResources> {
  await tx
    .insert(userSettlementResources)
    .values({ userId })
    .onConflictDoNothing();
  const row = (
    await tx
      .select({ settlement: userSettlementResources.settlement })
      .from(userSettlementResources)
      .where(eq(userSettlementResources.userId, userId))
      .for("update")
      .limit(1)
  )[0];
  return parseResources(row?.settlement);
}

export async function upsertSoloSettlement(
  tx: Tx,
  userId: string,
  resources: SettlementResources,
): Promise<void> {
  const safe = parseResources(resources);
  await tx
    .insert(userSettlementResources)
    .values({ userId, settlement: safe })
    .onConflictDoUpdate({
      target: userSettlementResources.userId,
      set: { settlement: safe, updatedAt: new Date() },
    });
}

export async function readSoloSettlement(
  tx: Tx,
  userId: string,
): Promise<SettlementResources> {
  const row = (
    await tx
      .select({ settlement: userSettlementResources.settlement })
      .from(userSettlementResources)
      .where(eq(userSettlementResources.userId, userId))
      .limit(1)
  )[0];
  return parseResources(row?.settlement);
}

// ── 정착지 소유 추상화 — 길드(점령행) | 솔로(무길드 founder). 자원 라우팅을 한 곳으로. ──────
export type SettlementOwner =
  | { kind: "guild"; guildId: number }
  | { kind: "solo"; userId: string };

// 자원 풀 lock/upsert/read 를 소유 종류에 맞게 분기(길드 풀 vs 솔로 풀).
export function lockSettlementResources(
  tx: Tx,
  owner: SettlementOwner,
): Promise<SettlementResources> {
  return owner.kind === "guild"
    ? lockGuildSettlement(tx, owner.guildId)
    : lockSoloSettlement(tx, owner.userId);
}
export function upsertSettlementResources(
  tx: Tx,
  owner: SettlementOwner,
  resources: SettlementResources,
): Promise<void> {
  return owner.kind === "guild"
    ? upsertGuildSettlement(tx, owner.guildId, resources)
    : upsertSoloSettlement(tx, owner.userId, resources);
}
export function readSettlementResources(
  tx: Tx,
  owner: SettlementOwner,
): Promise<SettlementResources> {
  return owner.kind === "guild"
    ? readGuildSettlement(tx, owner.guildId)
    : readSoloSettlement(tx, owner.userId);
}

// 타일 정착지(col,row) 소유 해석 — 점령행(occupiedByGuildId) 있으면 길드, 없으면 솔로(founder).
//   미존재(정착지 없음)면 null. tile 점령행은 길드 founder 만 생성(P1)이라 점령행을 우선 본다.
export async function resolveTileSettlementOwner(
  tx: Tx,
  col: number,
  row: number,
): Promise<SettlementOwner | null> {
  const id = tileOutpostId(col, row);
  const [occ] = await tx
    .select({ g: outpostOccupations.occupiedByGuildId })
    .from(outpostOccupations)
    .where(eq(outpostOccupations.outpostId, id))
    .limit(1);
  if (occ?.g != null) return { kind: "guild", guildId: occ.g };
  const [ts] = await tx
    .select({ userId: tileSettlements.userId })
    .from(tileSettlements)
    .where(and(eq(tileSettlements.col, col), eq(tileSettlements.row, row)))
    .limit(1);
  return ts ? { kind: "solo", userId: ts.userId } : null;
}

// village 행의 소유 → SettlementOwner. guildId 있으면 길드, 없으면 ownerUserId(솔로).
export function villageOwner(row: VillageRow): SettlementOwner {
  if (row.guildId != null) return { kind: "guild", guildId: row.guildId };
  if (row.ownerUserId != null) return { kind: "solo", userId: row.ownerUserId };
  throw new Error("village_no_owner");
}

// village 행을 현 소유(owner)로 정규화 — 소유가 바뀐 경우(점령 이관 등) 갱신 + 작업 비움.
//   소유 동일이면 그대로(no-op). 길드↔솔로 표현 일치까지 확인.
export function normalizeVillageToOwner(
  village: VillageRow,
  owner: SettlementOwner,
): VillageRow {
  const same =
    owner.kind === "guild"
      ? village.guildId === owner.guildId && village.ownerUserId == null
      : village.ownerUserId === owner.userId && village.guildId == null;
  if (same) return village;
  return owner.kind === "guild"
    ? { ...village, guildId: owner.guildId, ownerUserId: null, jobs: {} }
    : { ...village, ownerUserId: owner.userId, guildId: null, jobs: {} };
}

// 소유별 골드 — 길드는 길드 금고 풀, 솔로는 플레이어 본인 골드(+은행, spendGold). lock 후 spend.
export type OwnerGoldHandle = {
  available: number;
  spend: (amount: number) => Promise<void>;
};
export async function lockOwnerGold(
  tx: Tx,
  owner: SettlementOwner,
): Promise<OwnerGoldHandle> {
  if (owner.kind === "guild") {
    const res = await lockGuildResources(tx, owner.guildId);
    return {
      available: res.gold,
      spend: async (amount) => {
        await upsertGuildResources(tx, owner.guildId, {
          gold: res.gold - amount,
        });
      },
    };
  }
  const save = await lockSaveForUpdate<Record<string, unknown>>(
    tx,
    owner.userId,
    "character.v2",
    {},
  );
  const gold = Math.max(0, Math.floor(Number(save.gold) || 0));
  const banked = Math.max(0, Math.floor(Number(save.bankedGold) || 0));
  return {
    available: gold + banked,
    spend: async (amount) => {
      const r = spendGold(gold, banked, amount);
      await upsertSave(tx, owner.userId, "character.v2", {
        ...save,
        gold: r.gold,
        bankedGold: r.bankedGold,
      });
    },
  };
}

// tile_settlements.tier 동기화 — 마을 건설(→village)·승격(→city/metropolis) 시 지도/메타 표시 일치.
export async function syncTileSettlementTier(
  tx: Tx,
  col: number,
  row: number,
  tier: VillageTier,
): Promise<void> {
  await tx
    .update(tileSettlements)
    .set({ tier })
    .where(and(eq(tileSettlements.col, col), eq(tileSettlements.row, row)));
}

// tile_settlements.name 읽기 — 마을 건설이 개척(found) 때 정한 이름을 그대로 재사용한다(건설
//   단계에서 이름을 다시 받지 않음). found 가 항상 이름을 넣으므로 보통 비어있지 않다.
export async function readTileSettlementName(
  tx: Tx,
  col: number,
  row: number,
): Promise<string | null> {
  const [ts] = await tx
    .select({ name: tileSettlements.name })
    .from(tileSettlements)
    .where(and(eq(tileSettlements.col, col), eq(tileSettlements.row, row)))
    .limit(1);
  return ts?.name ?? null;
}

// 타일 정착지 관리 권한 해석(쓰기 경로) — 점령행/정착지 행을 FOR UPDATE 로 직렬화 + 권한 판정.
//   영토=길드 소유 모델로 고정한다. 솔로 정착지 성장은 폐기했으므로 guild 점령행이 없으면 관리 불가.
//   반환 owner 로 자원/골드 풀이 갈린다. flag(V2_TILE_PRODUCTION) 게이트는 호출부(라우트)에서.
export async function resolveTileVillageManageOwner(
  tx: Tx,
  userId: string,
  col: number,
  row: number,
  requireAdmin: boolean,
): Promise<
  | { ok: true; owner: SettlementOwner }
  | { ok: false; status: number; error: string }
> {
  const id = tileOutpostId(col, row);
  const [occ] = await tx
    .select({ g: outpostOccupations.occupiedByGuildId })
    .from(outpostOccupations)
    .where(eq(outpostOccupations.outpostId, id))
    .for("update")
    .limit(1);
  if (occ?.g != null) {
    const guildId = occ.g;
    const myGuild = await getGuildId(tx, userId);
    if (myGuild !== guildId) {
      return { ok: false, status: 403, error: "not_owner" };
    }
    if (requireAdmin && !(await isGuildMasterOrManager(tx, guildId, userId))) {
      return { ok: false, status: 403, error: "not_authorized" };
    }
    return { ok: true, owner: { kind: "guild", guildId } };
  }
  const [ts] = await tx
    .select({ userId: tileSettlements.userId })
    .from(tileSettlements)
    .where(and(eq(tileSettlements.col, col), eq(tileSettlements.row, row)))
    .for("update")
    .limit(1);
  if (!ts) return { ok: false, status: 404, error: "no_settlement" };
  return { ok: false, status: 403, error: "need_guild_territory" };
}

// ── 소유 가드 ── 유저의 길드가 이 거점을 점령 중이면 guildId, 아니면 null. ────────────
// 🔑 점령 행을 FOR UPDATE 배타락 — 마을 변경(build/produce/harvest/upgrade)이 한 거점에서
//   직렬화되도록(특히 최초 건설 시 village row 가 아직 없어 lockVillage 가 못 잡는 동시성 race
//   차단). 락 순서: 점령행 → 마을 → 길드재화(전 라우트 공통). 점령된 거점만 row 존재(미점령=null).
export async function guildOwningOutpost(
  tx: Tx,
  userId: string,
  outpostId: string,
): Promise<number | null> {
  const guildId = await getGuildId(tx, userId);
  if (guildId == null) return null;
  const occ = (
    await tx
      .select({ g: outpostOccupations.occupiedByGuildId })
      .from(outpostOccupations)
      .where(eq(outpostOccupations.outpostId, outpostId))
      .for("update")
      .limit(1)
  )[0];
  return occ?.g != null && occ.g === guildId ? guildId : null;
}

// 지형 특성 — 거점 데이터(outposts.ts)에 큐레이션. 라우트 import 편의로 여기서 re-export.
export { terrainTraitOf } from "@/adventure/data/v2/outposts";
