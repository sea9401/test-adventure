import { describe, expect, it } from "vitest";
import {
  battleCountOf,
  combatStatsSection,
  cookingCodexSection,
  frontierDepthOf,
  fishingCodexSection,
  huntGateSections,
  isRecordedJobVisit,
  tier7AdvancementViewForJob,
  elementalSkillsSection,
  materialCodexSection,
  loadoutSection,
  proficiencySection,
  spFruitSection,
  tilePosOf,
} from "./stateSections";
import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import { V2_SKILLS, spCostOf } from "@/adventure/data/v2/v2Skills";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";

describe("battleCountOf", () => {
  it("monster kills 합 + 패배수 (랭킹 battleCount 와 동일 정의)", () => {
    expect(
      battleCountOf({
        monsters: { 늑대: { kills: 3 }, 골렘: { kills: 2 } },
        battleLosses: 4,
      }),
    ).toBe(9);
  });

  it("빈/손상 로그는 0", () => {
    expect(battleCountOf(null)).toBe(0);
    expect(battleCountOf(undefined)).toBe(0);
    expect(battleCountOf({})).toBe(0);
  });
});

describe("combatStatsSection", () => {
  it("최종 회복량 배율을 캐릭터 전투 스탯에 전달한다", () => {
    const combat = {
      player: {
        atk: 10,
        def: 8,
        spd: 7,
        healMult: 1.2744,
      },
    } as unknown as NonNullable<
      Parameters<typeof combatStatsSection>[0]
    >;

    expect(combatStatsSection(combat, 100, 50)).toMatchObject({
      healMult: 1.2744,
    });
  });

  it("원초 증폭의 장비 치명타 변환값을 캐릭터 전투 스탯에 전달한다", () => {
    const combat = {
      player: {
        atk: 10,
        def: 8,
        spd: 7,
        equipmentMagicSkillCritDmgPct: 29.5102,
      },
    } as unknown as NonNullable<
      Parameters<typeof combatStatsSection>[0]
    >;

    expect(combatStatsSection(combat, 100, 50)).toMatchObject({
      equipmentMagicSkillCritDmgPct: 29.5102,
    });
  });
});

describe("frontierDepthOf", () => {
  it("기본 2, 레거시 초과 깊이는 MAX 캡으로 정규화", () => {
    expect(frontierDepthOf(undefined)).toBe(2);
    expect(frontierDepthOf(0)).toBe(2);
    expect(frontierDepthOf(7)).toBe(7);
    expect(frontierDepthOf(9999)).toBe(MAX_FRONTIER_DEPTH);
  });
});

describe("tilePosOf", () => {
  it("col/row 숫자일 때만 좌표, at 은 있을 때만 동봉", () => {
    expect(tilePosOf(undefined)).toBeNull();
    expect(tilePosOf({ col: 1 })).toBeNull();
    expect(tilePosOf({ col: 1, row: 2 })).toEqual({ col: 1, row: 2 });
    expect(tilePosOf({ col: 1, row: 2, at: 5 })).toEqual({
      col: 1,
      row: 2,
      at: 5,
    });
  });
});

describe("spFruitSection / materialCodexSection", () => {
  it("빈 세이브에서 0 기반 형태를 돌려준다", () => {
    const fruit = spFruitSection(undefined);
    expect(fruit.capBonus).toBe(0);
    const codex = materialCodexSection(undefined);
    expect(codex.discovered).toBe(0);
    expect(codex.discoveredIds).toEqual([]);
    expect(codex.total).toBeGreaterThan(0);
  });
});

