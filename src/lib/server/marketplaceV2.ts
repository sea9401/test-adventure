// v2 거래소 — 순수 헬퍼 + 상수. DB 트랜잭션은 라우트(/api/v2/marketplace/*)가 보유.
//   장비 개체(instance) + 재료(스택) 거래. 고정가 등록 → 선착순 구매. 판매세(골드 sink).
//   V1 marketplace.ts(grade·V1 인벤 모델)와 무관 — v2 전용.

import { and, eq } from "drizzle-orm";
import { savesKv, users } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import { V2_EQUIPMENT, type V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS, type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";

// ── 다이얼 ──────────────────────────────────────────────────────────────────
// 판매세 — 판매 성사 시 대금의 이 비율이 소각(골드 sink). 판매자는 (대금 − 세금) 수령.
//   골드가 HP 회복 통화라 sink 없으면 거래소는 유저 간 골드 재분배만 됨 → 인플레 억제용. 단일 다이얼.
export const MARKETPLACE_V2_TAX_RATE = 0.05;
// 판매자당 활성 매물 상한(슬롯).
export const MARKETPLACE_V2_SLOT_LIMIT = 10;
export const MARKETPLACE_V2_PRICE_MIN = 1;
export const MARKETPLACE_V2_PRICE_MAX = 999_999_999; // < 2^31 — integer 컬럼 안전.
// 재료 1매물 최대 수량.
export const MARKETPLACE_V2_MATERIAL_QTY_MAX = 9999;
// 둘러보기 1회 최대 반환 행.
export const MARKETPLACE_V2_BROWSE_LIMIT = 100;
// 시세 — 최근 며칠간 판매 완료(sold) 기록을 종목별 집계. 가격 판단 참고용.
export const MARKETPLACE_V2_PRICE_HISTORY_DAYS = 30;
// 매물 만료 — 등록 후 이 일수가 지나면 cron 이 만료(status='expired') + 판매자에게 아이템 반환.
//   묵은 매물이 영원히 쌓여 둘러보기 한도(100)를 밀어내는 것 방지. 단일 다이얼.
export const MARKETPLACE_V2_LISTING_TTL_DAYS = 7;

export type MarketKind = "equip" | "material";

// 판매자 수령 골드 — 대금 − 판매세(내림). proceeds + 소각분 = price (보존, 골드 신규생성 0).
export function saleProceeds(price: number): number {
  return Math.floor(price * (1 - MARKETPLACE_V2_TAX_RATE));
}
// 소각되는 판매세(표시·감사용) = price − proceeds.
export function saleTax(price: number): number {
  return price - saleProceeds(price);
}

export function isValidPrice(p: unknown): p is number {
  return (
    typeof p === "number" &&
    Number.isInteger(p) &&
    p >= MARKETPLACE_V2_PRICE_MIN &&
    p <= MARKETPLACE_V2_PRICE_MAX
  );
}

export function isValidMaterialQty(q: unknown): q is number {
  return (
    typeof q === "number" &&
    Number.isInteger(q) &&
    q >= 1 &&
    q <= MARKETPLACE_V2_MATERIAL_QTY_MAX
  );
}

export function isMarketKind(s: unknown): s is MarketKind {
  return s === "equip" || s === "material";
}

// 거래 가능 종류 판정 — 카탈로그에 실재하는 id 인지(타입 가드 겸).
export function isTradableEquip(id: string): id is V2EquipmentId {
  return Object.prototype.hasOwnProperty.call(V2_EQUIPMENT, id);
}
export function isTradableMaterial(id: string): id is V2MaterialId {
  return Object.prototype.hasOwnProperty.call(V2_MATERIALS, id);
}

// 등록 시점 이름 스냅샷용 — 카탈로그 표시명.
export function itemDisplayName(kind: MarketKind, id: string): string | null {
  if (kind === "equip") return isTradableEquip(id) ? V2_EQUIPMENT[id].name : null;
  return isTradableMaterial(id) ? V2_MATERIALS[id].name : null;
}

// 플레이어 표시 이름 — dual-source: users.gameName(권위) → character-profile.v2.name(레거시).
//   없으면 null. (inbox/send 의 resolveSenderName 과 동일 규약.)
export async function resolvePlayerName(
  executor: DbExecutor,
  userId: string,
): Promise<string | null> {
  const [u] = await executor
    .select({ name: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (typeof u?.name === "string" && u.name.length > 0) return u.name;
  const [profile] = await executor
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(
      and(eq(savesKv.userId, userId), eq(savesKv.key, "character-profile.v2")),
    )
    .limit(1);
  const legacy = (profile?.value as { name?: unknown } | undefined)?.name;
  if (typeof legacy === "string" && legacy.length > 0) return legacy;
  return null;
}
