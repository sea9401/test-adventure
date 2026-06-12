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

  it("전투 몬스터 — 전역 잔여 HP 시작·이름/이미지/스킬/상태이상 보존", () => {
    for (const id of COOP_BOSS_KIND_IDS) {
      const b = COOP_BOSSES[id];
      // 풀피 — 발악 없음.
      const full = coopBossForBattle(b, b.sharedMaxHp);
      expect(full.monster.hp).toBe(b.sharedMaxHp);
      expect(full.monster.name).toBe(b.base.name);
      expect(full.monster.image).toBe(b.base.image);
      expect(full.monster.skill).toBeDefined();
      expect(full.monster.phaseTrigger).toBeUndefined(); // 발악 스테이지로 대체
      expect(full.enrageNotes).toHaveLength(0);
      // statusSkill — v2Skills 주입(잡몹 statusSkill 경로와 동일).
      if (b.statusSkill) {
        expect(full.monster.v2Skills?.equipped).toContain(b.statusSkill);
      }
      // 잔여 HP 클램프 — 0 이하/초과 입력 방어.
      expect(coopBossForBattle(b, 0).monster.hp).toBe(1);
      expect(
        coopBossForBattle(b, b.sharedMaxHp * 2).monster.hp,
      ).toBe(b.sharedMaxHp);
    }
  });

  it("발악 스테이지 — 전역 비율 임계 이하에서 누적 적용 + 안내 노트", () => {
    for (const id of COOP_BOSS_KIND_IDS) {
      const b = COOP_BOSSES[id];
      expect(b.enrageStages.length).toBeGreaterThan(0);
      expect(b.traits.length).toBeGreaterThan(0);
      const full = coopBossForBattle(b, b.sharedMaxHp);
      // 가장 깊은 스테이지 임계 바로 아래 — 전 스테이지 적용.
      const deepest = Math.min(...b.enrageStages.map((st) => st.hpFraction));
      const low = coopBossForBattle(
        b,
        Math.max(1, Math.floor(b.sharedMaxHp * deepest) - 1),
      );
      expect(low.enrageNotes).toHaveLength(b.enrageStages.length);
      // 스탯이 단조 증가(atkMult/defBonus/evasionBonus 중 무엇이든 강화 방향).
      expect(low.monster.atk).toBeGreaterThanOrEqual(full.monster.atk);
      expect(low.monster.def).toBeGreaterThanOrEqual(full.monster.def);
      // 경계 — 임계 초과 HP 에선 그 스테이지 미적용, 임계 정확히에선 적용(≤).
      for (const st of b.enrageStages) {
        const justAbove = coopBossForBattle(
          b,
          Math.floor(b.sharedMaxHp * st.hpFraction) + 1,
        );
        expect(justAbove.enrageNotes).not.toContain(st.note);
        const atThreshold = coopBossForBattle(
          b,
          Math.floor(b.sharedMaxHp * st.hpFraction),
        );
        expect(atThreshold.enrageNotes).toContain(st.note);
      }
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
