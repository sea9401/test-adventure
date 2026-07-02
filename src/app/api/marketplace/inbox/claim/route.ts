import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { checkSession } from "@/lib/server/checkSession";
import {
  parseInboxPayload,
  type SeasonRewardSeason,
} from "@/lib/server/inboxPayload";
import { upsertSave } from "@/lib/server/savesKv";
import { PVP_WALLET_KEY } from "@/lib/server/pvp/coins";
import { FISHING_WALLET_KEY } from "@/lib/server/fishing/coins";
import { TREASURE_WALLET_KEY } from "@/lib/server/treasure/coins";
import { STAMINA_POTIONS_KEY } from "@/adventure/v2/staminaPotions";
import {
  addGradedEquip,
  addInstance,
  addToCategory,
  getKnownArr,
  getShareableArr,
  type InventoryShape,
} from "@/lib/server/marketplace";
import {
  normalizeInstance,
  type EquipmentInstance,
} from "@/adventure/inventory/equipmentInstances";
import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { mintRolledEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import { appendEquipInstances } from "@/lib/server/equipGrant";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { randomUUID } from "node:crypto";

const SAVES_CHARACTER = "character.v2";
const SAVES_INVENTORY = "inventory.v2";
const SAVES_CRAFTING = "crafting.v2";

type AddItem = {
  kind: "equip" | "material" | "skill_book";
  id: string;
  // equip 만 의미 있음. 다른 kind 는 항상 'base'. 구 페이로드(grade 없음) → 'base' fallback.
  grade: string;
  quantity: number;
};

type AddRecipe = {
  id: string;
};

// POST /api/marketplace/inbox/claim
//   body: { ids: number[] }
// 트랜잭션 단위:
//   1) 지정 inbox 행을 claimed_at IS NULL 조건으로 잠금
//   2) gold/items 집계
//   3) character.v2 / inventory.v2 잠금 + 갱신
//   4) inbox claimed_at = NOW
// 응답: 새 골드, 새 인벤토리, 추가된 항목 — 클라이언트가 즉시 반영.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await checkSession(userId, req);
  if (sessionFail) return sessionFail;

  let body: { ids?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const rawIds = body.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return new Response("missing ids", { status: 400 });
  }
  const ids = rawIds
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) {
    return new Response("invalid ids", { status: 400 });
  }
  // 한 번에 처리 가능한 수량 제한 — 비정상적으로 큰 batch 차단.
  if (ids.length > 100) {
    return new Response("too many ids", { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(marketplaceInbox)
        .where(
          and(
            eq(marketplaceInbox.userId, userId),
            inArray(marketplaceInbox.id, ids),
            isNull(marketplaceInbox.claimedAt),
          ),
        )
        .for("update");

      if (rows.length === 0) {
        return { error: "no_unclaimed", status: 404 as const };
      }

      let goldTotal = 0;
      // 시즌 순위 보상 코인 — season 별로 합산해 각 지갑에 적립.
      const coinsBySeason: Record<SeasonRewardSeason, number> = {
        pvp: 0,
        fishing: 0,
        treasure: 0,
      };
      const itemsToAdd: AddItem[] = [];
      const instancesToAdd: EquipmentInstance[] = [];
      const instancesApplied: EquipmentInstance[] = [];
      // V2 장비 보상(운영자 우편·길드 의뢰) — 스택형 inventory.v2 가 아니라 개체 모델인
      // equipment.v2.owned 에 들어가야 인벤토리에 보인다. count 만큼 개별 개체로 발급.
      const v2EquipToAdd: { id: V2EquipmentId; count: number }[] = [];
      // V2 재료 보상 — character.v2.materials 가 SSOT(인벤토리 UI 가 읽는 곳).
      // inventory.v2.materials 는 V1 잔재라 V2 에 안 보인다.
      const v2MaterialsToAdd: { id: string; count: number }[] = [];
      const recipesToAdd: AddRecipe[] = [];
      let staminaPotionsTotal = 0;
      // 장비 보상 라우팅 — id 가 V2 장비면 equipment.v2 개체로, 그 외(레거시 v1 매물 등)는
      // 기존대로 inventory.v2 스택으로. base 등급 가정(등급 사본 보상 없음).
      const pushEquip = (itemId: string, count: number) => {
        if (count <= 0) return;
        if (Object.prototype.hasOwnProperty.call(V2_EQUIPMENT, itemId)) {
          v2EquipToAdd.push({ id: itemId as V2EquipmentId, count });
        } else {
          itemsToAdd.push({ kind: "equip", id: itemId, grade: "base", quantity: count });
        }
      };
      // 재료 보상 라우팅 — id 가 V2 재료면 character.v2.materials 로, 그 외(레거시)는
      // 기존대로 inventory.v2 스택으로.
      const pushMaterial = (materialId: string, count: number) => {
        if (count <= 0) return;
        if (Object.prototype.hasOwnProperty.call(V2_MATERIALS, materialId)) {
          v2MaterialsToAdd.push({ id: materialId, count });
        } else {
          itemsToAdd.push({
            kind: "material",
            id: materialId,
            grade: "base",
            quantity: count,
          });
        }
      };
      // 파싱 실패 row 는 claimedAt 마킹에서 제외 — 인박스에 남겨 운영진이 점검할 수
      // 있게 함. 자동 claim 했다가 사라지면 보상이 영구 손실됨 (#309 후속 보강).
      const parseFailedRowIds: number[] = [];
      for (const row of rows) {
        const parsed = parseInboxPayload(row.kind, row.payload);
        if (!parsed) {
          parseFailedRowIds.push(row.id);
          console.warn(
            `[marketplace.inbox.claim] payload parse failed — row ${row.id} (kind=${row.kind}, user=${userId}). 인박스에 보존, 운영 점검 필요.`,
          );
          continue;
        }
        switch (parsed.kind) {
          // user_message / guild_invite: 부수효과 없음 — claimedAt 만 마킹.
          case "user_message":
          case "guild_invite":
            break;
          case "sale_proceeds":
            if (parsed.gold > 0) goldTotal += parsed.gold;
            break;
          case "purchase_item":
          case "cancel_return":
          case "listing_expired": {
            if (parsed.item_kind === "recipe") {
              // purchase_item(recipe) 만 학습. listing_expired/cancel_return 은 알림/환불 의미.
              if (parsed.kind === "purchase_item") {
                recipesToAdd.push({ id: parsed.item_id });
              }
            } else if (parsed.instance) {
              // 인스턴스 매물(강화/부여) — 새 instanceId 는 적용 시 발급. graded 필드는 무시.
              instancesToAdd.push(parsed.instance);
            } else if (parsed.quantity > 0) {
              itemsToAdd.push({
                kind: parsed.item_kind,
                id: parsed.item_id,
                grade: parsed.item_kind === "equip" ? parsed.grade : "base",
                quantity: parsed.quantity,
              });
            }
            break;
          }
          case "recipe_gift":
            recipesToAdd.push({ id: parsed.recipe_id });
            break;
          case "guild_quest_reward": {
            // 길드 의뢰 보상 — 골드 + 멤버당 재료/아이템.
            if (parsed.gold > 0) goldTotal += parsed.gold;
            for (const m of parsed.materials) {
              pushMaterial(m.materialId, m.count);
            }
            for (const it of parsed.items) {
              // 길드 보상 장비는 항상 base 등급 (등급 사본 보상은 현재 없음).
              pushEquip(it.itemId, it.count);
            }
            break;
          }
          case "season_reward":
            if (parsed.coins > 0) coinsBySeason[parsed.season] += parsed.coins;
            break;
          case "admin_gift": {
            // 운영자 대량 우편 — 골드 + 재료/장비/스태미나 회복약 지급(메시지는 message 컬럼).
            // 장비는 길드 의뢰 보상과 동일하게 항상 base 등급.
            if (parsed.gold > 0) goldTotal += parsed.gold;
            for (const m of parsed.materials) {
              pushMaterial(m.materialId, m.count);
            }
            for (const it of parsed.items) {
              pushEquip(it.itemId, it.count);
            }
            if (parsed.staminaPotions > 0) {
              staminaPotionsTotal += parsed.staminaPotions;
            }
            break;
          }
        }
      }

      // 캐릭터 갱신 — 골드 + V2 재료(둘 다 character.v2 가 SSOT). 한 번만 잠그고 합쳐 upsert.
      let newGold: number | null = null;
      const materialsV2Added: { id: string; count: number }[] = [];
      if (goldTotal > 0 || v2MaterialsToAdd.length > 0) {
        const charRows = await tx
          .select()
          .from(savesKv)
          .where(
            and(eq(savesKv.userId, userId), eq(savesKv.key, SAVES_CHARACTER)),
          )
          .for("update");
        // 골드 지급은 캐릭터가 반드시 있어야 함(기존 동작 보존). 재료만이면 없을 때 빈 캐릭터로 시작.
        if (goldTotal > 0 && charRows.length === 0) {
          return { error: "no_character", status: 400 as const };
        }
        const character = (charRows[0]?.value ?? {}) as Record<string, unknown>;
        let nextChar: Record<string, unknown> = { ...character };
        if (goldTotal > 0) {
          const cur = Number((character as { gold?: unknown }).gold ?? 0);
          newGold = cur + goldTotal;
          nextChar = { ...nextChar, gold: newGold };
        }
        if (v2MaterialsToAdd.length > 0) {
          const mats: Record<string, number> = {
            ...((character as { materials?: Record<string, number> }).materials ??
              {}),
          };
          for (const m of v2MaterialsToAdd) {
            mats[m.id] = Math.max(0, Math.floor(mats[m.id] ?? 0)) + m.count;
            materialsV2Added.push({ id: m.id, count: m.count });
          }
          nextChar = { ...nextChar, materials: mats };
        }
        await upsertSave(tx, userId, SAVES_CHARACTER, nextChar);
      }

      // 인벤토리 갱신 (스택 아이템 또는 인스턴스 있을 때만).
      let newInventory: InventoryShape | null = null;
      // V2 장비 갱신 (equipment.v2). 운영자 우편/길드 보상 장비가 여기로 합류.
      let newEquipmentOwned: V2EquipInstance[] | null = null;
      const equipV2Added: { id: string; count: number }[] = [];
      if (itemsToAdd.length > 0 || instancesToAdd.length > 0) {
        const invRows = await tx
          .select()
          .from(savesKv)
          .where(
            and(eq(savesKv.userId, userId), eq(savesKv.key, SAVES_INVENTORY)),
          )
          .for("update");
        const inv = (invRows[0]?.value ?? {}) as InventoryShape;
        let next: InventoryShape = { ...inv };
        for (const it of itemsToAdd) {
          if (it.kind === "equip") {
            next = addGradedEquip(next, it.id, it.grade, it.quantity);
          } else {
            const categoryKey =
              it.kind === "skill_book" ? "skillBooks" : "materials";
            next = {
              ...next,
              [categoryKey]: addToCategory(
                next[categoryKey],
                it.id,
                it.quantity,
              ),
            };
          }
        }
        // 인스턴스 매물 — 배송 시 새 instanceId 발급(셀러 잔여 사본과 충돌 방지) + 재-normalize.
        for (const inst of instancesToAdd) {
          const fresh = normalizeInstance({ ...inst, instanceId: randomUUID() });
          if (fresh) {
            next = addInstance(next, fresh);
            instancesApplied.push(fresh);
          }
        }
        await upsertSave(tx, userId, SAVES_INVENTORY, next);
        newInventory = next;
      }

      // V2 장비 갱신 — equipment.v2.owned 에 개체(iid)로 추가. V2 장비는 스택이 아니라
      // 개체 모델이라 count 만큼 굴림이 붙은 개별 개체를 발급한다.
      // 잠금 순서: character.v2 → inventory.v2 → equipment.v2 (buy/v2-grant 라우트와 동일).
      if (v2EquipToAdd.length > 0) {
        const minted: V2EquipInstance[] = [];
        for (const e of v2EquipToAdd) {
          for (let i = 0; i < e.count; i++) {
            minted.push(mintRolledEquipInstance(e.id));
          }
          equipV2Added.push({ id: e.id, count: e.count });
        }
        newEquipmentOwned = await appendEquipInstances(tx, userId, minted);
      }

      // 레시피 학습 (있을 때만).
      //   - known: 처음이면 추가, 이미 있으면 skip (recipesSkipped 로 보고)
      //   - shareable: 일부러 건드리지 않음. 거래/우편으로 받은 제작서는
      //     공유 토큰 없이 도착해야 무한 trade laundering 을 방지할 수 있다.
      //     충전은 NPC/퀘스트/드랍 같은 1차 학습 경로에서만 발생.
      const recipesAdded: string[] = [];
      const recipesSkipped: string[] = [];
      if (recipesToAdd.length > 0) {
        const craftRows = await tx
          .select()
          .from(savesKv)
          .where(
            and(eq(savesKv.userId, userId), eq(savesKv.key, SAVES_CRAFTING)),
          )
          .for("update");
        const craft = (craftRows[0]?.value ?? {}) as Record<string, unknown>;
        const knownSet = new Set(getKnownArr(craft));
        const beforeKnown = knownSet.size;
        for (const r of recipesToAdd) {
          if (knownSet.has(r.id)) recipesSkipped.push(r.id);
          else {
            knownSet.add(r.id);
            recipesAdded.push(r.id);
          }
        }
        if (knownSet.size !== beforeKnown) {
          // shareable 기존값 보존 — 누락 시 known 으로 backfill (레거시).
          const shareableArr = getShareableArr(craft);
          const nextCraft = {
            ...craft,
            known: Array.from(knownSet),
            shareable: shareableArr,
          };
          await upsertSave(tx, userId, SAVES_CRAFTING, nextCraft);
        }
      }

      // 시즌 순위 보상 코인 — season 별 지갑(pvp/낚시/보물)에 적립. 단일 유저라
      // character→inventory→crafting 다음에 지갑을 잠가도 교차 데드락 없음.
      const coinsAdded: { season: SeasonRewardSeason; coins: number }[] = [];
      const WALLET_KEY_BY_SEASON: Record<SeasonRewardSeason, string> = {
        pvp: PVP_WALLET_KEY,
        fishing: FISHING_WALLET_KEY,
        treasure: TREASURE_WALLET_KEY,
      };
      for (const season of ["pvp", "fishing", "treasure"] as const) {
        const add = coinsBySeason[season];
        if (add <= 0) continue;
        const key = WALLET_KEY_BY_SEASON[season];
        const wrows = await tx
          .select()
          .from(savesKv)
          .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)))
          .for("update");
        const raw = (wrows[0]?.value ?? {}) as Record<string, unknown>;
        // walletCoins() 읽기 경로와 동일하게 floor/clamp — 손상값(음수·소수)이 전파되지 않게.
        const cur =
          typeof raw.coins === "number" && Number.isFinite(raw.coins)
            ? Math.max(0, Math.floor(raw.coins))
            : 0;
        await upsertSave(tx, userId, key, { ...raw, coins: cur + add });
        coinsAdded.push({ season, coins: add });
      }

      // 스태미나 회복약 — 전용 키(stamina-potions.v1). 다른 세이브 처리 뒤 leaf 로 잠근다.
      let staminaPotions: number | null = null;
      if (staminaPotionsTotal > 0) {
        const prows = await tx
          .select()
          .from(savesKv)
          .where(
            and(eq(savesKv.userId, userId), eq(savesKv.key, STAMINA_POTIONS_KEY)),
          )
          .for("update");
        const raw = (prows[0]?.value ?? {}) as Record<string, unknown>;
        const cur =
          typeof raw.count === "number" && Number.isFinite(raw.count)
            ? Math.max(0, Math.floor(raw.count))
            : 0;
        staminaPotions = cur + staminaPotionsTotal;
        await upsertSave(tx, userId, STAMINA_POTIONS_KEY, {
          ...raw,
          count: staminaPotions,
        });
      }

      // inbox 마킹.
      const now = new Date();
      const failedSet = new Set(parseFailedRowIds);
      const idsToMark = rows
        .filter((r) => !failedSet.has(r.id))
        .map((r) => r.id);
      if (idsToMark.length > 0) {
        await tx
          .update(marketplaceInbox)
          .set({ claimedAt: now })
          .where(
            and(
              eq(marketplaceInbox.userId, userId),
              inArray(marketplaceInbox.id, idsToMark),
              isNull(marketplaceInbox.claimedAt),
            ),
          );
      }

      return {
        ok: true as const,
        claimed: idsToMark,
        goldAdded: goldTotal,
        itemsAdded: itemsToAdd,
        equipV2Added,
        materialsV2Added,
        instancesAdded: instancesApplied,
        recipesAdded,
        recipesSkipped,
        coinsAdded,
        staminaPotionsAdded: staminaPotionsTotal,
        staminaPotions,
        newGold,
        newInventory,
        newEquipmentOwned,
      };
    });

    if ("error" in result) {
      return new Response(result.error, { status: result.status });
    }
    return Response.json(result);
  } catch (e) {
    console.error("[marketplace.inbox.claim] ", e);
    return new Response("internal error", { status: 500 });
  }
}
