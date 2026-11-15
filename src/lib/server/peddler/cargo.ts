// 행상에 싣는 품목의 보유량 조회·차감과 교환 품목 지급. 종류마다 보관 세이브가 다르다.
//   material → character.v2.materials      farm → farm.v2.inventory
//   fish     → fishing-stock.v1.items      dish → inventory.v2.cookingFoods
// 차감과 지급은 해당 키만 바꾸고 세이브의 나머지 필드는 그대로 둔다(파싱·정규화로 다른 값이 바뀌지 않게).

import "server-only";

import { cookingFoodDefinition } from "@/adventure/v2/cooking/food";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import { FISHING_STOCK_KEY } from "@/adventure/v2/fishingStock";
import { peddlerCargoItemName } from "@/adventure/v2/peddlerCargoNames";
import {
  PEDDLER_CARGO_ITEMS,
  PEDDLER_CARGO_KIND_LIMIT,
  PEDDLER_DISH_CARGO_PREFIX,
  PEDDLER_DISH_POINTS_BY_TIER,
  peddlerCargoItem,
  type PeddlerCargoGroup,
  type PeddlerShopItem,
} from "@/adventure/v2/peddlerRules";
import { lockSaveForUpdate, upsertSave, type DbExecutor } from "@/lib/server/savesKv";

type SaveRecord = Record<string, unknown>;
export type PeddlerCargoSourceKind = "material" | "farm" | "fish" | "dish";

/** 잠그는 순서이기도 하다(주방 라우트와 같은 순서). */
const SOURCE_ORDER: readonly PeddlerCargoSourceKind[] = ["material", "farm", "fish", "dish"];

export const PEDDLER_ITEM_SAVE_KEYS: Record<PeddlerCargoSourceKind, string> = {
  material: "character.v2",
  farm: FARM_SAVE_KEY,
  fish: FISHING_STOCK_KEY,
  dish: "inventory.v2",
};

const BUCKET_FIELD: Record<PeddlerCargoSourceKind, string> = {
  material: "materials",
  farm: "inventory",
  fish: "items",
  dish: "cookingFoods",
};

const MAX_QUANTITY = 999_999;

function record(value: unknown): SaveRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as SaveRecord) : {};
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export type PeddlerCargoEntry = {
  id: string;
  source: PeddlerCargoSourceKind;
  sourceItemId: string;
  group: PeddlerCargoGroup;
  name: string;
  /** 개당 적재 점수. */
  points: number;
};

export type PeddlerCargoLine = PeddlerCargoEntry & { quantity: number };
export type PeddlerCargoHolding = PeddlerCargoEntry & { held: number };

function dishEntry(foodId: string): PeddlerCargoEntry | null {
  const definition = cookingFoodDefinition(foodId);
  if (!definition) return null;
  return {
    id: `${PEDDLER_DISH_CARGO_PREFIX}${foodId}`,
    source: "dish",
    sourceItemId: foodId,
    group: "dish",
    name: definition.name,
    points: PEDDLER_DISH_POINTS_BY_TIER[definition.recipe.tier],
  };
}

function cargoEntry(id: string): PeddlerCargoEntry | null {
  if (id.startsWith(PEDDLER_DISH_CARGO_PREFIX)) return dishEntry(id.slice(PEDDLER_DISH_CARGO_PREFIX.length));
  const item = peddlerCargoItem(id);
  return item
    ? {
        id: item.id,
        source: item.source,
        sourceItemId: item.sourceItemId,
        group: item.group,
        name: peddlerCargoItemName(item),
        points: item.points,
      }
    : null;
}

/** 요청의 `{ 품목 id: 수량 }`을 검증해 줄로 바꾼다. 하나라도 잘못되면 null. */
export function parsePeddlerCargo(raw: unknown): PeddlerCargoLine[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0 || entries.length > PEDDLER_CARGO_KIND_LIMIT) return null;
  const lines: PeddlerCargoLine[] = [];
  for (const [id, quantity] of entries) {
    const entry = cargoEntry(id);
    if (
      !entry ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
    ) {
      return null;
    }
    lines.push({ ...entry, quantity });
  }
  return lines;
}

export type PeddlerItemSaves = Record<PeddlerCargoSourceKind, unknown>;

/** 실을 수 있는 품목 중 가진 것. 고정 품목은 표 순서, 요리는 티어·이름 순서로 뒤에 붙인다. */
export function peddlerCargoHoldings(saves: PeddlerItemSaves): PeddlerCargoHolding[] {
  const bucket = (source: PeddlerCargoSourceKind) => record(record(saves[source])[BUCKET_FIELD[source]]);
  const holdings: PeddlerCargoHolding[] = [];
  for (const item of PEDDLER_CARGO_ITEMS) {
    const held = count(bucket(item.source)[item.sourceItemId]);
    if (held <= 0) continue;
    holdings.push({ ...cargoEntry(item.id)!, held });
  }
  const dishes: PeddlerCargoHolding[] = [];
  for (const [foodId, raw] of Object.entries(bucket("dish"))) {
    const held = count(raw);
    const entry = held > 0 ? dishEntry(foodId) : null;
    if (entry) dishes.push({ ...entry, held });
  }
  dishes.sort((a, b) => a.points - b.points || a.name.localeCompare(b.name, "ko"));
  return [...holdings, ...dishes];
}

/** 짐을 차감한다. 하나라도 모자라면 아무것도 쓰지 않고 false. 호출부가 사용자 행을 먼저 잠근다. */
export async function consumePeddlerCargo(
  tx: DbExecutor,
  userId: string,
  lines: readonly PeddlerCargoLine[],
): Promise<boolean> {
  const writes: { key: string; value: SaveRecord }[] = [];
  for (const source of SOURCE_ORDER) {
    const sourceLines = lines.filter((line) => line.source === source);
    if (sourceLines.length === 0) continue;
    const key = PEDDLER_ITEM_SAVE_KEYS[source];
    const save = record(await lockSaveForUpdate(tx, userId, key, {}));
    const bucket = { ...record(save[BUCKET_FIELD[source]]) };
    for (const line of sourceLines) {
      const remaining = count(bucket[line.sourceItemId]) - line.quantity;
      if (remaining < 0) return false;
      if (remaining > 0) bucket[line.sourceItemId] = remaining;
      else delete bucket[line.sourceItemId];
    }
    writes.push({ key, value: { ...save, [BUCKET_FIELD[source]]: bucket } });
  }
  for (const write of writes) await upsertSave(tx, userId, write.key, write.value);
  return true;
}

/** 지급 대상 세이브를 먼저 잠그고, 행상 세이브 검증이 끝난 뒤 실행할 쓰기를 돌려준다. */
export async function lockPeddlerShopGrant(
  tx: DbExecutor,
  userId: string,
  item: PeddlerShopItem,
  quantity: number,
): Promise<() => Promise<unknown>> {
  const source: PeddlerCargoSourceKind = item.output.kind;
  const key = PEDDLER_ITEM_SAVE_KEYS[source];
  const save = record(await lockSaveForUpdate(tx, userId, key, {}));
  const bucket = record(save[BUCKET_FIELD[source]]);
  const itemId = item.output.itemId;
  return () =>
    upsertSave(tx, userId, key, {
      ...save,
      [BUCKET_FIELD[source]]: { ...bucket, [itemId]: count(bucket[itemId]) + item.output.count * quantity },
    });
}
