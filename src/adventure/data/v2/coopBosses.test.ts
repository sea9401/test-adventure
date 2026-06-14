import { describe, expect, it } from "vitest";
import {
  COOP_BOSSES,
  COOP_DURATION_MAX_MS,
  COOP_DURATION_MIN_MS,
  coopBossDurationMs,
  COOP_BOSS_KIND_IDS,
  COOP_TIER_ORDER,
  COOP_TIER_THRESHOLDS,
  SUMMON_SCROLL_DROP_PCT,
  coopBossForBattle,
  coopTierForRatio,
  parseCoopBossKindId,
  rollSummonScrollDrop,
  sumCoopGold,
  canAccessCoopBoss,
  parseCoopVisibility,
  coopAttackCooldownMs,
  COOP_ATTACK_COOLDOWN_MS,
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

  it("유지시간 — HP 비례·최소 2h·최대 24h 클램프·HP 오름차순과 단조", () => {
    let prev = 0;
    for (const id of COOP_BOSS_KIND_IDS) {
      const b = COOP_BOSSES[id];
      const d = coopBossDurationMs(b);
      expect(d).toBeGreaterThanOrEqual(COOP_DURATION_MIN_MS);
      expect(d).toBeLessThanOrEqual(COOP_DURATION_MAX_MS);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    // 캡 — 거대 HP 가상 보스도 24h 를 넘지 않는다.
    const giant = { ...COOP_BOSSES.lake_sovereign, sharedMaxHp: 10_000_000 };
    expect(coopBossDurationMs(giant)).toBe(COOP_DURATION_MAX_MS);
    // 바닥 — 소형 HP 는 2h 미만으로 안 내려간다.
    const tiny = { ...COOP_BOSSES.mountain_chief, sharedMaxHp: 1_000 };
    expect(coopBossDurationMs(tiny)).toBe(COOP_DURATION_MIN_MS);
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

describe("협동보스 가시성/권한 (코어루프 리워크)", () => {
  it("parseCoopVisibility — 유효값만, 그 외 public 폴백", () => {
    expect(parseCoopVisibility("public")).toBe("public");
    expect(parseCoopVisibility("guild_only")).toBe("guild_only");
    expect(parseCoopVisibility("summoner_only")).toBe("summoner_only");
    expect(parseCoopVisibility("bogus")).toBe("public");
    expect(parseCoopVisibility(undefined)).toBe("public");
  });

  it("canAccessCoopBoss — public 은 누구나", () => {
    const s = { visibility: "public", summonerId: "u1", summonerGuildId: 5 };
    expect(canAccessCoopBoss(s, { userId: "u2", guildId: null })).toBe(true);
    expect(canAccessCoopBoss(s, { userId: "u1", guildId: 5 })).toBe(true);
  });

  it("canAccessCoopBoss — guild_only 는 소환 시점 길드원만", () => {
    const s = { visibility: "guild_only", summonerId: "u1", summonerGuildId: 5 };
    expect(canAccessCoopBoss(s, { userId: "u2", guildId: 5 })).toBe(true); // 같은 길드
    expect(canAccessCoopBoss(s, { userId: "u2", guildId: 7 })).toBe(false); // 다른 길드
    expect(canAccessCoopBoss(s, { userId: "u2", guildId: null })).toBe(false); // 무소속
    // 소환자 길드가 null(무소속 소환)이면 아무도 매칭 안 됨(소환자조차 guildId null 매칭은 막음).
    const noGuild = { visibility: "guild_only", summonerId: "u1", summonerGuildId: null };
    expect(canAccessCoopBoss(noGuild, { userId: "u9", guildId: null })).toBe(false);
  });

  it("canAccessCoopBoss — summoner_only 는 소환자 본인만", () => {
    const s = { visibility: "summoner_only", summonerId: "u1", summonerGuildId: 5 };
    expect(canAccessCoopBoss(s, { userId: "u1", guildId: 5 })).toBe(true);
    expect(canAccessCoopBoss(s, { userId: "u2", guildId: 5 })).toBe(false);
  });

  it("canAccessCoopBoss — 미지정/구행(visibility null)은 public 폴백", () => {
    const s = { visibility: null, summonerId: null, summonerGuildId: null };
    expect(canAccessCoopBoss(s, { userId: "u2", guildId: null })).toBe(true);
  });

  it("coopAttackCooldownMs — flag off 면 기존 120s", () => {
    // 테스트 환경은 V2_CORE_LOOP_V2=false → 120s.
    expect(coopAttackCooldownMs()).toBe(COOP_ATTACK_COOLDOWN_MS);
    expect(COOP_ATTACK_COOLDOWN_MS).toBe(120_000);
  });
});