describe("loadoutSection — 직업 SP 산식 전환", () => {
  it("유예 상태와 이번 조회에서 제외된 스킬을 응답에 포함한다", () => {
    const endsAt = Date.UTC(2026, 7, 18, 0, 0, 0);
    const params = {
      charSave: { class: "warrior", level: 100 },
      proficiencyRaw: {},
      skillsRaw: {
        learned: ["v2c_warrior_strike"],
        equipped: ["v2c_warrior_strike"],
      },
      fishingCodexRaw: {},
      equipmentCodexSpBonus: 0,
      jobSpMigration: {
        graceActive: true,
        graceEndsAt: endsAt,
        newSpBudget: 44,
        legacySpBudget: 44,
        removedSkillIds: ["v2c_mage_fireball"],
      },
    } as Parameters<typeof loadoutSection>[0] & {
      jobSpMigration: {
        graceActive: boolean;
        graceEndsAt: number;
        newSpBudget: number;
        legacySpBudget: number;
        removedSkillIds: string[];
      };
    };

    expect(loadoutSection(params)).toMatchObject({
      spMigration: {
        graceActive: true,
        graceEndsAt: endsAt,
        overBudgetBy: 0,
        removedSkillIds: ["v2c_mage_fireball"],
      },
    });
  });

  it("근원 촉매 구성의 유효 SP와 재료·촉매 메타데이터를 직렬화한다", () => {
    const equipped = [
      "v2c_firemage_inferno",
      "v2c_frostmage_glacier",
      "v2c_lightningmage_thunderbolt",
      "v2c_windmage_tempest",
      "v2c_earthmage_tectonic",
      "v2c_primordialmage_return",
      "v2c_primordialmage_resonance",
      "v2c_elementallord_surge",
    ] as const;
    const section = loadoutSection({
      charSave: { class: "warrior", level: 100 },
      proficiencyRaw: {},
      skillsRaw: { learned: equipped, equipped },
      fishingCodexRaw: {},
      equipmentCodexSpBonus: 0,
    });

    expect(section.spUsed).toBe(31);
    expect(
      section.library.find((row) => row.skillId === "v2c_firemage_inferno"),
    ).toMatchObject({ spCost: 8, effectiveSpCost: 1, resonanceRole: "material" });
    expect(
      section.library.find((row) => row.skillId === "v2c_elementallord_surge"),
    ).toMatchObject({ spCost: 16, effectiveSpCost: 1, resonanceRole: "catalyst" });
  });
});

describe("cookingCodexSection", () => {
  it("기본 6종을 자동 등록하고 알려진 발견만 중복 없이 반환한다", () => {
    const section = cookingCodexSection({
      discoveredRecipeIds: ["rustic_bread", "rustic_bread", "unknown"],
    });

    expect(section.discoveredIds).toEqual([
      "rustic_bread",
      "herb_tea",
      "grilled_corn",
      "fish_skewer",
      "herb_flatbread",
      "country_egg_bread",
    ]);
    expect(section.total).toBeGreaterThan(section.discoveredIds.length);
  });
});

describe("fishingCodexSection", () => {
  it("도감 등록권과 실제 포획 기록을 서로 분리해 직렬화한다", () => {
    const section = fishingCodexSection({
      fish: {
        carp: { registered: true, caughtEver: false },
        trout: {
          registered: false,
          caughtEver: true,
          bestSize: 55,
          totalCaught: 2,
          firstCaughtAt: 10,
          bestCaughtAt: 20,
        },
      },
    });

    expect(section.registeredIds).toEqual(["carp"]);
    expect(section.discoveredIds).toEqual(["carp"]);
    expect(section.caughtIds).toEqual(["trout"]);
    expect(section.best).toEqual({ trout: 55 });
  });
});

describe("huntGateSections", () => {
  it("스태미나 모드(테스트 env: HUNT_COOLDOWN_MODE off) — 쿨다운/오프라인 전부 null", () => {
    const gate = huntGateSections({ lastBattleAt: Date.now() }, Date.now());
    expect(gate.combatCooldown).toBeNull();
    expect(gate.offlinePending).toBeNull();
    expect(gate.offlineHunt).toBeNull();
  });
});

