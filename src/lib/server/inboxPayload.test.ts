import { describe, expect, it } from "vitest";
import {
  inboxValues,
  isInboxPayloadKind,
  parseInboxPayload,
} from "./inboxPayload";

describe("isInboxPayloadKind", () => {
  it("승인된 10종 모두 true", () => {
    for (const k of [
      "sale_proceeds",
      "purchase_item",
      "cancel_return",
      "listing_expired",
      "user_message",
      "recipe_gift",
      "guild_invite",
      "guild_quest_reward",
      "season_reward",
      "admin_gift",
    ]) {
      expect(isInboxPayloadKind(k)).toBe(true);
    }
  });
  it("미등록 kind 는 false", () => {
    expect(isInboxPayloadKind("unknown")).toBe(false);
    expect(isInboxPayloadKind("")).toBe(false);
    expect(isInboxPayloadKind("SALE_PROCEEDS")).toBe(false);
  });
});

describe("parseInboxPayload — happy path", () => {
  it("sale_proceeds", () => {
    expect(parseInboxPayload("sale_proceeds", { gold: 1500 })).toEqual({
      kind: "sale_proceeds",
      gold: 1500,
    });
  });

  it("purchase_item (equip + grade)", () => {
    const r = parseInboxPayload("purchase_item", {
      item_kind: "equip",
      item_id: "baseball_bat",
      grade: "c1",
      quantity: 1,
    });
    expect(r).toEqual({
      kind: "purchase_item",
      item_kind: "equip",
      item_id: "baseball_bat",
      grade: "c1",
      quantity: 1,
    });
  });

  it("cancel_return (material, grade 누락 → base 로 fallback)", () => {
    const r = parseInboxPayload("cancel_return", {
      item_kind: "material",
      item_id: "spider_silk",
      quantity: 5,
    });
    expect(r).toEqual({
      kind: "cancel_return",
      item_kind: "material",
      item_id: "spider_silk",
      grade: "base",
      quantity: 5,
    });
  });

  it("listing_expired (recipe, quantity 0 허용)", () => {
    const r = parseInboxPayload("listing_expired", {
      item_kind: "recipe",
      item_id: "rec_sword",
      grade: "base",
      quantity: 0,
    });
    expect(r?.kind === "listing_expired" ? r.quantity : null).toBe(0);
  });

  it("user_message", () => {
    expect(parseInboxPayload("user_message", { text: "안녕" })).toEqual({
      kind: "user_message",
      text: "안녕",
    });
  });

  it("recipe_gift (recipe_name 누락 시 recipe_id 로 fallback)", () => {
    const r = parseInboxPayload("recipe_gift", { recipe_id: "rec_x" });
    expect(r).toEqual({
      kind: "recipe_gift",
      recipe_id: "rec_x",
      recipe_name: "rec_x",
    });
  });

  it("guild_invite", () => {
    const r = parseInboxPayload("guild_invite", {
      invite_id: 7,
      guild_id: 42,
      guild_name: "철의장막",
      expires_at: "2026-06-01T00:00:00Z",
    });
    expect(r).toEqual({
      kind: "guild_invite",
      invite_id: 7,
      guild_id: 42,
      guild_name: "철의장막",
      expires_at: "2026-06-01T00:00:00Z",
    });
  });

  it("guild_quest_reward (정상 + 오염된 항목 필터)", () => {
    const r = parseInboxPayload("guild_quest_reward", {
      quest_id: "q_slime",
      quest_name: "슬라임 토벌",
      gold: 300,
      materials: [
        { materialId: "slime_chunk", count: 5 },
        { materialId: "", count: 3 }, // 빈 id → 제외
        { count: 2 }, // 누락 → 제외
      ],
      items: [
        { itemId: "lucky_charm", count: 1 },
        "garbage", // 비-object → 제외
      ],
    });
    expect(r).toEqual({
      kind: "guild_quest_reward",
      quest_id: "q_slime",
      quest_name: "슬라임 토벌",
      gold: 300,
      materials: [{ materialId: "slime_chunk", count: 5 }],
      items: [{ itemId: "lucky_charm", count: 1 }],
    });
  });

  it("season_reward (rank 포함 — 투기장)", () => {
    expect(
      parseInboxPayload("season_reward", { season: "pvp", coins: 600, rank: 2 }),
    ).toEqual({ kind: "season_reward", season: "pvp", coins: 600, rank: 2 });
  });

  it("season_reward (rank 누락 — 낚시/보물 종합집계)", () => {
    expect(
      parseInboxPayload("season_reward", { season: "fishing", coins: 120 }),
    ).toEqual({ kind: "season_reward", season: "fishing", coins: 120 });
  });

  it("admin_gift (운영자 우편 — 골드만, 재료/장비는 빈 배열)", () => {
    expect(parseInboxPayload("admin_gift", { gold: 5000 })).toEqual({
      kind: "admin_gift",
      gold: 5000,
      materials: [],
      items: [],
      staminaPotions: 0,
    });
  });

  it("admin_gift (골드 + 재료 + 장비 + 스태미나 회복약)", () => {
    expect(
      parseInboxPayload("admin_gift", {
        gold: 1000,
        materials: [{ materialId: "iron_ore", count: 3 }],
        items: [{ itemId: "iron_sword", count: 2 }],
        staminaPotions: 4,
      }),
    ).toEqual({
      kind: "admin_gift",
      gold: 1000,
      materials: [{ materialId: "iron_ore", count: 3 }],
      items: [{ itemId: "iron_sword", count: 2 }],
      staminaPotions: 4,
    });
  });

  it("admin_gift (골드 0 + 장비만 — 재료/장비/소비템 우편 허용)", () => {
    expect(
      parseInboxPayload("admin_gift", {
        items: [{ itemId: "iron_sword", count: 1 }],
      }),
    ).toEqual({
      kind: "admin_gift",
      gold: 0,
      materials: [],
      items: [{ itemId: "iron_sword", count: 1 }],
      staminaPotions: 0,
    });
  });

  it("admin_gift (누락/음수 gold → 0, 잘못된 첨부 항목은 탈락)", () => {
    // 골드만 있던 구 페이로드 + 골드 없는 신 페이로드 모두 0/빈배열로 정규화.
    expect(parseInboxPayload("admin_gift", { gold: -5 })).toEqual({
      kind: "admin_gift",
      gold: 0,
      materials: [],
      items: [],
      staminaPotions: 0,
    });
    expect(parseInboxPayload("admin_gift", {})).toEqual({
      kind: "admin_gift",
      gold: 0,
      materials: [],
      items: [],
      staminaPotions: 0,
    });
    // count 0/음수, id 누락은 parseRewardMaterials/Items 가 걸러냄.
    expect(
      parseInboxPayload("admin_gift", {
        materials: [{ materialId: "iron_ore", count: 0 }, { count: 5 }],
        items: [{ itemId: "iron_sword", count: -1 }],
      }),
    ).toEqual({
      kind: "admin_gift",
      gold: 0,
      materials: [],
      items: [],
      staminaPotions: 0,
    });
  });
});

