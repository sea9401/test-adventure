// T1b — 타일 정착지(tile:col,row)를 기존 마을 생산 시스템에 연결하는 라우트 핸들러.
//   각 village 라우트는 `V2_TILE_PRODUCTION && isTileOutpostId(outpostId)` 일 때만 여기로 위임한다.
//   카탈로그 거점 경로는 라우트에 그대로 두어 byte-identical(이 모듈은 tile id 전용).
//
// 소유: 길드 점령행 있으면 길드(자원=길드 풀·골드=길드 금고), 없으면 솔로 founder(자원=개인 풀·
//   골드=플레이어 본인 골드). resolveTileVillageManageOwner 가 FOR UPDATE 락 + 권한 판정.
// tier: build=frontier→village(+ tile_settlements 동기화), upgrade=village→city→metropolis(동기화).

import { db } from "@/db";
import { parseTileOutpostId } from "@/adventure/data/v2/tileWarfare";
import {
  scaledTileGoldCost,
  tileCostMultiplier,
  tileSlotUnlockGoldCost,
} from "@/adventure/data/v2/tileConfig";
import {
  lockVillage,
  upsertVillage,
  resolveTileVillageManageOwner,
  normalizeVillageToOwner,
  lockOwnerGold,
  lockSettlementResources,
  upsertSettlementResources,
  syncTileSettlementTier,
  terrainTraitOf,
  type VillageRow,
} from "./v2Settlement";
import {
  INITIAL_UNLOCKED_SLOTS,
  MAX_SLOTS_BY_TIER,
  VILLAGE_BUILD_GOLD_COST,
  tryStartProduction,
  isHarvestReady,
  harvestYield,
  canUpgrade,
  applyUpgradeCost,
  type ProductionKind,
} from "@/adventure/data/v2/settlement";

type Res =
  | { status: number; body: Record<string, unknown> }
  | { status: number; body: { ok: false; error: string } };

function json(r: Res): Response {
  return Response.json(r.body, { status: r.status });
}
function serverError(): Response {
  return Response.json({ ok: false, error: "server_error" }, { status: 500 });
}
function badTile(): Response {
  return Response.json({ ok: false, error: "invalid" }, { status: 400 });
}

// build — 개척마을(frontier) → 마을(village). 마을 행 생성 + 소유 골드 1천만 + tile_settlements.tier 동기화.
export async function tileBuild(
  userId: string,
  outpostId: string,
  name: string,
): Promise<Response> {
  const pos = parseTileOutpostId(outpostId);
  if (!pos) return badTile();
  try {
    return json(
      await db.transaction(async (tx): Promise<Res> => {
        const ctx = await resolveTileVillageManageOwner(
          tx,
          userId,
          pos.col,
          pos.row,
          true,
        );
        if (!ctx.ok) return { status: ctx.status, body: { ok: false, error: ctx.error } };
        const owner = ctx.owner;
        const existing = await lockVillage(tx, outpostId);
        if (existing) {
          const village = normalizeVillageToOwner(existing, owner);
          if (village.name != null) {
            return { status: 409, body: { ok: false, error: "already_built" } };
          }
          await upsertVillage(tx, { ...village, name });
          return { status: 200, body: { ok: true, name, tier: village.tier } };
        }
        const og = await lockOwnerGold(tx, owner);
        // 마을 건설비 = 기본비용 × 리베라(중앙) 거리 배수 — 중앙에서 멀수록↑.
        const buildCost = scaledTileGoldCost(
          VILLAGE_BUILD_GOLD_COST,
          pos.col,
          pos.row,
        );
        if (og.available < buildCost) {
          return {
            status: 409,
            body: {
              ok: false,
              error: "insufficient_gold",
              cost: buildCost,
            },
          };
        }
        const village: VillageRow = {
          outpostId,
          guildId: owner.kind === "guild" ? owner.guildId : null,
          ownerUserId: owner.kind === "solo" ? owner.userId : null,
          tier: "village",
          name,
          productionKind: null,
          unlockedSlots: INITIAL_UNLOCKED_SLOTS,
          slotKinds: {},
          jobs: {},
        };
        await upsertVillage(tx, village);
        await og.spend(buildCost);
        await syncTileSettlementTier(tx, pos.col, pos.row, "village");
        return { status: 200, body: { ok: true, name, tier: village.tier } };
      }),
    );
  } catch {
    return serverError();
  }
}

