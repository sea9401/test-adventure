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
  staminaOverchargeCap,
} from "@/adventure/v2/stamina";
import {
  HUNT_COOLDOWN_MODE,
  V2_CORE_LOOP_V2,
  spendGold,
} from "@/adventure/data/v2/coreLoopConfig";

// 스태미나가 실제로 폐지된 모드(쿨다운 모드)일 때만 스태미나 상품을 목록/구매에서 제외한다.
//   라이브처럼 스태미나를 쓰는 모드면 정상 판매. HUNT_COOLDOWN_MODE = V2_CORE_LOOP_V2 &&
//   !V2_HUNT_USE_STAMINA (옛 V2_CORE_LOOP_V2 단독 게이트는 스태미나 모드서도 잘못 숨겼음).
const STAMINA_SHOP_ITEMS = new Set(["stamina_potion", "stamina_cap_tonic"]);

// 비밀 상점 — 「비밀 상점 초대장」 보유자만. 품목당 1회(초대장 bought[]), 전 품목
// 구매 시 초대장 소진(runsLeft 0 → parse purge).
//
// GET  ?map=<iid>            → { ok, stock:[{..., bought}], gold }
// POST { map, itemId }       → 구매. 골드 차감 + 효과 적용 + bought 마킹.
// DELETE { map }             → 남은 품목 포기 + 초대장 소진.
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
  const m =
    iid.length > 0
      ? (maps.find((x) => x.iid === iid) ?? null)
      : (maps.find((x) => x.kind === "secret_shop_map") ?? null);
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
    map: map.iid,
    gold: Math.max(0, Math.floor(save?.gold ?? 0)),
    ...(V2_CORE_LOOP_V2
      ? { bankedGold: Math.max(0, Math.floor(Number(save?.bankedGold) || 0)) }
      : {}),
    stock: SECRET_SHOP_STOCK.filter(
      (i) => !(HUNT_COOLDOWN_MODE && STAMINA_SHOP_ITEMS.has(i.id)),
    ).map((i) => ({ ...i, bought: bought.has(i.id) })),
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
  // 쿨다운 모드(스태미나 폐지)에서만 스태미나 상품 구매 차단(목록서도 빠지지만 직접 호출 방어).
  if (HUNT_COOLDOWN_MODE && STAMINA_SHOP_ITEMS.has(item.id)) {
    return Response.json(
      { ok: false, error: "item_unavailable" },
      { status: 400 },
    );
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
    const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
    const spend = spendGold(gold, bankedGold, item.price);
    if (!spend.ok) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_gold" },
      };
    }

    // 구매 마킹 — 전 품목 구매 시 초대장 소진(runsLeft 0 → parse 가 purge).
    //   쿨다운 모드면 스태미나 상품은 구매 불가라 "전 품목"에서 제외(아니면 영영 소진 안 됨).
    const nextBought = [...bought, item.id];
    const buyableStock = SECRET_SHOP_STOCK.filter(
      (i) => !(HUNT_COOLDOWN_MODE && STAMINA_SHOP_ITEMS.has(i.id)),
    );
    const allBought = buyableStock.every((i) => nextBought.includes(i.id));
    const nextMaps = maps
      .map((m) =>
        m.iid === map.iid
          ? { ...m, bought: nextBought, ...(allBought ? { runsLeft: 0 } : {}) }
          : m,
      )
      .filter((m) => m.runsLeft > 0);

    let nextChar: CharSave = {
      ...charSave,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
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
      const cap = staminaOverchargeCap(max);
      const cur = applyRegen(parseStaminaFromSave(charSave.stamina, now), now, max);
      nextChar = {
        ...nextChar,
        stamina: {
          // 소모품 포션과 동일 — 최대치를 넘겨 비축(overcharge), 단 상한(cap)까지만.
          //   max-guard: 이미 cap 이상(레거시)이면 줄이지 않음(min(cap,…) 단독은 깎음).
          current: Math.max(
            cur.current,
            Math.min(cap, cur.current + STAMINA_POTION_AMOUNT),
          ),
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
        map: map.iid,
        gold: nextChar.gold as number,
        ...(V2_CORE_LOOP_V2
          ? { bankedGold: nextChar.bankedGold as number }
          : {}),
        mapConsumed: allBought,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}

export async function DELETE(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { map?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const iid = typeof body.map === "string" ? body.map : "";
  if (!iid) {
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
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      rareMaps: maps.filter((m) => m.iid !== map.iid),
    });
    return {
      status: 200,
      body: { ok: true as const, map: map.iid, mapConsumed: true },
    };
  });

  return Response.json(result.body, { status: result.status });
}
