import { describe, expect, it } from "vitest";
import {
  COOP_BOSSES,
  COOP_BOSS_KIND_IDS,
  COOP_TIER_ORDER,
  COOP_TIER_THRESHOLDS,
  SUMMON_SCROLL_DROP_PCT,
  coopBossForBattle,
  coopTierForRatio,
  parseCoopBossKindId,
  rollSummonScrollDrop,
  sumCoopGold,
} from "./coopBosses";
import { V2_EQUIPMENT } from "./v2Equipment";
import { V2_MATERIALS } from "./dungeonDrops";
import { SUMMON_SCROLL_MATERIAL_ID } from "./coopBosses";
import { TITLES } from "@/adventure/data/titles";

describe("coopBosses 카탈로그", () => {
  it("3종 — id 일치·소환서 비용/공유 HP 오름차순(사다리)", () => {
    expect(COOP_BOSS_KIND_IDS).toHaveLength(3);
    let prevCost = 0;
    let prevHp = 0;
    for (const id of COOP_BOSS_KIND_IDS) {
      const b = COOP_BOSSES[id];
      expect(b.id).toBe(id);
      expect(b.scrollCost).toBeGreaterThan(prevCost);
      expect(b.sharedMaxHp).toBeGreaterThan(prevHp);
      expect(b.durationMs).toBeGreaterThan(0);
      prevCost = b.scrollCost;
      prevHp = b.sharedMaxHp;
    }
  });

  it("유니크/칭호 — 장비 카탈로그·칭호 카탈로그에 실재", () => {
    for (const id of COOP_BOSS_KIND_IDS) {
      const b = COOP_BOSSES[id];
      expect(b.uniqueIds.length).toBeGreaterThan(0);
      for (const u of b.uniqueIds) {
        expect(V2_EQUIPMENT[u], `unknown equipment: ${u}`).toBeDefined();
        expect(V2_EQUIPMENT[u].rarity).toBe("unique");
      }
      expect(
        (TITLES as Record<string, unknown>)[b.titleId],
        `unknown title: ${b.titleId}`,
      ).toBeDefined();
    }
  });

  it("티어 보상 — 골드 증분 전부 양수·uniqueChance 단조 증가·합산이 증분 합과 일치", () => {
    for (const id of COOP_BOSS_KIND_IDS) {
      const b = COOP_BOSSES[id];
      let prevChance = 0;
      let cum = 0;
      for (const t of COOP_TIER_ORDER) {
        expect(b.rewards[t].gold).toBeGreaterThan(0);
        expect(b.rewards[t].uniqueChance).toBeGreaterThanOrEqual(prevChance);
        expect(b.rewards[t].uniqueChance).toBeLessThanOrEqual(1);
        prevChance = b.rewards[t].uniqueChance;
        cum += b.rewards[t].gold;
        expect(sumCoopGold(b, t)).toBe(cum);
      }
    }
  });

  it("전투 몬스터 — 공유 HP 로 덮어쓰고 이름/이미지/스킬 보존", () => {
    for (const id of COOP_BOSS_KIND_IDS) {
      const b = COOP_BOSSES[id];
      const mon = coopBossForBattle(b);
      expect(mon.hp).toBe(b.sharedMaxHp);
      expect(mon.name).toBe(b.base.name);
      expect(mon.image).toBe(b.base.image);
      expect(mon.skill).toBeDefined();
      // anchorDepth 스케일로 베이스보다 강함(원본 비변조 확인 겸).
      expect(mon.atk).toBeGreaterThan(0);
      expect(b.base.hp).not.toBe(b.sharedMaxHp);
    }
  });

  it("parseCoopBossKindId — 유효 id 만 통과", () => {
    expect(parseCoopBossKindId("mountain_chief")).toBe("mountain_chief");
    expect(parseCoopBossKindId("nope")).toBeNull();
    expect(parseCoopBossKindId(42)).toBeNull();
    expect(parseCoopBossKindId(null)).toBeNull();
  });
});

describe("coopTierForRatio", () => {
  it("임계 경계 — 미달 null·각 임계 도달 시 그 티어", () => {
    expect(coopTierForRatio(0)).toBeNull();
    expect(
      coopTierForRatio(COOP_TIER_THRESHOLDS.bronze - 0.0001),
    ).toBeNull();
    expect(coopTierForRatio(COOP_TIER_THRESHOLDS.bronze)).toBe("bronze");
    expect(coopTierForRatio(COOP_TIER_THRESHOLDS.silver)).toBe("silver");
    expect(coopTierForRatio(COOP_TIER_THRESHOLDS.gold)).toBe("gold");
    expect(coopTierForRatio(COOP_TIER_THRESHOLDS.epic)).toBe("epic");
    expect(coopTierForRatio(COOP_TIER_THRESHOLDS.legend)).toBe("legend");
    expect(coopTierForRatio(1)).toBe("legend");
  });
});

describe("소환서 드랍", () => {
  it("재료 카탈로그 등재(인벤/거래소 표시 전제)", () => {
    expect(V2_MATERIALS[SUMMON_SCROLL_MATERIAL_ID]).toBeDefined();
  });

  it("롤 — 확률 경계에서 1/0", () => {
    expect(rollSummonScrollDrop(() => 0)).toBe(1);
    expect(
      rollSummonScrollDrop(() => SUMMON_SCROLL_DROP_PCT / 100 - 1e-9),
    ).toBe(1);
    expect(rollSummonScrollDrop(() => SUMMON_SCROLL_DROP_PCT / 100)).toBe(0);
    expect(rollSummonScrollDrop(() => 0.999999)).toBe(0);
  });
});
