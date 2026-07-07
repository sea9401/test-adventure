import { describe, expect, it } from "vitest";
import {
  COOP_BOSSES,
  COOP_DURATION_MAX_MS,
  COOP_DURATION_MIN_MS,
  coopBossDurationMs,
  COOP_BOSS_KIND_IDS,
  COOP_TIER_ORDER,
  COOP_HARD_TIER_THRESHOLDS,
  COOP_TIER_THRESHOLDS,
  SUMMON_SCROLL_DROP_PCT,
  coopBossForBattle,
  coopEnrageStatus,
  coopTierThresholdFor,
  coopTierForRatio,
  parseCoopBossKindId,
  rollSummonScrollDrop,
  COOP_SP_FRUIT_CHANCE,
  rollCoopSpFruits,
  coopSpFruitMaxAt,
  COOP_UNIQUE_CHANCE,
  rollCoopUnique,
  canAccessCoopBoss,
  parseCoopVisibility,
  coopAttackCooldownMs,
  COOP_ATTACK_COOLDOWN_MS,
  COOP_ATTACK_COOLDOWN_MS_V2,
  COOP_ATTACK_STAMINA_COST,
  MAX_ACTIVE_PER_KIND,
  FISHING_COOP_BOSS_KIND_ID,
  FISHING_COOP_BOSS_SPAWN_CHANCE,
  SCROLL_SUMMONABLE_COOP_BOSS_KIND_IDS,
  isScrollSummonableCoopBossKind,
  coopCriticalDamageFromLog,
  rollFishingCoopBossSpawn,
} from "./coopBosses";
import { V2_EQUIPMENT } from "./v2Equipment";
import { V2_MATERIALS } from "./dungeonDrops";
import { SUMMON_SCROLL_MATERIAL_ID } from "./coopBosses";
import { TITLES } from "@/adventure/data/titles";

