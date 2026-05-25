import { describe, it, expect } from "vitest";
import { getChampion, CLAIM_STAMINA_COST } from "./champions";
import type { OutpostTier, OutpostType } from "./types";

const TIERS: OutpostTier[] = [1, 2, 3, 4];
const TYPES: OutpostType[] = ["mine", "tower", "fort", "village"];

describe("champions", () => {
  it("모든 type × tier 16 종 정상 생성", () => {
    for (const type of TYPES) {
      for (const tier of TIERS) {
        const c = getChampion(type, tier);
        expect(c.name).toBeTruthy();
        expect(c.hp).toBeGreaterThan(0);
        expect(c.atk).toBeGreaterThan(0);
        expect(c.def).toBeGreaterThan(0);
      }
    }
  });

  it("higher tier = stronger (hp·atk 단조 증가)", () => {
    for (const type of TYPES) {
      for (let i = 1; i < TIERS.length; i += 1) {
        const a = getChampion(type, TIERS[i - 1]);
        const b = getChampion(type, TIERS[i]);
        expect(b.hp, `${type} t${i + 1} hp`).toBeGreaterThan(a.hp);
        expect(b.atk, `${type} t${i + 1} atk`).toBeGreaterThan(a.atk);
      }
    }
  });

  it("type 특색 — mine 이 같은 tier village 보다 hp 높음", () => {
    for (const tier of TIERS) {
      expect(getChampion("mine", tier).hp).toBeGreaterThan(
        getChampion("village", tier).hp,
      );
    }
  });

  it("type 특색 — tower 가 같은 tier village 보다 atk 높음", () => {
    for (const tier of TIERS) {
      expect(getChampion("tower", tier).atk).toBeGreaterThan(
        getChampion("village", tier).atk,
      );
    }
  });

  it("CLAIM_STAMINA_COST 단조 증가", () => {
    expect(CLAIM_STAMINA_COST[1]).toBeLessThan(CLAIM_STAMINA_COST[2]);
    expect(CLAIM_STAMINA_COST[2]).toBeLessThan(CLAIM_STAMINA_COST[3]);
    expect(CLAIM_STAMINA_COST[3]).toBeLessThan(CLAIM_STAMINA_COST[4]);
  });
});
