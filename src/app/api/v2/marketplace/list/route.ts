import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import { huntStageName } from "@/adventure/data/v2/dungeon";
import {
  RARE_MAP_KINDS,
  parseRareMaps,
} from "@/adventure/data/v2/rareMaps";
import {
  isMarketKind,
  isTradableMaterial,
  isValidBidGraceHours,
  isValidMaterialQty,
  isValidPrice,
  itemDisplayName,
  marketplaceEquipListError,
  marketplaceListingTimes,
  pauseMarketplaceRareMap,
  marketplaceSlotLimitForAdventureSupport,
  resolvePlayerName,
  type MarketKind,
} from "@/lib/server/marketplaceV2";
import { adventureSupportActive } from "@/adventure/data/v2/adventureSupport";
import {
  isTradeableMuseunCashItemId,
  removeMuseunCashItem,
} from "@/adventure/data/v2/museunCashItems";
import {
  isCookingFoodId,
  removeCookingFood,
} from "@/adventure/v2/cooking";
import {
  FISH_SPECIMEN_SAVE_KEY,
  fishIdFromSpecimenItemId,
  parseFishSpecimenInventory,
  removeFishSpecimen,
} from "@/adventure/v2/fishSpecimens";
import {
  matchMarketplaceBuyOrdersForItem,
  recordMarketplaceAutoMatchFills,
  triggerMarketplacePriceAlertsForListing,
} from "@/lib/server/marketplaceBuyOrdersV2";

// POST /api/v2/marketplace/list — 매물 등록(에스크로: 내 save 에서 빼서 listing 으로 묶음).
//   body(장비):   { kind:"equip", iid:string, price:int }
//   body(재료):   { kind:"material", itemId:string, quantity:int, price:int }
//   body(소모품): { kind:"consumable", iid:string, price:int } — 레어맵 개체
//                 { kind:"consumable", itemId:string, quantity:int, price:int } — 캐시/음식 스택
// 활성 매물 슬롯 상한 체크. 장비=미강화·미장착·미잠금 개체만. 가격은 정수 [1, 999,999,999].

type CharSave = {
  gold?: number;
  materials?: Record<string, number>;
  rareMaps?: unknown;
  cashItems?: unknown;
  [k: string]: unknown;
};