// produce — 슬롯 생산 시작. 관리권 불요(길드원/founder 누구나).
export async function tileProduce(
  userId: string,
  outpostId: string,
  slot: number,
): Promise<Response> {
  const pos = parseTileOutpostId(outpostId);
  if (!pos) return badTile();
  try {
    return json(
      await db.transaction(async (tx): Promise<Res> => {
        const now = Date.now();
        const ctx = await resolveTileVillageManageOwner(
          tx,
          userId,
          pos.col,
          pos.row,
          false,
        );
        if (!ctx.ok) return { status: ctx.status, body: { ok: false, error: ctx.error } };
        const loaded = await lockVillage(tx, outpostId);
        if (!loaded) return { status: 409, body: { ok: false, error: "not_built" } };
        const village = normalizeVillageToOwner(loaded, ctx.owner);
        if (village.name == null) {
          return { status: 409, body: { ok: false, error: "not_built" } };
        }
        const slotKind = village.slotKinds[slot];
        if (slotKind == null) {
          return { status: 400, body: { ok: false, error: "slot_out_of_range" } };
        }
        const started = tryStartProduction(
          village.jobs,
          village.unlockedSlots,
          slot,
          slotKind,
          now,
        );
        if (!started.ok) {
          return {
            status: started.error === "slot_busy" ? 409 : 400,
            body: { ok: false, error: started.error },
          };
        }
        village.jobs = started.jobs;
        await upsertVillage(tx, village);
        return { status: 200, body: { ok: true, tier: village.tier, jobs: village.jobs } };
      }),
    );
  } catch {
    return serverError();
  }
}

// harvest — 완료 슬롯 수확 → 소유 자원 풀(길드/솔로)에 적립.
export async function tileHarvest(
  userId: string,
  outpostId: string,
  slot: number,
): Promise<Response> {
  const pos = parseTileOutpostId(outpostId);
  if (!pos) return badTile();
  try {
    return json(
      await db.transaction(async (tx): Promise<Res> => {
        const now = Date.now();
        const ctx = await resolveTileVillageManageOwner(
          tx,
          userId,
          pos.col,
          pos.row,
          false,
        );
        if (!ctx.ok) return { status: ctx.status, body: { ok: false, error: ctx.error } };
        const loaded = await lockVillage(tx, outpostId);
        if (!loaded) return { status: 404, body: { ok: false, error: "no_village" } };
        const village = normalizeVillageToOwner(loaded, ctx.owner);
        const job = village.jobs[String(slot)];
        if (!job) return { status: 404, body: { ok: false, error: "no_job" } };
        if (!isHarvestReady(job, now)) {
          return { status: 409, body: { ok: false, error: "not_ready" } };
        }
        const amount = harvestYield(job, terrainTraitOf(outpostId), now);
        const resources = await lockSettlementResources(tx, ctx.owner);
        resources[job.kind] = (resources[job.kind] ?? 0) + amount;
        delete village.jobs[String(slot)];
        await upsertVillage(tx, village);
        await upsertSettlementResources(tx, ctx.owner, resources);
        return {
          status: 200,
          body: {
            ok: true,
            harvested: { kind: job.kind, amount },
            jobs: village.jobs,
            resources,
          },
        };
      }),
    );
  } catch {
    return serverError();
  }
}

