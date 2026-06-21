import { describe, it, expect } from "vitest";
import {
  ARENA_SHOP_TITLES,
  arenaShopEntries,
  arenaShopPriceFor,
} from "./arenaShop";
import { TITLES } from "@/adventure/data/titles";

describe("투기장 코인 상점 카탈로그", () => {
  it("모든 품목이 titles.ts 에 정의되고 category 가 pvp", () => {
    for (const t of ARENA_SHOP_TITLES) {
      const def = TITLES[t.titleId];
      expect(def, t.titleId).toBeDefined();
      expect(def.category).toBe("pvp");
    }
  });

  it("가격은 양수이고 오름차순", () => {
    let prev = 0;
    for (const t of ARENA_SHOP_TITLES) {
      expect(t.price).toBeGreaterThan(0);
      expect(t.price).toBeGreaterThan(prev);
      prev = t.price;
    }
  });

  it("arenaShopPriceFor — 등재/미등재", () => {
    expect(arenaShopPriceFor("pvp_gladiator")).toBe(200);
    expect(arenaShopPriceFor("not_a_title")).toBeUndefined();
  });

  it("arenaShopEntries — 이름·설명·가격 합본, 카탈로그와 동수", () => {
    const entries = arenaShopEntries();
    expect(entries).toHaveLength(ARENA_SHOP_TITLES.length);
    const gladiator = entries.find((e) => e.titleId === "pvp_gladiator");
    expect(gladiator?.price).toBe(200);
    expect((gladiator?.name.length ?? 0)).toBeGreaterThan(0);
    expect((gladiator?.description.length ?? 0)).toBeGreaterThan(0);
  });
});
