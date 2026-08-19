import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { requireActiveDeviceSession } from "@/lib/server/checkSession";
import {
  parseInboxPayload,
  type SeasonRewardSeason,
} from "@/lib/server/inboxPayload";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { PVP_WALLET_KEY } from "@/lib/server/pvp/coins";
import { FISHING_WALLET_KEY } from "@/lib/server/fishing/coins";
import {
  grantStaminaPotions,
  STAMINA_POTIONS_KEY,
} from "@/adventure/v2/staminaPotions";
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
  isUnique,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  mintListedEquipInstance,
  mintRolledEquipInstance,
} from "@/adventure/data/v2/v2EquipMint";
import { appendEquipInstances } from "@/lib/server/equipGrant";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { recordUniqueEquipmentAcquisitions } from "@/lib/server/uniqueEquipmentAchievement";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import {
  ADVENTURE_SUPPORT_PASS,
  grantAdventureSupport,
} from "@/adventure/data/v2/adventureSupport";
import {
  applyRegen,
  parseStaminaFromSave,
  staminaConfigForCharacter,
  staminaOverchargeCap,
  type StaminaState,
} from "@/adventure/v2/stamina";
import {
  MUSEUN_COIN_WALLET_KEY,
  addMuseunCashItem,
  isMuseunShopItemId,
  parseMuseunCoinBalance,
  type MuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  addCookingFood,
  isCookingFoodId,
  type CookingFoodId,
} from "@/adventure/v2/cooking";
import { randomUUID } from "node:crypto";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import type { FishId } from "@/adventure/data/v2/fish";
import {
  FISH_SPECIMEN_SAVE_KEY,
  addFishSpecimen,
  fishIdFromSpecimenItemId,
  parseFishSpecimenInventory,
} from "@/adventure/v2/fishSpecimens";
import {
  TradeSuspendedError,
  lockTradeParticipantStatuses,
  tradeSuspendedResponse,
} from "@/lib/server/tradeSuspension";

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
  const userId = await ensureUser({ skipDeviceCheck: true });
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await requireActiveDeviceSession(userId, req);
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
      const participantStatuses = await lockTradeParticipantStatuses(
        tx,
        [userId],
        new Date(),
      );
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

      const restriction = participantStatuses.get(userId) ?? null;
      const blockedPlayerGift = rows.some(
        (row) =>
          parseInboxPayload(row.kind, row.payload)?.kind === "recipe_gift",
      );
      if (restriction && blockedPlayerGift) {
        throw new TradeSuspendedError(restriction);
      }

      // 판매 대금은 은행으로, 환불·기타 우편 골드는 기존처럼 보유 현금으로 지급한다.
      let walletGoldTotal = 0;
      let bankedGoldTotal = 0;
      // 시즌 순위 보상 코인 — season 별로 합산해 각 지갑에 적립.
      const coinsBySeason: Record<SeasonRewardSeason, number> = {
        pvp: 0,
        fishing: 0,
      };
      const itemsToAdd: AddItem[] = [];
      const instancesToAdd: EquipmentInstance[] = [];
      const instancesApplied: EquipmentInstance[] = [];
      // V2 장비 보상(운영자 우편·길드 의뢰) — 스택형 inventory.v2 가 아니라 개체 모델인
      // equipment.v2.owned 에 들어가야 인벤토리에 보인다. count 만큼 개별 개체로 발급.
      const v2EquipToAdd: { id: V2EquipmentId; count: number }[] = [];
      const v2MarketplaceEquipToAdd: Array<{
        id: V2EquipmentId;
        payload: Record<string, unknown> | null;
      }> = [];
      // V2 재료 보상 — character.v2.materials 가 SSOT(인벤토리 UI 가 읽는 곳).
      // inventory.v2.materials 는 V1 잔재라 V2 에 안 보인다.
      const v2MaterialsToAdd: { id: string; count: number }[] = [];
      const recipesToAdd: AddRecipe[] = [];
      let staminaPotionsTotal = 0;
      let boundStaminaPotionsTotal = 0;
      let museunCoinsTotal = 0;
      const museunCashItemTotals = new Map<MuseunCashItemId, number>();
      const cookingFoodTotals = new Map<CookingFoodId, number>();
      const fishSpecimenTotals = new Map<FishId, number>();
      let adventureSupportDaysTotal = 0;
      const titleIdsToGrant = new Set<string>();
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
          case "price_alert":
          case "guild_invite":
            break;
          case "sale_proceeds":
            if (parsed.gold > 0) bankedGoldTotal += parsed.gold;
            break;
          case "bid_refund":
          case "buy_order_refund":
            if (parsed.gold > 0) walletGoldTotal += parsed.gold;
            break;
          case "buy_order_item":
            if (parsed.item_kind === "material") {
              pushMaterial(parsed.item_id, parsed.quantity);
            } else if (
              parsed.item_kind === "cash" &&
              isMuseunShopItemId(parsed.item_id)
            ) {
              museunCashItemTotals.set(
                parsed.item_id,
                (museunCashItemTotals.get(parsed.item_id) ?? 0) +
                  parsed.quantity,
              );
            } else if (
              parsed.item_kind === "cooking" &&
              isCookingFoodId(parsed.item_id)
            ) {
              cookingFoodTotals.set(
                parsed.item_id,
                (cookingFoodTotals.get(parsed.item_id) ?? 0) + parsed.quantity,
              );
            } else if (parsed.item_kind === "specimen") {
              const fishId = fishIdFromSpecimenItemId(parsed.item_id);
              if (fishId) {
                fishSpecimenTotals.set(
                  fishId,
                  (fishSpecimenTotals.get(fishId) ?? 0) + parsed.quantity,
                );
              } else {
                parseFailedRowIds.push(row.id);
              }
            } else {
              parseFailedRowIds.push(row.id);
            }
            break;
          case "buy_order_equipment":
            if (
              Object.prototype.hasOwnProperty.call(
                V2_EQUIPMENT,
                parsed.item_id,
              )
            ) {
              v2MarketplaceEquipToAdd.push({
                id: parsed.item_id as V2EquipmentId,
                payload: parsed.instance_payload,
              });
            } else {
              parseFailedRowIds.push(row.id);
            }
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
            if (parsed.gold > 0) walletGoldTotal += parsed.gold;
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
            if (parsed.gold > 0) walletGoldTotal += parsed.gold;
            for (const m of parsed.materials) {
              pushMaterial(m.materialId, m.count);
            }
            for (const it of parsed.items) {
              pushEquip(it.itemId, it.count);
            }
            if (parsed.staminaPotions > 0) {
              staminaPotionsTotal += parsed.staminaPotions;
              if (parsed.staminaPotionsBound) {
                boundStaminaPotionsTotal += parsed.staminaPotions;
              }
            }
            if (parsed.museunCoins > 0) {
              museunCoinsTotal += parsed.museunCoins;
            }
            for (const item of parsed.cashItems) {
              museunCashItemTotals.set(
                item.itemId,
                (museunCashItemTotals.get(item.itemId) ?? 0) + item.count,
              );
            }
            if (parsed.adventureSupportDays > 0) {
              adventureSupportDaysTotal += parsed.adventureSupportDays;
            }
            for (const titleId of parsed.titleIds ?? []) {
              titleIdsToGrant.add(titleId);
            }
            break;
          }
        }
      }

      // 캐릭터 갱신 — 골드 + V2 재료(둘 다 character.v2 가 SSOT). 한 번만 잠그고 합쳐 upsert.
      let newGold: number | null = null;
      let newBankedGold: number | null = null;
      let adventureSupportActiveUntil: number | null = null;
      let adventureSupportDaysApplied = 0;
      let adventureSupportFirstActivation = false;
      let staminaAfterSupport: StaminaState | null = null;
      let staminaMaxAfterSupport: number | null = null;
      const materialsV2Added: { id: string; count: number }[] = [];
      if (
        walletGoldTotal > 0 ||
        bankedGoldTotal > 0 ||
        v2MaterialsToAdd.length > 0 ||
        museunCashItemTotals.size > 0 ||
        adventureSupportDaysTotal > 0
      ) {
        const charRows = await tx
          .select()
          .from(savesKv)
          .where(
            and(eq(savesKv.userId, userId), eq(savesKv.key, SAVES_CHARACTER)),
          )
          .for("update");
        // 골드 지급은 캐릭터가 반드시 있어야 함(기존 동작 보존). 재료만이면 없을 때 빈 캐릭터로 시작.
        if ((walletGoldTotal > 0 || bankedGoldTotal > 0) && charRows.length === 0) {
          return { error: "no_character", status: 400 as const };
        }
        const character = (charRows[0]?.value ?? {}) as Record<string, unknown>;
        let nextChar: Record<string, unknown> = { ...character };
        if (walletGoldTotal > 0) {
          const cur = Number((character as { gold?: unknown }).gold ?? 0);
          newGold = cur + walletGoldTotal;
          nextChar = { ...nextChar, gold: newGold };
        }
        if (bankedGoldTotal > 0) {
          const cur = Number(
            (character as { bankedGold?: unknown }).bankedGold ?? 0,
          );
          newBankedGold = cur + bankedGoldTotal;
          nextChar = { ...nextChar, bankedGold: newBankedGold };
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
        if (museunCashItemTotals.size > 0) {
          let cashItems: unknown = character.cashItems;
          for (const [itemId, count] of museunCashItemTotals) {
            cashItems = addMuseunCashItem(cashItems, itemId, count);
          }
          nextChar = { ...nextChar, cashItems };
        }
        if (adventureSupportDaysTotal > 0) {
          const nowMs = Date.now();
          const grant = grantAdventureSupport(
            character.adventureSupport,
            adventureSupportDaysTotal,
            nowMs,
          );
          if (grant) {
            adventureSupportDaysApplied = grant.days;
            adventureSupportActiveUntil = grant.state.activeUntil;
            adventureSupportFirstActivation = grant.firstActivation;
            nextChar = { ...nextChar, adventureSupport: grant.state };

            const nextConfig = staminaConfigForCharacter(nextChar, nowMs);
            staminaMaxAfterSupport = nextConfig.max;
            if (grant.firstActivation) {
              const previousConfig = staminaConfigForCharacter(character, nowMs);
              const currentStamina = applyRegen(
                parseStaminaFromSave(character.stamina, nowMs),
                nowMs,
                previousConfig.max,
                previousConfig.regenBonusPct,
              );
              staminaAfterSupport = {
                current: Math.min(
                  staminaOverchargeCap(nextConfig.max),
                  currentStamina.current +
                    ADVENTURE_SUPPORT_PASS.staminaActivationGrant,
                ),
                lastUpdatedAt: currentStamina.lastUpdatedAt,
              };
              nextChar = { ...nextChar, stamina: staminaAfterSupport };
            }
          }
        }
        await upsertSave(tx, userId, SAVES_CHARACTER, nextChar);
      }

      // 인벤토리 갱신 (스택 아이템 또는 인스턴스 있을 때만).
      let newInventory: InventoryShape | null = null;
      // V2 장비 갱신 (equipment.v2). 운영자 우편/길드 보상 장비가 여기로 합류.
      let newEquipmentOwned: V2EquipInstance[] | null = null;
      const equipV2Added: { id: string; count: number }[] = [];
      if (
        itemsToAdd.length > 0 ||
        instancesToAdd.length > 0 ||
        cookingFoodTotals.size > 0
      ) {
        const invRows = await tx
          .select()
          .from(savesKv)
          .where(
            and(eq(savesKv.userId, userId), eq(savesKv.key, SAVES_INVENTORY)),
          )
          .for("update");
        const inv = (invRows[0]?.value ?? {}) as InventoryShape & {
          cookingFoods?: unknown;
        };
        let next: InventoryShape & { cookingFoods?: unknown } = { ...inv };
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
        for (const [itemId, count] of cookingFoodTotals) {
          next = {
            ...next,
            cookingFoods: addCookingFood(next.cookingFoods, itemId, count),
          };
        }
        await upsertSave(tx, userId, SAVES_INVENTORY, next);
        newInventory = next;
      }

      let fishSpecimensAfter: ReturnType<typeof parseFishSpecimenInventory> | null = null;
      if (fishSpecimenTotals.size > 0) {
        let specimens = parseFishSpecimenInventory(
          await lockSaveForUpdate(
            tx,
            userId,
            FISH_SPECIMEN_SAVE_KEY,
            {},
          ),
        );
        for (const [fishId, count] of fishSpecimenTotals) {
          specimens = addFishSpecimen(specimens, fishId, count);
        }
        await upsertSave(tx, userId, FISH_SPECIMEN_SAVE_KEY, specimens);
        fishSpecimensAfter = specimens;
      }

      // V2 장비 갱신 — equipment.v2.owned 에 개체(iid)로 추가. V2 장비는 스택이 아니라
      // 개체 모델이라 count 만큼 굴림이 붙은 개별 개체를 발급한다.
      // 잠금 순서: character.v2 → inventory.v2 → equipment.v2 (buy/v2-grant 라우트와 동일).
      if (v2EquipToAdd.length > 0 || v2MarketplaceEquipToAdd.length > 0) {
        const minted: V2EquipInstance[] = [];
        const acquiredUniqueIds: V2EquipmentId[] = [];
        for (const e of v2EquipToAdd) {
          for (let i = 0; i < e.count; i++) {
            minted.push(mintRolledEquipInstance(e.id));
            if (isUnique(V2_EQUIPMENT[e.id])) acquiredUniqueIds.push(e.id);
          }
          equipV2Added.push({ id: e.id, count: e.count });
        }
        for (const equipment of v2MarketplaceEquipToAdd) {
          minted.push(
            mintListedEquipInstance(equipment.id, equipment.payload),
          );
          equipV2Added.push({ id: equipment.id, count: 1 });
        }
        newEquipmentOwned = await appendEquipInstances(tx, userId, minted);
        // 거래소 매물 수령·반환은 같은 개체의 이동이므로 제외하고, 운영 보상/우편이 새로
        // 발급한 v2EquipToAdd 유니크만 누적 획득으로 기록한다.
        if (acquiredUniqueIds.length > 0) {
          await recordUniqueEquipmentAcquisitions({
            executor: tx,
            userId,
            evidence: {
              equipmentOwnedAfter: newEquipmentOwned,
              equipmentCodexRaw: await readSave(
                tx,
                userId,
                EQUIPMENT_CODEX_KEY,
                {},
              ),
              acquiredIds: acquiredUniqueIds,
            },
          });
        }
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

      // 시즌 순위 보상 코인 — season 별 지갑(pvp/낚시)에 적립. 단일 유저라
      // character→inventory→crafting 다음에 지갑을 잠가도 교차 데드락 없음.
      const coinsAdded: { season: SeasonRewardSeason; coins: number }[] = [];
      const WALLET_KEY_BY_SEASON: Record<SeasonRewardSeason, string> = {
        pvp: PVP_WALLET_KEY,
        fishing: FISHING_WALLET_KEY,
      };
      for (const season of ["pvp", "fishing"] as const) {
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

      // 무슨 코인 — 전용 지갑에 적립. 캐릭터/인벤토리/시즌 지갑 처리 뒤 leaf 로 잠근다.
      let museunCoins: number | null = null;
      if (museunCoinsTotal > 0) {
        const walletRows = await tx
          .select()
          .from(savesKv)
          .where(
            and(
              eq(savesKv.userId, userId),
              eq(savesKv.key, MUSEUN_COIN_WALLET_KEY),
            ),
          )
          .for("update");
        const wallet = (walletRows[0]?.value ?? {}) as Record<string, unknown>;
        museunCoins = parseMuseunCoinBalance(wallet) + museunCoinsTotal;
        await upsertSave(tx, userId, MUSEUN_COIN_WALLET_KEY, {
          ...wallet,
          coins: museunCoins,
        });
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
        const unboundStaminaPotionsTotal =
          staminaPotionsTotal - boundStaminaPotionsTotal;
        const withUnbound = grantStaminaPotions(
          raw,
          unboundStaminaPotionsTotal,
        );
        const nextPotions = grantStaminaPotions(
          withUnbound,
          boundStaminaPotionsTotal,
          {
            bound: true,
          },
        );
        staminaPotions = nextPotions.count;
        await upsertSave(tx, userId, STAMINA_POTIONS_KEY, nextPotions);
      }

      // 영구 칭호 — 같은 칭호가 여러 우편에 있어도 한 번만 지급한다. 기존 보유분은
      // grantTitleIfMissingInTx 가 멱등 처리하며 칭호 획득 알림도 같은 트랜잭션에 남긴다.
      const titleIdsAdded: string[] = [];
      for (const titleId of titleIdsToGrant) {
        if (await grantTitleIfMissingInTx(tx, userId, titleId, Date.now())) {
          titleIdsAdded.push(titleId);
        }
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
          .set({ claimedAt: now, readAt: now })
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
        goldAdded: walletGoldTotal,
        bankedGoldAdded: bankedGoldTotal,
        itemsAdded: itemsToAdd,
        equipV2Added,
        materialsV2Added,
        instancesAdded: instancesApplied,
        recipesAdded,
        recipesSkipped,
        coinsAdded,
        museunCoinsAdded: museunCoinsTotal,
        museunCoins,
        cashItemsAdded: Array.from(museunCashItemTotals, ([itemId, count]) => ({
          itemId,
          count,
        })),
        cookingFoodsAdded: Array.from(cookingFoodTotals, ([itemId, count]) => ({
          itemId,
          count,
        })),
        fishSpecimensAdded: Array.from(fishSpecimenTotals, ([fishId, count]) => ({
          fishId,
          count,
        })),
        fishSpecimens: fishSpecimensAfter?.items ?? null,
        staminaPotionsAdded: staminaPotionsTotal,
        staminaPotions,
        adventureSupportDaysAdded: adventureSupportDaysApplied,
        adventureSupportActiveUntil,
        adventureSupportFirstActivation,
        titleIdsAdded,
        staminaAfterSupport,
        staminaMaxAfterSupport,
        newGold,
        newBankedGold,
        newInventory,
        newEquipmentOwned,
      };
    });

    if ("error" in result) {
      return new Response(result.error, { status: result.status });
    }
    return Response.json(result);
  } catch (e) {
    if (e instanceof TradeSuspendedError) return tradeSuspendedResponse(e);
    console.error("[marketplace.inbox.claim] ", e);
    return new Response("internal error", { status: 500 });
  }
}