describe("proficiencySection", () => {
  it("빈 세이브 스모크 — 응답 shape(groups/caps/current) 유지", () => {
    const s = proficiencySection(undefined, { class: "warrior" });
    expect(s.groups).toBeDefined();
    expect(s.current.group).toBe("warrior");
    expect(typeof s.current.points).toBe("number");
    expect(typeof s.current.cumLevel).toBe("number");
    expect(s.current.cultivationPointsSpent).toBe(0);
    expect(s.current.cultivationResetGoldCost).toBe(0);
    // 코어루프 off(테스트 env)면 레거시 advance 객체가 노출된다(정점 전 직군).
    for (const k of ["str", "dex", "int"]) {
      expect(typeof s.caps[k]).toBe("number");
    }
  });

  it("수행 초기화 환급액과 다음 초기화 비용을 함께 제공한다", () => {
    const s = proficiencySection(
      {
        points: 10,
        groups: { warrior: { cultivations: 1, tier: 1, cumLevel: 0 } },
        caps: { str: 2, vit: 1, dex: 1 },
        cultivationPointsSpent: 8,
        cultivationResetCount: 1,
        growthRespecPoints: 27,
        cultivationLedgerVersion: 1,
      },
      { class: "warrior" },
    );

    expect(s.current.cultivationPointsSpent).toBe(8);
    expect(s.current.cultivationResetCount).toBe(1);
    expect(s.current.cultivationResetGoldCost).toBe(15_000_000);
    expect(s.current.growthRespecPoints).toBe(27);
  });

  it("사냥 숙련도가 높아도 표시 한계치는 기본 60 + 수행 이득만 반영한다", () => {
    const s = proficiencySection(
      {
        groups: {
          warrior: { cultivations: 0, tier: 1, cumLevel: 1800 },
        },
        caps: { str: 10 },
      },
      { class: "warrior" },
    );

    expect(s.caps.str).toBe(70);
    expect(s.caps.dex).toBe(60);
  });
});

describe("elementalSkillsSection", () => {
  it("학습 전에도 학습 숙달 비용과 장착 SP 비용을 함께 제공한다", () => {
    const rows = elementalSkillsSection(
      { class: "warrior", specChoice: null },
      { learned: [], equipped: [] },
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.learned).toBe(false);
      expect(row.cost).toBeGreaterThan(0);
      expect(row.spCost).toBe(spCostOf(V2_SKILLS[row.skillId]));
    }
  });
});

describe("isRecordedJobVisit", () => {
  it("현재 직업·전직 이력·숙련도 기록을 실제 전직 이력으로 보완한다", () => {
    const history = new Set(["squire"]);
    expect(
      isRecordedJobVisit({
        jobId: "warrior",
        currentJobId: "warrior",
        jobHistory: history,
        cumLevel: 0,
      }),
    ).toBe(true);
    expect(
      isRecordedJobVisit({
        jobId: "squire",
        currentJobId: "warrior",
        jobHistory: history,
        cumLevel: 0,
      }),
    ).toBe(true);
    expect(
      isRecordedJobVisit({
        jobId: "paladin",
        currentJobId: "warrior",
        jobHistory: new Set(),
        cumLevel: 120,
      }),
    ).toBe(true);
    expect(
      isRecordedJobVisit({
        jobId: "mage",
        currentJobId: "warrior",
        jobHistory: history,
        cumLevel: 0,
      }),
    ).toBe(false);
  });
});

describe("tier7AdvancementViewForJob", () => {
  it("serializes both prerequisite masteries and material progress", () => {
    const status = tier7AdvancementViewForJob({
      jobId: "shadowblade",
      currentJobId: "swordsaint",
      level: 100,
      proficiency: {
        ...emptyProficiency(),
        jobCumLevel: { swordsaint: 99_999, blackmoon: 100_000 },
      },
      materials: { v2_storm_origin_fragment: 29 },
    });

    expect(status).toMatchObject({
      permanentlyUnlocked: false,
      prerequisiteProgress: [
        { jobId: "swordsaint", current: 99_999, required: 100_000, met: false },
        { jobId: "blackmoon", current: 100_000, required: 100_000, met: true },
      ],
      material: { current: 29, required: 30, met: false },
      firstUnlockReady: false,
    });
  });

  it("reports a ready candidate and a history-unlocked revisit", () => {
    const ready = tier7AdvancementViewForJob({
      jobId: "shadowblade",
      currentJobId: "blackmoon",
      level: 100,
      proficiency: {
        ...emptyProficiency(),
        jobCumLevel: { swordsaint: 100_000, blackmoon: 100_000 },
      },
      materials: { v2_storm_origin_fragment: 30 },
    });
    const permanent = tier7AdvancementViewForJob({
      jobId: "shadowblade",
      currentJobId: "warrior",
      level: 1,
      proficiency: {
        ...emptyProficiency(),
        jobHistory: ["shadowblade"],
      },
      materials: {},
    });

    expect(ready?.firstUnlockReady).toBe(true);
    expect(permanent).toMatchObject({
      permanentlyUnlocked: true,
      failure: null,
    });
  });
});