describe("coopBosses 카탈로그", () => {
  it("6종 — 노말 4단 사다리 + 하드 보스 2종", () => {
    expect(COOP_BOSS_KIND_IDS).toHaveLength(6);
    const normalLadder = [
      "mountain_chief",
      "canyon_predator",
      "lake_sovereign",
      "void_priest",
    ] as const;
    let prevCost = 0;
    let prevHp = 0;
    for (const id of normalLadder) {
      const b = COOP_BOSSES[id];
      expect(b.id).toBe(id);
      expect(b.scrollCost).toBeGreaterThan(prevCost);
      expect(b.sharedMaxHp).toBeGreaterThan(prevHp);

      prevCost = b.scrollCost;
      prevHp = b.sharedMaxHp;
    }
    expect(COOP_BOSSES.mountain_chief.scrollCost).toBe(10);
    expect(COOP_BOSSES.canyon_predator.scrollCost).toBe(15);
    expect(COOP_BOSSES.lake_sovereign.scrollCost).toBe(20);
    expect(COOP_BOSSES.void_priest.scrollCost).toBe(30);
    expect(COOP_BOSSES.void_priest.sharedMaxHp).toBe(420_000);
    expect(COOP_BOSSES.mountain_chief_hard).toMatchObject({
      difficulty: "hard",
      scrollCost: 30,
      sharedMaxHp: 600_000,
      anchorDepth: 68,
    });
    expect(COOP_BOSSES.abyssal_tyrant).toMatchObject({
      difficulty: "hard",
      scrollCost: 30,
      sharedMaxHp: 600_000,
      anchorDepth: 60,
    });
  });

  it("공허의 대사제 — 저주 기믹과 방어형 보상", () => {
    const b = COOP_BOSSES.void_priest;
    expect(b.base.skill?.kind).toBe("curse");
    expect(b.base.atkType).toBe("magic");
    expect(b.base.critPct).toBeGreaterThan(0);
    expect(b.uniqueIds).toEqual([
      "v2_boss_void_bastion",
      "v2_boss_void_reliquary",
    ]);
    expect(V2_EQUIPMENT.v2_boss_void_bastion.options?.def).toBeGreaterThan(0);
    expect(V2_EQUIPMENT.v2_boss_void_reliquary.signature?.statusBlockOnce).toBe(
      true,
    );
  });

  it("유니크/칭호 카탈로그 — 휴면 id 도 장비·칭호 카탈로그에 실재(기보유분 호환)", () => {
    for (const id of COOP_BOSS_KIND_IDS) {
      const b = COOP_BOSSES[id];
      // 하드 산군은 레거시 노말 산군 유니크가 보상에 섞이지 않도록 유니크 롤을 끈다.
      if (COOP_BOSSES[id].difficulty === "hard") {
        expect(b.uniqueIds).toEqual([]);
        continue;
      }
      // 보상 개편 후에도 기존 보스 유니크 id·카탈로그는 보존(보유분 비파괴).
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

  it("보상 = SP 열매 티어 확률 — GOLD부터·단조 증가·BRONZE/SILVER 0", () => {
    expect(COOP_SP_FRUIT_CHANCE.bronze).toBe(0);
    expect(COOP_SP_FRUIT_CHANCE.silver).toBe(0);
    expect(COOP_SP_FRUIT_CHANCE.gold).toBe(0.1);
    expect(COOP_SP_FRUIT_CHANCE.epic).toBe(0.15);
    expect(COOP_SP_FRUIT_CHANCE.legend).toBe(0.2);
    let prev = -1;
    for (const t of COOP_TIER_ORDER) {
      const c = COOP_SP_FRUIT_CHANCE[t];
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
      expect(c).toBeGreaterThanOrEqual(prev); // 단조 증가
      prev = c;
    }
  });

  it("rollCoopSpFruits — 도달 티어별 독립 굴림(LEGEND 최대 3·BRONZE/SILVER 0)", () => {
    // rng=0 → 모든 굴림 통과(확률>0 티어 수 = 획득 수).
    expect(rollCoopSpFruits(null, () => 0)).toBe(0);
    expect(rollCoopSpFruits("bronze", () => 0)).toBe(0);
    expect(rollCoopSpFruits("silver", () => 0)).toBe(0);
    expect(rollCoopSpFruits("gold", () => 0)).toBe(1);
    expect(rollCoopSpFruits("epic", () => 0)).toBe(2);
    expect(rollCoopSpFruits("legend", () => 0)).toBe(3);
    // rng=0.99 → 모두 실패.
    expect(rollCoopSpFruits("legend", () => 0.99)).toBe(0);
    // 경계 — rng < chance 통과. gold(0.10): 0.05 통과·0.10 실패.
    expect(rollCoopSpFruits("gold", () => 0.05)).toBe(1);
    expect(rollCoopSpFruits("gold", () => 0.1)).toBe(0);
    // 부분 — legend 에서 GOLD(0.10)만 통과: 0.05<0.10 통과, EPIC(0.15)·LEGEND(0.20) 실패시키려면
    //   각 굴림이 다른 값을 봐야 함. 시퀀스 rng 로 [통과, 실패, 실패].
    const seq = [0.05, 0.3, 0.4];
    let i = 0;
    expect(rollCoopSpFruits("legend", () => seq[i++] ?? 1)).toBe(1);
  });

  it("coopSpFruitMaxAt — 도달 티어 최대 개수(GOLD 1·EPIC 2·LEGEND 3)", () => {
    expect(coopSpFruitMaxAt(null)).toBe(0);
    expect(coopSpFruitMaxAt("bronze")).toBe(0);
    expect(coopSpFruitMaxAt("silver")).toBe(0);
    expect(coopSpFruitMaxAt("gold")).toBe(1);
    expect(coopSpFruitMaxAt("epic")).toBe(2);
    expect(coopSpFruitMaxAt("legend")).toBe(3);
  });

  it("rollCoopUnique — EPIC+ 단일 굴림(GOLD 이하 0·확률 경계)", () => {
    expect(COOP_UNIQUE_CHANCE.gold).toBe(0);
    expect(COOP_UNIQUE_CHANCE.epic).toBe(0.12);
    expect(COOP_UNIQUE_CHANCE.legend).toBe(0.25);
    // GOLD 이하 — rng 무관 항상 false.
    expect(rollCoopUnique(null, () => 0)).toBe(false);
    expect(rollCoopUnique("bronze", () => 0)).toBe(false);
    expect(rollCoopUnique("gold", () => 0)).toBe(false);
    // EPIC/LEGEND — rng < chance 통과.
    expect(rollCoopUnique("epic", () => 0)).toBe(true);
    expect(rollCoopUnique("epic", () => 0.119)).toBe(true);
    expect(rollCoopUnique("epic", () => 0.12)).toBe(false);
    expect(rollCoopUnique("legend", () => 0.24)).toBe(true);
    expect(rollCoopUnique("legend", () => 0.25)).toBe(false);
  });

  it("보스 uniqueIds — 시그니처 유니크 실재(이름·rarity·signature)", () => {
    for (const id of COOP_BOSS_KIND_IDS) {
      const b = COOP_BOSSES[id];
      if (COOP_BOSSES[id].difficulty === "hard") {
        expect(b.uniqueIds).toEqual([]);
        continue;
      }
      expect(b.uniqueIds.length).toBeGreaterThan(0);
      for (const u of b.uniqueIds) {
        expect(V2_EQUIPMENT[u]?.rarity).toBe("unique");
        expect(V2_EQUIPMENT[u]?.signature).toBeDefined(); // 발동형 효과 부여
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
      if (b.enrageStages.length === 0) continue;
      expect(b.enrageStages.length).toBeGreaterThan(0);
      expect(b.traits.length).toBeGreaterThan(0);
      const full = coopBossForBattle(b, b.sharedMaxHp);
      // 가장 깊은 스테이지 임계 바로 아래 — 전 스테이지 적용.
      const deepest = Math.min(...b.enrageStages.map((st) => st.hpFraction));
      const low = coopBossForBattle(
        b,
        Math.max(1, Math.floor(b.sharedMaxHp * deepest) - 1),
      );
      expect(low.enrageNotes).toEqual(
        expect.arrayContaining(b.enrageStages.map((stage) => stage.note)),
      );
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

  it("하드 산군 — 50% 조건부 발악과 약화 상태", () => {
    const b = COOP_BOSSES.mountain_chief_hard;
    expect(b.conditionalEnrage?.hpFraction).toBe(0.5);
    const full = coopBossForBattle(b, b.sharedMaxHp);
    const normal = coopBossForBattle(b, b.sharedMaxHp * 0.5);
    const weakened = coopBossForBattle(b, b.sharedMaxHp * 0.5, {
      conditionalEnrageWeakened: true,
    });
    expect(normal.enrageNotes).toHaveLength(1);
    expect(weakened.enrageNotes).toHaveLength(1);
    expect(normal.monster.atk).toBeGreaterThan(weakened.monster.atk);
    expect(normal.monster.def).toBeGreaterThan(weakened.monster.def);
    expect(weakened.monster.atk).toBeGreaterThan(full.monster.atk);
    expect(weakened.monster.def).toBeGreaterThan(full.monster.def);
  });

  it("하드 산군 — 약화된 최종 구간도 공허의 대사제보다 강한 물리 압박을 준다", () => {
    const hard = COOP_BOSSES.mountain_chief_hard;
    const priest = COOP_BOSSES.void_priest;
    const priestFull = coopBossForBattle(priest, priest.sharedMaxHp).monster;
    const priestHalf = coopBossForBattle(priest, priest.sharedMaxHp * 0.5).monster;
    const priestFinal = coopBossForBattle(
      priest,
      priest.sharedMaxHp * 0.25,
    ).monster;
    const hardFull = coopBossForBattle(hard, hard.sharedMaxHp).monster;
    const hardHalfWeakened = coopBossForBattle(hard, hard.sharedMaxHp * 0.5, {
      conditionalEnrageWeakened: true,
    }).monster;
    const hardFinalWeakened = coopBossForBattle(hard, hard.sharedMaxHp * 0.25, {
      conditionalEnrageWeakened: true,
    }).monster;

    expect(hardFull.atk).toBeGreaterThan(priestFull.atk);
    expect(hardFull.atk).toBeGreaterThan(priestHalf.atk);
    expect(hardHalfWeakened.atk).toBeGreaterThan(priestHalf.atk);
    expect(hardFinalWeakened.atk).toBeGreaterThan(priestFinal.atk);
    expect(hardFinalWeakened.def).toBeGreaterThan(priestFinal.def);
    expect(hardFinalWeakened.evasionPct ?? 0).toBeGreaterThan(
      priestFinal.evasionPct ?? 0,
    );
  });

  it("심연어룡 — 낚시 이벤트 HARD 보스 + 치명타 수압 파훼", () => {
    const b = COOP_BOSSES.abyssal_tyrant;
    expect(FISHING_COOP_BOSS_KIND_ID).toBe("abyssal_tyrant");
    expect(SCROLL_SUMMONABLE_COOP_BOSS_KIND_IDS).not.toContain(
      FISHING_COOP_BOSS_KIND_ID,
    );
    expect(isScrollSummonableCoopBossKind("abyssal_tyrant")).toBe(false);
    expect(isScrollSummonableCoopBossKind("mountain_chief_hard")).toBe(true);
    expect(FISHING_COOP_BOSS_SPAWN_CHANCE).toBe(0.0002);
    expect(rollFishingCoopBossSpawn(() => 0)).toBe(true);
    expect(rollFishingCoopBossSpawn(() => FISHING_COOP_BOSS_SPAWN_CHANCE)).toBe(
      false,
    );
    expect(b.base.v2Skills?.equipped).toContain("mob_arcane_nova");
    expect(b.conditionalEnrage?.hpFraction).toBe(0.5);
    const normal = coopBossForBattle(b, b.sharedMaxHp * 0.5);
    const weakened = coopBossForBattle(b, b.sharedMaxHp * 0.5, {
      conditionalEnrageWeakened: true,
    });
    expect(normal.monster.atk).toBeGreaterThan(weakened.monster.atk);
    expect(normal.monster.def).toBeGreaterThan(weakened.monster.def);
    expect(normal.monster.evasionPct ?? 0).toBeGreaterThan(
      weakened.monster.evasionPct ?? 0,
    );
    expect(
      coopCriticalDamageFromLog([
        { kind: "player_attack", text: "공격! [크리티컬] 100 피해를 입혔다." },
        { kind: "player_attack", text: "공격! 80 피해를 입혔다." },
        { kind: "info", text: "z" },
      ]),
    ).toBe(100);
  });

  it("산군 난이도별 방어·마법방어·명중·회피 스탯을 가진다", () => {
    const normal = coopBossForBattle(
      COOP_BOSSES.mountain_chief,
      COOP_BOSSES.mountain_chief.sharedMaxHp,
    ).monster;
    const hard = coopBossForBattle(
      COOP_BOSSES.mountain_chief_hard,
      COOP_BOSSES.mountain_chief_hard.sharedMaxHp,
    ).monster;
    expect(normal.atk).toBe(146);
    expect(normal.def).toBe(44);
    expect(normal.magicDef).toBe(49);
    expect(normal.accuracy).toBeGreaterThan(4);
    expect(normal.evasionPct).toBe(5);
    expect(hard.atk).toBe(4394);
    expect(hard.def).toBe(469);
    expect(hard.magicDef).toBe(604);
    expect(hard.accuracy).toBeGreaterThan(40);
    expect(hard.evasionPct).toBe(12);
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

  it("coopEnrageStatus — 라이브 발악 진행/예고(상세 배지용)", () => {
    for (const id of COOP_BOSS_KIND_IDS) {
      const b = COOP_BOSSES[id];
      const n = b.enrageStages.length;
      if (n === 0) continue;
      // 풀피 — 발동 0·다음 단계는 가장 높은 임계.
      const full = coopEnrageStatus(b, 1);
      expect(full.activeCount).toBe(0);
      expect(full.totalStages).toBe(n);
      expect(full.stages).toHaveLength(n);
      // 트래커는 임계 내림차순.
      for (let i = 1; i < full.stages.length; i++) {
        expect(full.stages[i - 1].stage.hpFraction).toBeGreaterThanOrEqual(
          full.stages[i].stage.hpFraction,
        );
      }
      const highest = Math.max(...b.enrageStages.map((s) => s.hpFraction));
      expect(full.nextStage?.hpFraction).toBe(highest);
      // 바닥 — 전부 발동·다음 없음.
      const low = coopEnrageStatus(b, 0);
      expect(low.activeCount).toBe(n);
      expect(low.nextStage).toBeNull();
      expect(low.stages.every((s) => s.active)).toBe(true);
      // 가장 높은 임계 바로 위 — 아직 0 발동, 그 임계가 다음.
      const justAbove = coopEnrageStatus(b, Math.min(1, highest + 0.001));
      expect(justAbove.activeCount).toBe(0);
      expect(justAbove.nextStage?.hpFraction).toBe(highest);
      // 가장 높은 임계 정확히 — 그 단계 발동(≤ 규칙, coopBossForBattle 과 동일).
      const atHighest = coopEnrageStatus(b, highest);
      expect(atHighest.activeCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("parseCoopBossKindId — 유효 id 만 통과", () => {
    expect(parseCoopBossKindId("mountain_chief")).toBe("mountain_chief");
    expect(parseCoopBossKindId("void_priest")).toBe("void_priest");
    expect(parseCoopBossKindId("abyssal_tyrant")).toBe("abyssal_tyrant");
    expect(parseCoopBossKindId("nope")).toBeNull();
    expect(parseCoopBossKindId(42)).toBeNull();
    expect(parseCoopBossKindId(null)).toBeNull();
  });
});

describe("coopTierForRatio", () => {
  it("임계 경계 — 미달 null·각 임계 도달 시 그 티어", () => {
    expect(COOP_TIER_THRESHOLDS.legend).toBe(0.45);
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

  it("하드 보스는 별도 기여 기준을 사용", () => {
    expect(coopTierThresholdFor("bronze", "mountain_chief_hard")).toBe(
      COOP_HARD_TIER_THRESHOLDS.bronze,
    );
    expect(
      coopTierForRatio(
        COOP_HARD_TIER_THRESHOLDS.bronze - 0.0001,
        "mountain_chief_hard",
      ),
    ).toBeNull();
    expect(
      coopTierForRatio(COOP_HARD_TIER_THRESHOLDS.bronze, "mountain_chief_hard"),
    ).toBe("bronze");
    expect(
      coopTierForRatio(COOP_HARD_TIER_THRESHOLDS.gold, "mountain_chief_hard"),
    ).toBe("gold");
    expect(
      coopTierForRatio(COOP_HARD_TIER_THRESHOLDS.legend, "mountain_chief_hard"),
    ).toBe("legend");
    expect(coopTierThresholdFor("bronze", "abyssal_tyrant")).toBe(
      COOP_HARD_TIER_THRESHOLDS.bronze,
    );
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

  it("협동 보스 공격 다이얼 — 10초 쿨다운, 공격당 스태미너 20, 종류별 20마리", () => {
    // 테스트 환경은 V2_CORE_LOOP_V2=false → 기본 쿨다운 상수 반환.
    expect(coopAttackCooldownMs()).toBe(COOP_ATTACK_COOLDOWN_MS);
    expect(COOP_ATTACK_COOLDOWN_MS).toBe(10_000);
    expect(COOP_ATTACK_COOLDOWN_MS_V2).toBe(10_000);
    expect(COOP_ATTACK_STAMINA_COST).toBe(20);
    expect(MAX_ACTIVE_PER_KIND).toBe(20);
  });
});