// unlock-slot — 다음 칸 해금(소유 골드) + 종류 고정. 관리권 필요.
export async function tileUnlockSlot(
  userId: string,
  outpostId: string,
  kind: ProductionKind,
): Promise<Response> {
  const pos = parseTileOutpostId(outpostId);
  if (!pos) return badTile();
  try {
    return json(
      await db.transaction(async (tx): Promise<Res> => {
        const ctx = await resolveTileVillageManageOwner(
          tx,
          userId,
          pos.col,
          pos.row,
          true,
        );
        if (!ctx.ok) return { status: ctx.status, body: { ok: false, error: ctx.error } };
        const loaded = await lockVillage(tx, outpostId);
        if (!loaded) return { status: 404, body: { ok: false, error: "no_village" } };
        const village = normalizeVillageToOwner(loaded, ctx.owner);
        if (village.name == null) {
          return { status: 409, body: { ok: false, error: "not_built" } };
        }
        const og = await lockOwnerGold(tx, ctx.owner);
        // 칸 해금비 = 타일 고정 누진(거리 무관·5천만/1억/2억/3억). 판이 꽉 차면 at_max.
        if (village.unlockedSlots >= MAX_SLOTS_BY_TIER[village.tier]) {
          return {
            status: 409,
            body: { ok: false, error: "at_max", cost: 0 },
          };
        }
        const cost = tileSlotUnlockGoldCost(village.unlockedSlots);
        if (og.available < cost) {
          return {
            status: 409,
            body: { ok: false, error: "insufficient_gold", cost },
          };
        }
        const newSlot = village.unlockedSlots;
        village.unlockedSlots += 1;
        village.slotKinds = { ...village.slotKinds, [newSlot]: kind };
        await upsertVillage(tx, village);
        await og.spend(cost);
        return {
          status: 200,
          body: {
            ok: true,
            unlockedSlots: village.unlockedSlots,
            slotKinds: village.slotKinds,
            gold: og.available - cost,
          },
        };
      }),
    );
  } catch {
    return serverError();
  }
}

// upgrade — 단계 상승(village→city→metropolis). 소유 자원 소비 + tile_settlements.tier 동기화. 관리권 필요.
export async function tileUpgrade(
  userId: string,
  outpostId: string,
): Promise<Response> {
  const pos = parseTileOutpostId(outpostId);
  if (!pos) return badTile();
  try {
    return json(
      await db.transaction(async (tx): Promise<Res> => {
        const ctx = await resolveTileVillageManageOwner(
          tx,
          userId,
          pos.col,
          pos.row,
          true,
        );
        if (!ctx.ok) return { status: ctx.status, body: { ok: false, error: ctx.error } };
        const loaded = await lockVillage(tx, outpostId);
        if (!loaded) return { status: 404, body: { ok: false, error: "no_village" } };
        const village = normalizeVillageToOwner(loaded, ctx.owner);
        const resources = await lockSettlementResources(tx, ctx.owner);
        // 단계 승격 자원비 = 기본비용 × 리베라(중앙) 거리 배수 — 중앙에서 멀수록↑.
        const mult = tileCostMultiplier(pos.col, pos.row);
        const check = canUpgrade(
          village.tier,
          village.unlockedSlots,
          resources,
          mult,
        );
        if (!check.ok || !check.next) {
          return {
            status: 409,
            body: {
              ok: false,
              error: !check.next
                ? "max_tier"
                : check.needSlots
                  ? "need_slots"
                  : "insufficient",
              missing: check.missing,
            },
          };
        }
        const nextResources = applyUpgradeCost(village.tier, resources, mult);
        village.tier = check.next;
        await upsertVillage(tx, village);
        await upsertSettlementResources(tx, ctx.owner, nextResources);
        await syncTileSettlementTier(tx, pos.col, pos.row, village.tier);
        return {
          status: 200,
          body: { ok: true, tier: village.tier, resources: nextResources },
        };
      }),
    );
  } catch {
    return serverError();
  }
}

// rename — 건설된 마을 개명. 관리권 필요.
export async function tileRename(
  userId: string,
  outpostId: string,
  name: string,
): Promise<Response> {
  const pos = parseTileOutpostId(outpostId);
  if (!pos) return badTile();
  try {
    return json(
      await db.transaction(async (tx): Promise<Res> => {
        const ctx = await resolveTileVillageManageOwner(
          tx,
          userId,
          pos.col,
          pos.row,
          true,
        );
        if (!ctx.ok) return { status: ctx.status, body: { ok: false, error: ctx.error } };
        const loaded = await lockVillage(tx, outpostId);
        if (!loaded) return { status: 409, body: { ok: false, error: "not_built" } };
        const village = normalizeVillageToOwner(loaded, ctx.owner);
        if (village.name == null) {
          return { status: 409, body: { ok: false, error: "not_built" } };
        }
        await upsertVillage(tx, { ...village, name });
        return { status: 200, body: { ok: true, name } };
      }),
    );
  } catch {
    return serverError();
  }
}
