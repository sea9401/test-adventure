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
  coopBossCurrentMp,
  coopBossMaxMp,
  coopBossMpPressureDamage,
  coopBossTrackingThreat,
  coopBossTrackingThreatMax,
  withCoopBossMp,
  withCoopBossTrackingThreat,
  coopInvincibleFortressState,
  coopInvincibleFortressDisplay,
  withCoopInvincibleFortressState,
  coopSkywardCrystalEyeState,
  coopSkywardCrystalEyeDisplay,
  withCoopSkywardCrystalEyeState,
  coopImmortalBerserkerState,
  coopImmortalBerserkerDisplay,
  withCoopImmortalBerserkerState,
  parseCoopMechanicState,
  COOP_INITIAL_VISIBILITY,
  coopVisibilityTransition,
} from "./coopBosses";
import { initialInvincibleFortressState } from "@/adventure/v2/combat/invincibleFortressMechanic";
import { initialSkywardCrystalEyeState } from "@/adventure/v2/combat/skywardCrystalEyeMechanic";
import { V2_EQUIPMENT } from "./v2Equipment";
import { V2_MATERIALS } from "./dungeonDrops";
import { SUMMON_SCROLL_MATERIAL_ID } from "./coopBosses";
import { TITLES } from "@/adventure/data/titles";