type InventorySave = Record<string, unknown> & {
  cookingFoods?: unknown;
};

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:list",
    userLimit: 40,
    ipLimit: 240,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: {
    kind?: unknown;
    iid?: unknown;
    itemId?: unknown;
    quantity?: unknown;
    price?: unknown;
    graceHours?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }

  if (!isMarketKind(body.kind)) return bad("bad_kind");
  const kind: MarketKind = body.kind;
  if (!isValidPrice(body.price)) return bad("bad_price");
  if (!isValidBidGraceHours(body.graceHours)) return bad("bad_grace_hours");
  const price = body.price;
  const createdAt = new Date();
  const listingTimes = marketplaceListingTimes(createdAt, body.graceHours);
  const listingWindow = { createdAt, ...listingTimes };

  const result = await db.transaction(async (tx) => {
    // 판매자 직렬화 — character.v2 를 먼저 잠가 동시 list 요청이 슬롯 상한을 우회하지 못하게 한다
    //   (같은 seller 의 모든 list 가 이 단일 행으로 순서화). 잠금 순서 character.v2 → equipment.v2
    //   는 buy·sell-bulk 와 일관(데드락 회피). material 경로는 이 charSave 를 그대로 씀.
    const charSave = await lockSaveForUpdate<CharSave>(tx, userId, "character.v2", {});
    const slotLimit = marketplaceSlotLimitForAdventureSupport(
      adventureSupportActive(charSave.adventureSupport),
    );

    // 슬롯 상한 — 활성 매물 수(seller 락 이후라 동시 요청 직렬화됨 = 엄격).
    const [{ c: activeCount }] = await tx
      .select({ c: count() })
      .from(marketplaceListingsV2)
      .where(
        and(
          eq(marketplaceListingsV2.sellerId, userId),
          eq(marketplaceListingsV2.status, "active"),
        ),
      );
    if (activeCount >= slotLimit) {
      return {
        status: 400,
        body: { ok: false as const, error: "slot_full", slotLimit },
      };
    }

    const sellerName = (await resolvePlayerName(tx, userId)) ?? "이름없음";

    if (kind === "equip") {
      if (typeof body.iid !== "string") return { status: 400, body: { ok: false as const, error: "bad_iid" } };
      const iid = body.iid;
      const equipSave = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const { owned, equipped } = parseEquipmentSave(equipSave);
      const inst = owned.find((i) => i.iid === iid);
      if (!inst) return { status: 400, body: { ok: false as const, error: "not_owned" } };
      const isEquipped = Object.values(equipped).includes(iid);
      const listError = marketplaceEquipListError(inst, isEquipped);
      if (listError) {
        return { status: 400, body: { ok: false as const, error: listError } };
      }

      // 에스크로 — owned 에서 제거.
      const nextOwned = owned.filter((i) => i.iid !== iid);
      await upsertSave(tx, userId, "equipment.v2", { owned: nextOwned, equipped });

      const [row] = await tx
        .insert(marketplaceListingsV2)
        .values({
          ...listingWindow,
          sellerId: userId,
          sellerName,
          kind: "equip",
          itemId: inst.id,
          itemName: itemDisplayName("equip", inst.id) ?? inst.id,
          quantity: 1,
          price,
          // roll 스냅샷(iid 제외) — 구매 시 새 개체로 복원. roll 없으면 null.
          // 굴림 + 제작품질 + 제작자 표식을 한 payload 에 — 옛 행은 raw roll 객체(권위 파스가 양형 흡수).
          instancePayload:
            inst.roll || inst.craftQuality || inst.craftedBy || inst.stormRefined
              ? {
                  ...(inst.roll ?? {}),
                  ...(inst.craftQuality ? { craftQuality: inst.craftQuality } : {}),
                  ...(inst.craftedBy ? { craftedBy: inst.craftedBy } : {}),
                  ...(inst.stormRefined ? { stormRefined: true } : {}),
                }
              : null,
        })
        .returning({ id: marketplaceListingsV2.id });
      return {
        status: 200,
        log: {
          listingId: row.id,
          itemKind: "equip",
          itemId: inst.id,
          quantity: 1,
          price,
        },
        body: { ok: true as const, listingId: row.id },
      };
    }

    if (kind === "consumable") {
      const specimenFishId =
        typeof body.itemId === "string"
          ? fishIdFromSpecimenItemId(body.itemId)
          : null;
      if (specimenFishId) {
        if (!isValidMaterialQty(body.quantity)) {
          return {
            status: 400,
            body: { ok: false as const, error: "bad_quantity" },
          };
        }
        const itemId = body.itemId as string;
        const quantity = body.quantity;
        const specimens = parseFishSpecimenInventory(
          await lockSaveForUpdate(
            tx,
            userId,
            FISH_SPECIMEN_SAVE_KEY,
            {},
          ),
        );
        const nextSpecimens = removeFishSpecimen(
          specimens,
          specimenFishId,
          quantity,
        );
        if (!nextSpecimens) {
          return {
            status: 400,
            body: { ok: false as const, error: "not_owned" },
          };
        }
        await upsertSave(
          tx,
          userId,
          FISH_SPECIMEN_SAVE_KEY,
          nextSpecimens,
        );
        const [row] = await tx
          .insert(marketplaceListingsV2)
          .values({
            ...listingWindow,
            sellerId: userId,
            sellerName,
            kind: "consumable",
            itemId,
            itemName: itemDisplayName("consumable", itemId) ?? itemId,
            quantity,
            price,
            instancePayload: { kind: "fish_specimen", fishId: specimenFishId },
          })
          .returning({ id: marketplaceListingsV2.id });
        const autoMatchFills =
          body.graceHours === 0
            ? await matchMarketplaceBuyOrdersForItem(
                tx,
                "consumable",
                itemId,
                createdAt,
              )
            : [];
        if (body.graceHours === 0) {
          await triggerMarketplacePriceAlertsForListing(tx, row.id, createdAt);
        }
        return {
          status: 200,
          autoMatchFills,
          log: {
            listingId: row.id,
            itemKind: "consumable",
            itemId,
            quantity,
            price,
          },
          body: { ok: true as const, listingId: row.id },
        };
      }

      if (isTradeableMuseunCashItemId(body.itemId)) {
        if (!isValidMaterialQty(body.quantity)) {
          return {
            status: 400,
            body: { ok: false as const, error: "bad_quantity" },
          };
        }
        const itemId = body.itemId;
        const quantity = body.quantity;
        const cashItems = removeMuseunCashItem(
          charSave.cashItems,
          itemId,
          quantity,
        );
        if (!cashItems) {
          return {
            status: 400,
            body: { ok: false as const, error: "not_owned" },
          };
        }
        await upsertSave(tx, userId, "character.v2", {
          ...charSave,
          cashItems,
        });
        const [row] = await tx
          .insert(marketplaceListingsV2)
          .values({
            ...listingWindow,
            sellerId: userId,
            sellerName,
            kind: "consumable",
            itemId,
            itemName: itemDisplayName("consumable", itemId) ?? itemId,
            quantity,
            price,
            instancePayload: { kind: "museun_cash_item" },
          })
          .returning({ id: marketplaceListingsV2.id });
        const autoMatchFills =
          body.graceHours === 0
            ? await matchMarketplaceBuyOrdersForItem(
                tx,
                "consumable",
                itemId,
                createdAt,
              )
            : [];
        if (body.graceHours === 0) {
          await triggerMarketplacePriceAlertsForListing(tx, row.id, createdAt);
        }
        return {
          status: 200,
          autoMatchFills,
          log: {
            listingId: row.id,
            itemKind: "consumable",
            itemId,
            quantity,
            price,
          },
          body: { ok: true as const, listingId: row.id },
        };
      }

      if (isCookingFoodId(body.itemId)) {
        if (!isValidMaterialQty(body.quantity)) {
          return {
            status: 400,
            body: { ok: false as const, error: "bad_quantity" },
          };
        }
        const itemId = body.itemId;
        const quantity = body.quantity;
        const inventory = await lockSaveForUpdate<InventorySave>(
          tx,
          userId,
          "inventory.v2",
          {},
        );
        const cookingFoods = removeCookingFood(
          inventory.cookingFoods,
          itemId,
          quantity,
        );
        if (!cookingFoods) {
          return {
            status: 400,
            body: { ok: false as const, error: "not_owned" },
          };
        }
        await upsertSave(tx, userId, "inventory.v2", {
          ...inventory,
          cookingFoods,
        });
        const [row] = await tx
          .insert(marketplaceListingsV2)
          .values({
            ...listingWindow,
            sellerId: userId,
            sellerName,
            kind: "consumable",
            itemId,
            itemName: itemDisplayName("consumable", itemId) ?? itemId,
            quantity,
            price,
            instancePayload: { kind: "cooking_food" },
          })
          .returning({ id: marketplaceListingsV2.id });
        const autoMatchFills =
          body.graceHours === 0
            ? await matchMarketplaceBuyOrdersForItem(
                tx,
                "consumable",
                itemId,
                createdAt,
              )
            : [];
        if (body.graceHours === 0) {
          await triggerMarketplacePriceAlertsForListing(tx, row.id, createdAt);
        }
        return {
          status: 200,
          autoMatchFills,
          log: {
            listingId: row.id,
            itemKind: "consumable",
            itemId,
            quantity,
            price,
          },
          body: { ok: true as const, listingId: row.id },
        };
      }

      // 레어맵 개체 — character.v2.rareMaps 에서 에스크로(판수 소진/불량은 parse 가 걸러
      // not_owned 처리, 시간 만료는 폐지). payload 에 개체 통째 스냅샷(판수 유지).
      if (typeof body.iid !== "string") {
        return { status: 400, body: { ok: false as const, error: "bad_iid" } };
      }
      const iid = body.iid;
      const maps = parseRareMaps(charSave.rareMaps, Date.now());
      const inst = maps.find((m) => m.iid === iid);
      if (!inst) {
        return { status: 400, body: { ok: false as const, error: "not_owned" } };
      }
      if (inst.kind === "secret_shop_map" || inst.kind === "rename_map") {
        return {
          status: 400,
          body: { ok: false as const, error: "not_tradable" },
        };
      }
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        rareMaps: maps.filter((m) => m.iid !== iid),
      });
      const kindName = RARE_MAP_KINDS[inst.kind].name;
      const [row] = await tx
        .insert(marketplaceListingsV2)
        .values({
          ...listingWindow,
          sellerId: userId,
          sellerName,
          kind: "consumable",
          itemId: inst.kind,
          // 내부 깊이는 payload에 보존하고, 둘러보기에는 3단계 사냥터명을 보여준다.
          itemName: `${kindName} (${huntStageName(inst.depth)})`,
          quantity: 1,
          price,
          instancePayload: pauseMarketplaceRareMap(inst, createdAt.getTime()),
        })
        .returning({ id: marketplaceListingsV2.id });
      return {
        status: 200,
        log: {
          listingId: row.id,
          itemKind: "consumable",
          itemId: inst.kind,
          quantity: 1,
          price,
        },
        body: { ok: true as const, listingId: row.id },
      };
    }

    // material
    if (typeof body.itemId !== "string" || !isTradableMaterial(body.itemId)) {
      return { status: 400, body: { ok: false as const, error: "not_tradable" } };
    }
    if (!isValidMaterialQty(body.quantity)) {
      return { status: 400, body: { ok: false as const, error: "bad_quantity" } };
    }
    const itemId = body.itemId;
    const quantity = body.quantity;
    // charSave 는 tx 시작 시 이미 잠금·읽음(seller 직렬화 겸용) — 재read 불필요.
    const mats = { ...(charSave.materials ?? {}) };
    const have = Math.max(0, Math.floor(mats[itemId] ?? 0));
    if (have < quantity) {
      return { status: 400, body: { ok: false as const, error: "insufficient_material" } };
    }
    const left = have - quantity;
    if (left > 0) mats[itemId] = left;
    else delete mats[itemId];
    await upsertSave(tx, userId, "character.v2", { ...charSave, materials: mats });

    const [row] = await tx
      .insert(marketplaceListingsV2)
      .values({
        ...listingWindow,
        sellerId: userId,
        sellerName,
        kind: "material",
        itemId,
        itemName: itemDisplayName("material", itemId) ?? itemId,
        quantity,
        price,
        instancePayload: null,
      })
      .returning({ id: marketplaceListingsV2.id });
    const autoMatchFills =
      body.graceHours === 0
        ? await matchMarketplaceBuyOrdersForItem(
            tx,
            "material",
            itemId,
            createdAt,
          )
        : [];
    if (body.graceHours === 0) {
      await triggerMarketplacePriceAlertsForListing(tx, row.id, createdAt);
    }
    return {
      status: 200,
      autoMatchFills,
      log: {
        listingId: row.id,
        itemKind: "material",
        itemId,
        quantity,
        price,
      },
      body: { ok: true as const, listingId: row.id },
    };
  });

  const economyLog = result.status === 200 && "log" in result ? result.log : null;
  if (economyLog) {
    recordEconomyEventSoon({
      userId,
      eventType: "marketplace.list",
      goldDelta: 0,
      itemKind: economyLog.itemKind,
      itemId: economyLog.itemId,
      quantity: economyLog.quantity,
      detail: {
        listingId: economyLog.listingId,
        price: economyLog.price,
      },
    });
  }
  if (result.status === 200 && "autoMatchFills" in result) {
    recordMarketplaceAutoMatchFills(result.autoMatchFills ?? []);
  }

  return Response.json(result.body, { status: result.status });
}