describe("parseInboxPayload — invalid → null", () => {
  it("미등록 kind", () => {
    expect(parseInboxPayload("evil_payload", { gold: 1 })).toBeNull();
  });
  it("payload null/비-object", () => {
    expect(parseInboxPayload("sale_proceeds", null)).toBeNull();
    expect(parseInboxPayload("sale_proceeds", 42)).toBeNull();
    expect(parseInboxPayload("user_message", "raw text")).toBeNull();
  });
  it("sale_proceeds gold 음수/문자열/누락", () => {
    expect(parseInboxPayload("sale_proceeds", { gold: -1 })).toBeNull();
    expect(parseInboxPayload("sale_proceeds", { gold: "100" })).toBeNull();
    expect(parseInboxPayload("sale_proceeds", {})).toBeNull();
  });
  it("purchase_item — 알 수 없는 item_kind", () => {
    expect(
      parseInboxPayload("purchase_item", {
        item_kind: "weapon", // 'equip' 아님
        item_id: "x",
        quantity: 1,
      }),
    ).toBeNull();
  });
  it("purchase_item — item_id/quantity 누락", () => {
    expect(
      parseInboxPayload("purchase_item", {
        item_kind: "equip",
        quantity: 1,
      }),
    ).toBeNull();
    expect(
      parseInboxPayload("purchase_item", {
        item_kind: "equip",
        item_id: "x",
      }),
    ).toBeNull();
  });
  it("purchase_item — 비유효 grade 는 'base' 로 fallback (잘못된 grade 자체는 거부 아님)", () => {
    const r = parseInboxPayload("purchase_item", {
      item_kind: "equip",
      item_id: "baseball_bat",
      grade: "rare", // 잘못된 grade
      quantity: 1,
    });
    expect(r).not.toBeNull();
    expect(r?.kind === "purchase_item" ? r.grade : null).toBe("base");
  });
  it("user_message — text 빈문자/누락", () => {
    expect(parseInboxPayload("user_message", { text: "" })).toBeNull();
    expect(parseInboxPayload("user_message", {})).toBeNull();
  });
  it("recipe_gift — recipe_id 누락", () => {
    expect(parseInboxPayload("recipe_gift", { recipe_name: "X" })).toBeNull();
  });
  it("guild_invite — id 가 string", () => {
    expect(
      parseInboxPayload("guild_invite", {
        invite_id: "7",
        guild_id: 42,
        guild_name: "X",
        expires_at: "2026-01-01T00:00:00Z",
      }),
    ).toBeNull();
  });
  it("season_reward — 잘못된 season / 음수 coins / 누락", () => {
    expect(
      parseInboxPayload("season_reward", { season: "arena", coins: 100 }),
    ).toBeNull(); // 미등록 season
    expect(
      parseInboxPayload("season_reward", { season: "pvp", coins: -5 }),
    ).toBeNull();
    expect(parseInboxPayload("season_reward", { season: "pvp" })).toBeNull();
    expect(parseInboxPayload("season_reward", { coins: 100 })).toBeNull();
  });
  // admin_gift 는 골드/재료/장비/소비템 누락을 0/빈배열로 정규화(null 아님) — 위 happy 블록에서 검증.
});