describe("coopBosses 카탈로그", () => {
  it("불멸 상태를 정규화하면서 기존 협동 메커니즘 필드를 보존한다", () => {
    const parsed = parseCoopMechanicState({
      bossMp: 7,
      trackingThreat: 9,
      immortalBerserker: {
        kind: "immortal_berserker",
        lifeIndex: 0,
        regenActionCount: 9,
        regenUsesRemaining: 99,
        revivalsCompleted: 0,
      },
    });

    expect(parsed).toMatchObject({
      bossMp: 7,
      trackingThreat: 9,
      immortalBerserker: {
        kind: "immortal_berserker",
        lifeIndex: 0,
        regenActionCount: 3,
        regenUsesRemaining: 3,
        revivalsCompleted: 0,
      },
    });
  });

  it("불멸 상태의 병합과 둘째 생명 표시값을 계산한다", () => {
    const kind = COOP_BOSSES.immortal_berserker;
    const state = {
      kind: "immortal_berserker",
      lifeIndex: 1,
      regenActionCount: 2,
      regenUsesRemaining: 1,
      revivalsCompleted: 1,
    } as const;
    const merged = withCoopImmortalBerserkerState(
      kind,
      { bossMp: 7, trackingThreat: 9 },
      state,
      5_672_000,
    );

    expect(merged).toMatchObject({
      bossMp: 7,
      trackingThreat: 9,
      immortalBerserker: state,
    });
    expect(coopImmortalBerserkerState(kind, merged, 5_672_000)).toEqual(state);
    expect(coopImmortalBerserkerDisplay(kind, merged, 5_672_000)).toEqual({
      immortalLifeIndex: 1,
      immortalLifeHp: 2_000_000,
      immortalLifeMaxHp: 3_564_000,
      immortalRegenActionsRemaining: 2,
      immortalRegenUsesRemaining: 1,
      immortalNextRegenAmount: 106_920,
      immortalAtkMult: 1.12,
      immortalSpdMult: 1.06,
    });
  });

  it("14종 — 기존 협동 8종 + 미개척지 개인 보스 6종", () => {
    expect(COOP_BOSS_KIND_IDS).toHaveLength(14);
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
    expect(COOP_BOSSES.lake_sovereign.sharedMaxHp).toBe(270_000);
    expect(COOP_BOSSES.void_priest.sharedMaxHp).toBe(630_000);
    expect(COOP_BOSSES.mountain_chief_hard).toMatchObject({
      difficulty: "hard",
      scrollCost: 30,
      sharedMaxHp: 1_200_000,
      anchorDepth: 68,
    });
    expect(COOP_BOSSES.abyssal_tyrant).toMatchObject({
      difficulty: "hard",
      scrollCost: 30,
      sharedMaxHp: 1_400_000,
      anchorDepth: 60,
    });
    expect(COOP_BOSSES.canyon_predator_hard).toMatchObject({
      difficulty: "hard",
      name: "재앙의 스콜피온 킹",
      scrollCost: 30,
      sharedMaxHp: 8_400_000,
      anchorDepth: 78,
    });
    expect(COOP_BOSSES.lake_sovereign_hard).toMatchObject({
      difficulty: "hard",
      name: "혹한의 호수 괴물",
      scrollCost: 30,
      sharedMaxHp: 8_400_000,
      anchorDepth: 78,
    });
  });

  it("미개척지 보스는 개인 공개가 잠기며 일반 소환서 목록에서 제외된다", () => {
    const personalIds = [
      "tracking_weapon",
      "toxic_blood_lord",
      "glacial_colossus",
      "invincible_fortress",
      "skyward_crystal_eye",
      "immortal_berserker",
    ] as const;
    for (const id of personalIds) {
      expect(COOP_BOSSES[id]).toMatchObject({
        rewardMode: "unexplored_personal",
        visibilityLocked: true,
      });
      expect(COOP_BOSSES[id].summonMaterialId).toMatch(/_summon_stone$/);
      expect(SCROLL_SUMMONABLE_COOP_BOSS_KIND_IDS).not.toContain(id);
      expect(isScrollSummonableCoopBossKind(id)).toBe(false);
    }
    const personalIdSet = new Set<string>(personalIds);
    for (const id of COOP_BOSS_KIND_IDS.filter(
      (kindId) => !personalIdSet.has(kindId),
    )) {
      expect(COOP_BOSSES[id].rewardMode).toBe("coop");
      expect(COOP_BOSSES[id].visibilityLocked).toBe(false);
    }
  });

  it("추적 병기는 확정 연타 대신 추적 반격 중심의 일반 공격 수치를 사용한다", () => {
    const tracking = COOP_BOSSES.tracking_weapon;
    expect(tracking.base).toMatchObject({
      atk: 2.2,
      spd: 27,
      evasionPct: 12,
      skill: { kind: "pierce", armorPierce: 10 },
    });
    expect(tracking.base.bonusAttackChancePct).toBeUndefined();
    expect(tracking.enrageStages).toEqual([]);
    expect(tracking.traits).toEqual([
      "빠른 행동",
      "피해·타격 추적",
      "추적 완료 시 2연타 반격",
    ]);
  });

  it("독혈 군주는 장기전 독혈 순환을 특성으로 안내한다", () => {
    const toxic = COOP_BOSSES.toxic_blood_lord;

    expect(toxic.base.skill).toMatchObject({
      kind: "heavy_blow",
      name: "독혈 파열",
      everyPhases: 3,
      multiplier: 1.8,
    });
    expect(toxic.enrageStages).toEqual([]);
    expect(toxic.traits).toEqual([
      "피격 시 독혈 누적",
      "10중첩 독혈 폭발",
      "중독·폭발 후 회복 억제",
    ]);
  });

  it("빙하 거수는 공용 한기 피해 대신 행동 속도 봉쇄를 안내한다", () => {
    const glacial = COOP_BOSSES.glacial_colossus;

    expect(glacial.base.skill).toBeUndefined();
    expect(glacial.enrageStages).toEqual([]);
    expect(glacial.traits).toEqual([
      "냉기장으로 한기 누적",
      "한기 중첩당 행동 속도 감소",
      "10중첩 빙결 — 다음 행동 취소",
    ]);
  });

  it("신규 6T HARD 보스는 운영 상위 중앙 피해 기준 14회 공격을 요구한다", () => {
    const scorpion = COOP_BOSSES.canyon_predator_hard;
    const lake = COOP_BOSSES.lake_sovereign_hard;

    // 2026-08-20 운영 상위 20명 익명 감사의 두 보스 중앙 피해는 회당 약 61만이었다.
    // 보수적으로 60만을 기준으로 고정해 목표 범위 12~15회의 중앙인 14회를 맞춘다.
    const liveTopMedianDamage = 600_000;
    expect(Math.ceil(scorpion.sharedMaxHp / liveTopMedianDamage)).toBe(14);
    expect(Math.ceil(lake.sharedMaxHp / liveTopMedianDamage)).toBe(14);
  });

  it("신규 6T HARD 보스는 초기부터 기존 HARD와 구별되는 파생 공·방·속을 가진다", () => {
    const scorpion = COOP_BOSSES.canyon_predator_hard;
    const lake = COOP_BOSSES.lake_sovereign_hard;
    const scorpionFull = coopBossForBattle(scorpion, scorpion.sharedMaxHp).monster;
    const lakeFull = coopBossForBattle(lake, lake.sharedMaxHp).monster;

    expect(scorpionFull).toMatchObject({
      atk: 804,
      def: 717,
      magicDef: 675,
      spd: 22,
      evasionPct: 18,
    });
    expect(lakeFull).toMatchObject({
      atk: 804,
      def: 759,
      magicDef: 970,
      spd: 20,
      evasionPct: 12,
    });
    expect(scorpionFull.accuracy).toBeLessThan(120);
    expect(lakeFull.accuracy).toBeLessThan(120);
  });

  it("신규 6T HARD 보스는 일반판 이미지를 재사용하고 70%·40%에서 다음 공격의 페이즈를 강화한다", () => {
    const scorpion = COOP_BOSSES.canyon_predator_hard;
    const lake = COOP_BOSSES.lake_sovereign_hard;

    expect(scorpion.base.image).toBe(COOP_BOSSES.canyon_predator.base.image);
    expect(lake.base.image).toBe(COOP_BOSSES.lake_sovereign.base.image);
    expect(coopBossDurationMs(scorpion)).toBe(COOP_DURATION_MAX_MS);
    expect(coopBossDurationMs(lake)).toBe(COOP_DURATION_MAX_MS);

    const scorpionFull = coopBossForBattle(scorpion, scorpion.sharedMaxHp).monster;
    const scorpionMid = coopBossForBattle(scorpion, scorpion.sharedMaxHp * 0.7).monster;
    const scorpionDeep = coopBossForBattle(scorpion, scorpion.sharedMaxHp * 0.4).monster;
    expect(scorpionFull.v2Skills?.equipped).toContain("mob_venom_bite");
    expect(scorpionMid.v2Skills?.equipped).toContain("mob_catastrophe_venom");
    expect(scorpionMid.spd).toBeGreaterThan(scorpionFull.spd);
    expect(scorpionMid.evasionPct).toBeGreaterThan(scorpionFull.evasionPct ?? 0);
    expect(scorpionDeep.v2Skills?.equipped).toContain("mob_venom_sunder");
    expect(scorpionDeep.atk).toBeGreaterThan(scorpionMid.atk);
    expect(scorpionMid.spd).toBe(25);
    expect(scorpionDeep.atk).toBe(1_005);
    expect(scorpionDeep.skill).toMatchObject({
      kind: "pierce",
      armorPierce: 24,
    });

    const lakeFull = coopBossForBattle(lake, lake.sharedMaxHp).monster;
    const lakeMid = coopBossForBattle(lake, lake.sharedMaxHp * 0.7).monster;
    const lakeDeep = coopBossForBattle(lake, lake.sharedMaxHp * 0.4).monster;
    expect(lakeFull.atkType).toBe("magic");
    expect(lakeFull.v2Skills?.equipped).toContain("mob_chilling_touch");
    expect(lakeMid.v2Skills?.equipped).toContain("mob_deep_chill");
    expect(lakeMid.def).toBeGreaterThan(lakeFull.def);
    expect(lakeMid.magicDef).toBeGreaterThan(lakeFull.magicDef ?? 0);
    expect(lakeDeep.v2Skills?.equipped).toContain("mob_glacial_chill");
    expect(lakeDeep.atk).toBeGreaterThan(lakeMid.atk);
    expect(lakeDeep.atk).toBe(1_005);
    expect(lakeDeep.def).toBe(809);
    expect(lakeDeep.magicDef).toBe(1_020);
    expect(lakeDeep.skill).toMatchObject({
      kind: "chill",
      perHit: 4,
      dmgPerStack: 30,
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
    expect(COOP_SP_FRUIT_CHANCE.gold).toBe(0.05);
    expect(COOP_SP_FRUIT_CHANCE.epic).toBe(0.075);
    expect(COOP_SP_FRUIT_CHANCE.legend).toBe(0.1);
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
    // 경계 — rng < chance 통과. gold(0.05): 0.049 통과·0.05 실패.
    expect(rollCoopSpFruits("gold", () => 0.049)).toBe(1);
    expect(rollCoopSpFruits("gold", () => 0.05)).toBe(0);
    // 부분 — legend 에서 GOLD(0.05)만 통과: 0.04<0.05 통과, EPIC(0.075)·LEGEND(0.10) 실패시키려면
    //   각 굴림이 다른 값을 봐야 함. 시퀀스 rng 로 [통과, 실패, 실패].
    const seq = [0.04, 0.3, 0.4];
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
        if (b.rewardMode === "coop") {
          expect(V2_EQUIPMENT[u]?.signature).toBeDefined(); // 기존 협동 보스 발동형 효과
        }
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
      if (
        id === "glacial_colossus" ||
        id === "invincible_fortress" ||
        id === "skyward_crystal_eye"
      ) {
        expect(full.monster.skill).toBeUndefined();
      } else {
        expect(full.monster.skill).toBeDefined();
      }
      expect(full.monster.phaseTrigger).toBeUndefined(); // 발악 스테이지로 대체
      expect(full.enrageNotes).toHaveLength(0);
      // statusSkill — v2Skills 주입(잡몹 statusSkill 경로와 동일).
      if (b.statusSkill) {
        expect(full.monster.v2Skills?.equipped).toContain(b.statusSkill);
      }
      for (const skill of b.base.v2Skills?.equipped ?? []) {
        expect(full.monster.v2Skills?.equipped).toContain(skill);
      }
      expect(full.monster.v2MaxMp).toBe(b.base.v2MaxMp ?? 0);
      expect(
        coopBossForBattle(b, b.sharedMaxHp, { bossMp: 7 }).monster.v2MaxMp,
      ).toBe((b.base.v2MaxMp ?? 0) > 0 ? 7 : 0);
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
    expect(b.enrageStages).toEqual([]);
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

  it("하드 산군 — 추가 발악 없이 깊이로 공허의 대사제보다 강한 물리 압박을 준다", () => {
    const hard = COOP_BOSSES.mountain_chief_hard;
    const priest = COOP_BOSSES.void_priest;
    const priestFull = coopBossForBattle(priest, priest.sharedMaxHp).monster;
    const priestHalf = coopBossForBattle(priest, priest.sharedMaxHp * 0.5).monster;
    const hardFull = coopBossForBattle(hard, hard.sharedMaxHp).monster;
    const hardHalfWeakened = coopBossForBattle(hard, hard.sharedMaxHp * 0.5, {
      conditionalEnrageWeakened: true,
    }).monster;

    expect(hard.anchorDepth).toBe(68);
    expect(hard.enrageStages).toEqual([]);
    expect(hardFull.atk).toBeGreaterThan(priestFull.atk);
    expect(hardFull.atk).toBeGreaterThan(priestHalf.atk);
    expect(hardHalfWeakened.atk).toBeGreaterThan(priestHalf.atk);
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
        { kind: "player_attack", text: "공격! [치명타] 100 피해를 입혔다." },
        { kind: "player_attack", text: "공격! 80 피해를 입혔다." },
        { kind: "info", text: "z" },
      ]),
    ).toBe(100);
  });

  it("기존 6종은 새 방어 체계에 재보정된 파생 전투 스탯을 유지한다", () => {
    const expected = {
      mountain_chief: { atk: 136, def: 45, magicDef: 49, accuracy: 9.63 },
      canyon_predator: { atk: 317, def: 56, magicDef: undefined, accuracy: 15.99 },
      lake_sovereign: { atk: 88, def: 100, magicDef: undefined, accuracy: 30.03 },
      void_priest: {
        atk: 501,
        def: 263,
        magicDef: undefined,
        accuracy: 124.28838673308641,
      },
      mountain_chief_hard: {
        atk: 655,
        def: 484,
        magicDef: 604,
        accuracy: 104.76274329310041,
      },
      abyssal_tyrant: {
        atk: 1063,
        def: 234,
        magicDef: 453,
        accuracy: 134.2883867330864,
      },
    } as const;

    for (const id of Object.keys(expected) as Array<keyof typeof expected>) {
      const monster = coopBossForBattle(
        COOP_BOSSES[id],
        COOP_BOSSES[id].sharedMaxHp,
      ).monster;
      const stats = expected[id];
      expect(monster.atk).toBe(stats.atk);
      expect(monster.def).toBe(stats.def);
      expect(monster.magicDef).toBe(stats.magicDef);
      expect(monster.accuracy).toBeCloseTo(stats.accuracy);
    }
  });

  it("호수 기믹 피해와 심연어룡 공격 유형은 방어 체계 재보정값을 유지한다", () => {
    expect(COOP_BOSSES.lake_sovereign.base.skill).toMatchObject({
      kind: "chill",
      dmgPerStack: 17,
    });
    expect(COOP_BOSSES.abyssal_tyrant.base.atkType).toBe("magic");
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
    expect(parseCoopBossKindId("canyon_predator_hard")).toBe("canyon_predator_hard");
    expect(parseCoopBossKindId("lake_sovereign_hard")).toBe("lake_sovereign_hard");
    expect(parseCoopBossKindId("nope")).toBeNull();
    expect(parseCoopBossKindId(42)).toBeNull();
    expect(parseCoopBossKindId(null)).toBeNull();
  });
  it("공유 MP — 기본 풀은 base MP의 공유 배율이며 mechanicState 로 보존된다", () => {
    const boss = COOP_BOSSES.mountain_chief;
    const maxMp = coopBossMaxMp(boss);
    expect(maxMp).toBe((boss.base.v2MaxMp ?? 0) * 8);
    expect(coopBossCurrentMp(boss, {})).toBe(maxMp);
    const state = withCoopBossMp(boss, {}, 123);
    expect(parseCoopMechanicState(state).bossMp).toBe(123);
  });

  it("추적 위협만 0~100으로 보정하며 기존 공유 MP 상태를 보존한다", () => {
    const tracking = COOP_BOSSES.tracking_weapon;
    const parsed = parseCoopMechanicState({
      bossMp: 17,
      trackingThreat: 180,
    });
    expect(parsed).toEqual({ bossMp: 17, trackingThreat: 100 });
    expect(coopBossTrackingThreat(tracking, { trackingThreat: 73 })).toBe(73);
    expect(coopBossTrackingThreatMax(tracking)).toBe(100);
    expect(withCoopBossTrackingThreat(tracking, { bossMp: 17 }, 31)).toEqual({
      bossMp: 17,
      trackingThreat: 31,
    });
    expect(coopBossTrackingThreatMax(COOP_BOSSES.toxic_blood_lord)).toBe(0);
    expect(
      coopBossTrackingThreat(COOP_BOSSES.toxic_blood_lord, {
        trackingThreat: 73,
      }),
    ).toBe(0);
  });

  it("불괴의 성채 상태를 정규화·병합하며 공유 MP와 알려진 키만 보존한다", () => {
    const fortress = COOP_BOSSES.invincible_fortress;
    const merged = withCoopInvincibleFortressState(
      fortress,
      { bossMp: 7, unknownKey: true },
      {
        ...initialInvincibleFortressState(fortress.sharedMaxHp),
        barrierDamage: 1_000,
      },
      fortress.sharedMaxHp,
    );

    expect(merged).toMatchObject({
      bossMp: 7,
      fortress: { activeBarrierIndex: 0, barrierDamage: 1_000 },
    });
    expect(merged).not.toHaveProperty("unknownKey");
  });

  it.each([
    [0.9, 1],
    [0.6, 2],
    [0.4, 3],
    [0.2, 4],
  ] as const)(
    "레거시 성채 세션 HP %s에서는 지난 방벽 %i개를 무광폭 완료로 복원한다",
    (hpFraction, completedBarrierCount) => {
      const fortress = COOP_BOSSES.invincible_fortress;
      const state = coopInvincibleFortressState(
        fortress,
        { bossMp: 7 },
        fortress.sharedMaxHp * hpFraction,
      );

      expect(state).toMatchObject({
        completedBarrierCount,
        activeBarrierIndex: null,
        enrageTier: 0,
        barrierResults: [],
      });
    },
  );

  it("불괴의 성채 목록·상세 표시값을 저장 상태에서 한 번에 계산한다", () => {
    const fortress = COOP_BOSSES.invincible_fortress;
    const display = coopInvincibleFortressDisplay(
      fortress,
      {
        fortress: {
          kind: "invincible_fortress",
          completedBarrierCount: 1,
          activeBarrierIndex: 1,
          barrierTicksRemaining: 240,
          barrierDamage: 18_200,
          enrageTier: 0,
          barrierResults: [2],
        },
      },
      Math.floor(fortress.sharedMaxHp * 0.75),
    );

    expect(display).toEqual({
      fortressBarrierActive: true,
      fortressBarrierTicksRemaining: 240,
      fortressBarrierDamage: 18_200,
      fortressBarrierTarget: 32_400,
      fortressEnrageTier: 2,
      fortressProjectedEnrageTier: 2,
      fortressCompletedBarrierCount: 1,
      fortressNextBarrierHpFraction: 0.5,
      fortressLastResultTier: 2,
    });
  });

  it("천공의 수정안 상태를 정규화·병합하며 기존 기믹 키를 보존한다", () => {
    const eye = COOP_BOSSES.skyward_crystal_eye;
    const merged = withCoopSkywardCrystalEyeState(
      eye,
      { bossMp: 7, trackingThreat: 31, unknownKey: true },
      {
        ...initialSkywardCrystalEyeState(),
        aimTicksRemaining: 640,
        disruptionStacks: 17,
      },
    );

    expect(merged).toMatchObject({
      bossMp: 7,
      trackingThreat: 31,
      crystalEye: { aimTicksRemaining: 640, disruptionStacks: 17 },
    });
    expect(merged).not.toHaveProperty("unknownKey");
    expect(
      coopSkywardCrystalEyeState(eye, {
        crystalEye: { kind: "skyward_crystal_eye", aimTicksRemaining: -4 },
      }),
    ).toMatchObject({ aimTicksRemaining: 0, disruptionStacks: 0 });
  });

  it("천공의 수정안 목록·상세 표시값을 저장 상태에서 한 번에 계산한다", () => {
    const eye = COOP_BOSSES.skyward_crystal_eye;
    const display = coopSkywardCrystalEyeDisplay(
      eye,
      {
        crystalEye: {
          kind: "skyward_crystal_eye",
          aimTicksRemaining: 640,
          disruptionStacks: 17,
          coreExposureTicksRemaining: 180,
          artilleryCount: 2,
          lastArtilleryStacks: 12,
          lastArtilleryPowerPct: 70,
          lastArtilleryDamage: 1234,
        },
      },
      Math.floor(eye.sharedMaxHp * 0.6),
    );

    expect(display).toEqual({
      crystalEyeAimTicksRemaining: 640,
      crystalEyeDisruptionStacks: 17,
      crystalEyeProjectedPowerPct: 60,
      crystalEyeBasePowerPct: 210,
      crystalEyeCoreExposed: true,
      crystalEyeCoreExposureTicksRemaining: 180,
      crystalEyeArtilleryCount: 2,
      crystalEyeLastArtilleryStacks: 12,
      crystalEyeLastArtilleryPowerPct: 70,
      crystalEyeLastArtilleryDamage: 1234,
    });
  });

  it("공유 MP — 플레이어 공격 로그와 기여 피해로 압박 피해를 계산한다", () => {
    const boss = COOP_BOSSES.mountain_chief;
    const damage = coopBossMpPressureDamage(
      [
        { kind: "player_attack", text: "공격! 10 피해를 입혔다." },
        // 저장된 과거 리플레이의 이전 표기도 치명타로 판독한다.
        { kind: "player_attack", text: "공격! [크리티컬] 20 피해를 입혔다." },
        { kind: "enemy_attack", text: "반격! 5 피해를 입혔다." },
      ],
      {
        damageDealt: Math.floor(boss.sharedMaxHp * 0.05),
        bossMaxHp: boss.sharedMaxHp,
        bossMaxMp: coopBossMaxMp(boss),
      },
    );
    expect(damage).toBeGreaterThan(0);
  });
});

describe("coopTierForRatio", () => {
  it("임계 경계 — 미달 null·각 임계 도달 시 그 티어", () => {
    expect(COOP_TIER_THRESHOLDS).toEqual({
      bronze: 0.03,
      silver: 0.1,
      gold: 0.2,
      epic: 0.3,
      legend: 0.35,
    });
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
    expect(COOP_HARD_TIER_THRESHOLDS).toEqual({
      bronze: 0.05,
      silver: 0.1,
      gold: 0.18,
      epic: 0.3,
      legend: 0.35,
    });
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
    expect(coopTierThresholdFor("bronze", "canyon_predator_hard")).toBe(
      COOP_HARD_TIER_THRESHOLDS.bronze,
    );
    expect(coopTierThresholdFor("bronze", "lake_sovereign_hard")).toBe(
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
  it("새 협동 보스는 소환자만 볼 수 있는 상태로 시작한다", () => {
    expect(COOP_INITIAL_VISIBILITY).toBe("summoner_only");
  });

  it("전체 공개 전에는 개인과 길드 범위를 오갈 수 있다", () => {
    expect(coopVisibilityTransition("summoner_only", "guild_only")).toEqual({
      ok: true,
      changed: true,
    });
    expect(coopVisibilityTransition("guild_only", "summoner_only")).toEqual({
      ok: true,
      changed: true,
    });
  });

  it("개인 또는 길드 보스는 전체 공개로 전환할 수 있다", () => {
    expect(coopVisibilityTransition("summoner_only", "public")).toEqual({
      ok: true,
      changed: true,
    });
    expect(coopVisibilityTransition("guild_only", "public")).toEqual({
      ok: true,
      changed: true,
    });
  });

  it("전체 공개된 보스는 개인이나 길드 범위로 되돌릴 수 없다", () => {
    expect(coopVisibilityTransition("public", "summoner_only")).toEqual({
      ok: false,
      error: "visibility_locked",
    });
    expect(coopVisibilityTransition("public", "guild_only")).toEqual({
      ok: false,
      error: "visibility_locked",
    });
  });

  it("이미 전체 공개된 보스를 다시 공개하는 요청은 무변경 성공이다", () => {
    expect(coopVisibilityTransition("public", "public")).toEqual({
      ok: true,
      changed: false,
    });
  });

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
