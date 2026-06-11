import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  parseRareMaps,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";
import {
  SECRET_SHOP_ITEM_BY_ID,
  SECRET_SHOP_STOCK,
  STAMINA_CAP_TONIC_BONUS,
  STAMINA_POTION_AMOUNT,
} from "@/adventure/data/v2/secretShop";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { MAX_CHARGE } from "@/lib/v2-charge-config";
import {
  MAX_STAMINA,
  applyRegen,
  parseStaminaFromSave,
  staminaCapBonusOf,
} from "@/adventure/v2/stamina";

// 비밀 상점 — 「비밀 상점의 지도」 보유자만. 품목당 1회(지도 bought[]), 전 품목
// 구매 시 지도 소진(runsLeft 0 → parse purge).
//
// GET  ?map=<iid>            → { ok, stock:[{..., bought}], gold }
// POST { map, itemId }       → 구매. 골드 차감 + 효과 적용 + bought 마킹.
//
// 효과 적용처: 강화석=character.v2.materials / 충전약=inventory.v2 /
// 스태미나 회복약=character.v2.stamina(즉시, per-user 최대치 캡) /
// 한계의 비약=character.v2.staminaCapBonus(영구 누적).

type CharSave = {
  gold?: number;
  materials?: unknown;
  rareMaps?: unknown;
  stamina?: unknown;
  staminaCapBonus?: unknown;
  [k: string]: unknown;
};

function findShopMap(
  maps: RareMapInstance[],
  iid: string,
): RareMapInstance | null {
  const m = maps.find((x) => x.iid === iid) ?? null;
  return m && m.kind === "secret_shop_map" ? m : null;
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const iid = new URL(req.url).searchParams.get("map") ?? "";
  const save = await readSave<CharSave | null>(db, userId, "character.v2", null);
  const maps = parseRareMaps(save?.rareMaps, Date.now());
  const map = findShopMap(maps, iid);
  if (!map) {
    return Response.json({ ok: false, error: "no_map" }, { status: 403 });
  }
  const bought = new Set(map.bought ?? []);
  return Response.json({
    ok: true,
    gold: Math.max(0, Math.floor(save?.gold ?? 0)),
    expiresAt: map.expiresAt,
    stock: SECRET_SHOP_STOCK.map((i) => ({ ...i, bought: bought.has(i.id) })),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { map?: unknown; itemId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const iid = typeof body.map === "string" ? body.map : "";
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const item = SECRET_SHOP_ITEM_BY_ID.get(itemId);
  if (!iid || !item) {
    return Response.json({ ok: false, error: "bad_intent" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const now = Date.now();
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const maps = parseRareMaps(charSave.rareMaps, now);
    const map = findShopMap(maps, iid);
    if (!map) {
      return { status: 403, body: { ok: false as const, error: "no_map" } };
    }
    const bought = map.bought ?? [];
    if (bought.includes(item.id)) {
      return {
        status: 400,
        body: { ok: false as const, error: "already_bought" },
      };
    }
    const gold = Math.max(0, Math.floor(charSave.gold ?? 0));
    if (gold < item.price) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_gold" },
      };
    }

    // 구매 마킹 — 전 품목 구매 시 지도 소진(runsLeft 0 → parse 가 purge).
    const nextBought = [...bought, item.id];
    const allBought = SECRET_SHOP_STOCK.every((i) => nextBought.includes(i.id));
    const nextMaps = maps
      .map((m) =>
        m.iid === map.iid
          ? { ...m, bought: nextBought, ...(allBought ? { runsLeft: 0 } : {}) }
          : m,
      )
      .filter((m) => m.runsLeft > 0);

    let nextChar: CharSave = {
      ...charSave,
      gold: gold - item.price,
      rareMaps: nextMaps,
    };

    // 효과 적용
    if (item.id === "stone_red" || item.id === "stone_blue") {
      const matId =
        item.id === "stone_red"
          ? ENHANCE_STONE_MATERIAL_ID.red
          : ENHANCE_STONE_MATERIAL_ID.blue;
      nextChar = {
        ...nextChar,
        materials: mergeDrops(charSave.materials, { [matId]: 1 }),
      };
    } else if (item.id === "stamina_potion") {
      const max =
        MAX_STAMINA + staminaCapBonusOf(charSave.staminaCapBonus);
      const cur = applyRegen(parseStaminaFromSave(charSave.stamina, now), now, max);
      nextChar = {
        ...nextChar,
        stamina: {
          current: Math.min(max, cur.current + STAMINA_POTION_AMOUNT),
          lastUpdatedAt: cur.lastUpdatedAt,
        },
      };
    } else if (item.id === "stamina_cap_tonic") {
      nextChar = {
        ...nextChar,
        staminaCapBonus:
          staminaCapBonusOf(charSave.staminaCapBonus) + STAMINA_CAP_TONIC_BONUS,
      };
    }
    await upsertSave(tx, userId, "character.v2", nextChar);

    // 충전약 완충 — inventory.v2 (락 순서 character → inventory, dev grant 와 동일).
    if (item.id === "hp_charge_pack" || item.id === "mp_charge_pack") {
      const inv = await lockSaveForUpdate<{
        hpCharges?: number;
        mpCharges?: number;
        [k: string]: unknown;
      }>(tx, userId, "inventory.v2", {});
      const key = item.id === "hp_charge_pack" ? "hpCharges" : "mpCharges";
      await upsertSave(tx, userId, "inventory.v2", {
        ...inv,
        [key]: MAX_CHARGE,
      });
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        itemId: item.id,
        gold: nextChar.gold as number,
        mapConsumed: allBought,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