describe("inboxValues — drizzle .values() 호환 매핑", () => {
  it("payload.kind 를 컬럼 kind 로 빼고 나머지를 payload 로", () => {
    const v = inboxValues({
      userId: "u1",
      payload: { kind: "sale_proceeds", gold: 100 },
      message: "ok",
    });
    expect(v).toEqual({
      userId: "u1",
      kind: "sale_proceeds",
      payload: { gold: 100 },
      message: "ok",
    });
  });
  it("optional 필드 누락 시 그대로 비움 (undefined 키만 전달)", () => {
    const v = inboxValues({
      userId: "u1",
      payload: { kind: "user_message", text: "hi" },
    });
    expect(v.userId).toBe("u1");
    expect(v.kind).toBe("user_message");
    expect(v.payload).toEqual({ text: "hi" });
  });
});

describe("parseInboxPayload — 인스턴스 매물(instance)", () => {
  const validRing = {
    instanceId: "ring-1",
    itemId: "starlit_ring",
    enhancementLevel: 0,
    remainingAttempts: 0,
    rolledBonus: { str: 12, spd: 8 },
  };

  it("유효한 instance 는 normalizeInstance 통과해 carry", () => {
    const r = parseInboxPayload("purchase_item", {
      item_kind: "equip",
      item_id: "starlit_ring",
      grade: "base",
      quantity: 1,
      instance: validRing,
    });
    expect(r?.kind).toBe("purchase_item");
    expect((r as { instance?: unknown }).instance).toMatchObject({
      itemId: "starlit_ring",
      rolledBonus: { str: 12, spd: 8 },
    });
  });

  it("손상된 instance 는 payload 전체 null (claim 이 행 보존·소실 방지)", () => {
    // 롤이 범위 밖(21) → normalizeInstance drop → payload null.
    expect(
      parseInboxPayload("purchase_item", {
        item_kind: "equip",
        item_id: "starlit_ring",
        grade: "base",
        quantity: 1,
        instance: { ...validRing, rolledBonus: { str: 21, spd: 8 } },
      }),
    ).toBeNull();
  });

  it("instance 없으면 일반 스택형으로 parse (instance undefined)", () => {
    const r = parseInboxPayload("purchase_item", {
      item_kind: "equip",
      item_id: "baseball_bat",
      grade: "base",
      quantity: 1,
    });
    expect(r?.kind).toBe("purchase_item");
    expect((r as { instance?: unknown }).instance).toBeUndefined();
  });
});
