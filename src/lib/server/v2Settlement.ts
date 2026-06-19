import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import {
  outpostOccupations,
  outpostVillages,
  v2GuildResources,
} from "@/db/schema";
import { getGuildId } from "./v2EnsureSoloGuild";
import {
  VILLAGE_TIERS,
  PRODUCTION_KINDS,
  INITIAL_UNLOCKED_SLOTS,
  MAX_SLOTS_BY_TIER,
  clampUnlockedSlots,
  type VillageTier,
  type ProductionJob,
  type ProductionKind,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

// ── 마을(outpost_villages) 영속 ──────────────────────────────────────────
export type VillageRow = {
  outpostId: string;
  guildId: number;
  tier: VillageTier;
  name: string | null;
  /** [레거시] 옛 한-마을-한-종류 특화. 신규 마을은 null — 종류는 칸별 slotKinds 가 결정. */
  productionKind: ProductionKind | null;
  /** 해금된 칸 수 — [0, MAX_SLOTS_BY_TIER]. 길드 골드로 한 칸씩 해금, 단계 업그레이드로 판 확장. */
  unlockedSlots: number;
  /** 칸 인덱스 → 생산 종류(해금 시 선택, 영구). 슬롯 i 는 slotKinds[i] 만 생산. */
  slotKinds: Record<number, ProductionKind>;
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
    tier,
    name: row.name ?? null,
    productionKind,
    unlockedSlots,
    slotKinds: parseSlotKinds(row.slotKinds, productionKind, unlockedSlots),
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
      tier,
      name: row.name ?? null,
      productionKind,
      unlockedSlots,
      slotKinds: parseSlotKinds(row.slotKinds, productionKind, unlockedSlots),
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
      tier: row.tier,
      name: row.name,
      productionKind: row.productionKind,
      unlockedSlots: row.unlockedSlots,
      slotKinds: row.slotKinds,
      jobs: row.jobs,
    })
    .onConflictDoUpdate({
      target: outpostVillages.outpostId,
      set: {
        guildId: row.guildId,
        tier: row.tier,
        name: row.name,
        productionKind: row.productionKind,
        unlockedSlots: row.unlockedSlots,
        slotKinds: row.slotKinds,
        jobs: row.jobs,
      },
    });
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
