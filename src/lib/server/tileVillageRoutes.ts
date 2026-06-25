// T1b — 타일 정착지(tile:col,row)를 기존 마을 생산 시스템에 연결하는 라우트 핸들러.
//   각 village 라우트는 `V2_TILE_PRODUCTION && isTileOutpostId(outpostId)` 일 때만 여기로 위임한다.
//   카탈로그 거점 경로는 라우트에 그대로 두어 byte-identical(이 모듈은 tile id 전용).
//
// 소유: 길드 점령행 있으면 길드(자원=길드 풀·골드=길드 금고), 없으면 솔로 founder(자원=개인 풀·
//   골드=플레이어 본인 골드). resolveTileVillageManageOwner 가 FOR UPDATE 락 + 권한 판정.
// tier: build=frontier→village(+ tile_settlements 동기화), upgrade=village→city→metropolis(동기화).

import { db } from "@/db";
import { eq } from "drizzle-orm";
import { outpostOccupations } from "@/db/schema";
import {
  parseTileOutpostId,
  tileOutpostId,
  tileTierToOutpostTier,
} from "@/adventure/data/v2/tileWarfare";
import { tileFortMaxHp } from "@/adventure/data/v2/outpostSiege";
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
  readTileSettlementName,
  type VillageRow,
} from "./v2Settlement";
import {
  INITIAL_UNLOCKED_SLOTS,
  MAX_SLOTS_BY_TIER,
  VILLAGE_BUILD_GOLD_COST,
  canUpgrade,
  applyUpgradeCost,
} from "@/adventure/data/v2/settlement";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { SETTLEMENT_MATERIAL_TO_KIND } from "@/adventure/data/v2/settlementMaterials";

// 기부로 차감할 개인 재료(통나무/철광석)는 character.v2 세이브의 materials 에 있다(강화/드랍과 동일).
type CharSaveMaterials = { materials?: Record<string, number>; [k: string]: unknown };

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
//   표시 이름은 개척(found) 때 정한 이름(tile_settlements.name)을 그대로 쓴다 — 건설 단계에서 이름을
//   다시 받지 않는다(이름은 개척 때 한 번만·불변). 그래서 name 동기화도 불필요(이미 SSOT 와 일치).
export async function tileBuild(
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
        const owner = ctx.owner;
        // 표시 이름 = 개척 때 정한 이름. found 가 항상 채우지만, 만약을 위해 기본값 폴백.
        const name = (await readTileSettlementName(tx, pos.col, pos.row)) ?? "개척마을";
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

// [폐지·PR-3] tileProduce/tileHarvest 제거 — 슬롯 생산(12h crop/ore) 폐지. crop/ore 풀은
//   사냥 드랍→기부(tileDonate)+업그레이드 소비로만 변동. 슬롯은 자리표시(미래 영지 건물)만.

// unlock-slot — 다음 칸 해금(소유 골드). 관리권 필요. [PR-3] 종류 선택 없음(슬롯=자리표시).
export async function tileUnlockSlot(
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
        village.unlockedSlots += 1;
        await upsertVillage(tx, village);
        await og.spend(cost);
        return {
          status: 200,
          body: {
            ok: true,
            unlockedSlots: village.unlockedSlots,
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
        // 도시/대도시 달성 보상 = 슬롯 +1칸(무료·골드 불요). 판 최대까지만.
        village.unlockedSlots = Math.min(
          MAX_SLOTS_BY_TIER[village.tier],
          village.unlockedSlots + 1,
        );
        await upsertVillage(tx, village);
        await upsertSettlementResources(tx, ctx.owner, nextResources);
        await syncTileSettlementTier(tx, pos.col, pos.row, village.tier);
        // 단계 상승 → 성벽도 새 단계 HP 로 강화 + 풀수리. 이 타일 자신의 점령행만 단일 update
        //   (타 길드 자원 미접촉 → 동시 공성과 데드락 회피). 업글은 1방향+자원소모라 비악용.
        const tierFortHp = tileFortMaxHp(
          pos.col,
          pos.row,
          tileTierToOutpostTier(village.tier),
        );
        await tx
          .update(outpostOccupations)
          .set({
            fortHp: tierFortHp,
            fortMaxHp: tierFortHp,
            fortUpdatedAt: new Date(),
          })
          .where(eq(outpostOccupations.outpostId, tileOutpostId(pos.col, pos.row)));
        return {
          status: 200,
          body: {
            ok: true,
            tier: village.tier,
            unlockedSlots: village.unlockedSlots,
            resources: nextResources,
          },
        };
      }),
    );
  } catch {
    return serverError();
  }
}

// donate — 개인 인벤(통나무/철광석)을 정착지 재화 풀(crop/ore)에 기부한다. 길드원 전원 가능
//   (관리권 불요·requireAdmin=false). 통나무→crop / 철광석→ore (SETTLEMENT_MATERIAL_TO_KIND).
//   lock 순서: 점령행(resolve) → character.v2(개인 재료) → 정착지 풀. 단일 tx·중첩 트랜잭션 없음.
export async function tileDonate(
  userId: string,
  outpostId: string,
  donations: Partial<Record<string, number>>,
): Promise<Response> {
  const pos = parseTileOutpostId(outpostId);
  if (!pos) return badTile();
  // 검증(트랜잭션 전) — 키는 정착지 재료만·양수 정수·최소 1종. 알 수 없는 키는 거부.
  const entries: Array<[string, number]> = [];
  for (const [id, raw] of Object.entries(donations ?? {})) {
    if (!(id in SETTLEMENT_MATERIAL_TO_KIND)) {
      return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const n = typeof raw === "number" ? Math.floor(raw) : NaN;
    if (!Number.isFinite(n) || n <= 0) {
      return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    entries.push([id, n]);
  }
  if (entries.length === 0) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  try {
    return json(
      await db.transaction(async (tx): Promise<Res> => {
        const ctx = await resolveTileVillageManageOwner(
          tx,
          userId,
          pos.col,
          pos.row,
          false,
        );
        if (!ctx.ok) return { status: ctx.status, body: { ok: false, error: ctx.error } };
        const charSave = await lockSaveForUpdate<CharSaveMaterials>(
          tx,
          userId,
          "character.v2",
          {},
        );
        const materials: Record<string, number> = { ...(charSave.materials ?? {}) };
        // 보유 검증 — 풀 lock 전에 실패시켜 잠금 범위 최소화.
        for (const [id, n] of entries) {
          if (Math.floor(Number(materials[id]) || 0) < n) {
            return { status: 409, body: { ok: false, error: "insufficient_material" } };
          }
        }
        const resources = await lockSettlementResources(tx, ctx.owner);
        for (const [id, n] of entries) {
          materials[id] = Math.max(0, Math.floor(Number(materials[id]) || 0) - n);
          const kind = SETTLEMENT_MATERIAL_TO_KIND[id];
          resources[kind] = (resources[kind] ?? 0) + n;
        }
        await upsertSave(tx, userId, "character.v2", { ...charSave, materials });
        await upsertSettlementResources(tx, ctx.owner, resources);
        return { status: 200, body: { ok: true, resources, materials } };
      }),
    );
  } catch {
    return serverError();
  }
}
