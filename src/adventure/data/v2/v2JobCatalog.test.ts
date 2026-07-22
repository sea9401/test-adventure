import { describe, it, expect } from "vitest";
import {
  V2_JOB_CATALOG,
  V2_JOB_LIST,
  TIER2_UNLOCK_CUMLEVEL,
  TIER3_UNLOCK_CUMLEVEL,
  TIER4_UNLOCK_CUMLEVEL,
  TIER5_UNLOCK_CUMLEVEL,
  TIER6_UNLOCK_CUMLEVEL,
  FISHING_TIER2_UNLOCK_CUMLEVEL,
  FISHING_TIER3_UNLOCK_CUMLEVEL,
  FISHING_TIER4_UNLOCK_CUMLEVEL,
  FISHING_TIER5_UNLOCK_CUMLEVEL,
  FISHING_TIER6_UNLOCK_CUMLEVEL,
  FARMING_TIER2_UNLOCK_CUMLEVEL,
  WOODCUTTING_TIER2_UNLOCK_CUMLEVEL,
  WOODCUTTING_LEVEL_REQUIREMENTS,
  MINING_TIER2_UNLOCK_CUMLEVEL,
  MINING_LEVEL_REQUIREMENTS,
  FARMING_LEVEL_REQUIREMENTS,
  LEGACY_CLASS_SPEC_BY_JOB,
  DROPPED_SPEC_TO_SURVIVING,
  CATALOG_USES_QUEST_CONDITION,
  CATALOG_USES_FARMING_LEVEL_CONDITION,
  CATALOG_USES_WOODCUTTING_LEVEL_CONDITION,
  CATALOG_USES_MINING_LEVEL_CONDITION,
  jobIdFromLegacy,
  isJobUnlocked,
  isDirectNextJob,
  jobById,
  unlockedJobs,
  jobUnlockSpBonus,
  jobUnlockConditionText,
  cumLevelForJob,
  isFarmingJobId,
  isFishingJobId,
  isWoodcuttingJobId,
  isMiningJobId,
  isLifestyleMasteryJobId,
  rejobRequiredLevel,
  type V2JobDefinition,
  type ExtraJobCondition,
  type JobUnlockContext,
} from "./v2JobCatalog";
import { V2_LEVEL_CAP } from "./coreLoopConfig";
import { jobDisplayName } from "./classes";
import {
  V2_CULTIVATE_PROFILE,
  V2_HYBRID_CULTIVATE_PROFILE,
} from "./proficiency";
import { V2_STAT_KEYS, type V2StatKey } from "./v2StatKeys";
import { emptyProficiency, type V2ProficiencyState } from "./proficiency";

const BASE_JOBS = ["warrior", "martial", "mage", "rogue"];
const LEGACY_CLASSES = [...BASE_JOBS, "survivor"];
const TIER2_BY_PARENT: Record<string, string[]> = {
  warrior: ["shieldman", "squire"],
  martial: ["boxer", "monk"],
  mage: ["caster", "acolyte", "warder"],
  rogue: ["assassin", "archer", "venomist"],
  survivor: ["camper", "ironman", "fisher", "healthtrainer", "farmer", "lumberjack", "miner"],
};
// 🔑 계보 게이팅: tier-3 child → 바로 아래 tier-2 부모 직업. tier-4 child → 바로 아래 tier-3 부모.
const TIER3_LINEAGE: Record<string, string> = {
  paladin: "squire",
  guardian: "shieldman",
  berserker: "squire",
  brawler: "boxer",
  warmonk: "monk",
  magus: "caster",
  shaman: "caster",
  bishop: "acolyte",
  ritualist: "warder",
  ranger: "archer",
  shadow: "assassin",
  venomancer: "venomist",
  fieldmedic: "camper",
  extremesurvivor: "ironman",
  angler: "fisher",
  physicalcoach: "healthtrainer",
  horticulturist: "farmer",
  foresttechnician: "lumberjack",
  miningtechnician: "miner",
};
const TIER4_LINEAGE: Record<string, string> = {
  veteran: "paladin",
  warlord: "berserker",
  sensei: "brawler",
  sage: "magus",
  firemage: "magus",
  frostmage: "magus",
  lightningmage: "magus",
  windmage: "magus",
  earthmage: "magus",
  runecaster: "magus",
  archshaman: "shaman",
  archbishop: "bishop",
  spellsealer: "ritualist",
  chief: "ranger",
  venomlord: "venomancer",
  battlemonk: "warmonk", // 무도 4차 두 번째 갈래 — 무승 계보
  rescueexpert: "fieldmedic",
  returner: "extremesurvivor",
  masterangler: "angler",
  mastertrainer: "physicalcoach",
  masterfarmer: "horticulturist",
  masterlumberjack: "foresttechnician",
  masterminer: "miningtechnician",
  crusader: "templar",
  runeknight: "spellblade",
  crimsontemplar: "bloodtemplar",
};
const TIER5_LINEAGE: Record<string, string> = {
  swordmaster: "veteran",
  ironknight: "warden",
  overlord: "warlord",
  arcanist: "sage",
  inscriber: "runecaster",
  marksman: "chief",
  nightshade: "phantom",
  saint: "archbishop",
  plaguebringer: "venomlord",
  dragonfist: "sensei",
  adamantmonk: "battlemonk",
  immortal: "returner",
  championmaker: "mastertrainer",
  fullcatchking: "masterangler",
  harvestking: "masterfarmer",
  forestmaster: "masterlumberjack",
  minemaster: "masterminer",
  bloodlord: "crimsontemplar",
  calamitycaller: "archshaman",
};
const TIER6_LINEAGE: Record<string, string> = {
  fortressknight: "ironknight",
  swordsaint: "swordmaster",
  hegemon: "overlord",
  archmage: "arcanist",
  primordialmage: "elementallord",
  savior: "saint",
  doomprophet: "calamitycaller",
  heavenlybow: "marksman",
  blackmoon: "nightshade",
  myriadvenom: "plaguebringer",
  celestialdragon: "dragonfist",
  vajraarhat: "adamantmonk",
  eternal: "immortal",
  legendarytrainer: "championmaker",
  seagod: "fullcatchking",
  earthartisan: "harvestking",
  legendarylumberjack: "forestmaster",
  legendaryminer: "minemaster",
  blooddemon: "bloodlord",
  absolute: "transcendent",
};

function profWith(groupCumLevels: Record<string, number>) {
  const prof = emptyProficiency();
  for (const [id, cumLevel] of Object.entries(groupCumLevels)) {
    prof.groups[id] = { cultivations: 0, tier: 1, cumLevel };
  }
  return prof;
}

// 직업별 숙련도(jobCumLevel)로 구성한 계보 게이팅(tier-3/4)은 부모 직업의 jobCumLevel 을 본다.
function profJobs(jobCumLevels: Record<string, number>): V2ProficiencyState {
  return { ...emptyProficiency(), jobCumLevel: { ...jobCumLevels } };
}

describe("jobUnlockSpBonus", () => {
  it("실제 해금 직업(tier>0) 하나당 SP +1로 센다", () => {
    expect(jobUnlockSpBonus(emptyProficiency())).toBe(4);
    expect(jobUnlockSpBonus(profWith({ warrior: TIER2_UNLOCK_CUMLEVEL }))).toBe(
      6,
    );
  });
});

describe("v2JobCatalog 구조", () => {
  it("115개 직업(루트 2 + 기본 4 + 상위 17 + 고차 23 + 심화 28 + 5차 21 + 6차 20)을 정의한다", () => {
    expect(V2_JOB_LIST).toHaveLength(115);
    const byTier = (t: number) => V2_JOB_LIST.filter((j) => j.tier === t).length;
    expect(byTier(0)).toBe(2);
    expect(byTier(1)).toBe(4);
    expect(byTier(2)).toBe(17);
    expect(byTier(3)).toBe(23);
    expect(byTier(4)).toBe(28);
    expect(byTier(5)).toBe(21);
    expect(byTier(6)).toBe(20);
  });

  it("모든 항목의 id 가 카탈로그 키와 일치한다", () => {
    for (const [key, job] of Object.entries(V2_JOB_CATALOG)) {
      expect(job.id).toBe(key);
    }
  });

  it("jobById 가 정의를 반환하고, 없는 id 는 undefined", () => {
    expect(jobById("squire")?.name).toBe("견습 기사");
    expect(jobById("nope")).toBeUndefined();
  });

  it("직업 내장 보너스(jobBonus) — 직업(tier≥1)마다 존재, 루트(tier0)는 없음", () => {
    // "이 직업에 머무를 이유" = 내장 보너스. 0으로 비면 직업 정체성이 사라지므로 회귀 가드.
    for (const job of V2_JOB_LIST) {
      const total = Object.values(job.jobBonus).reduce(
        (s, v) => s + (v ?? 0),
        0,
      );
      if (job.tier === 0) {
        expect(total, `${job.id}(루트)`).toBe(0);
      } else {
        expect(total, `${job.id} 내장 보너스 합`).toBeGreaterThan(0);
      }
    }
  });
});

describe("스탯 맵 무결성", () => {
  const allStatMaps = (job: V2JobDefinition) => [
    ["cultivateProfile", job.cultivateProfile] as const,
    ["jobBonus", job.jobBonus] as const,
  ];

  it("cultivateProfile·jobBonus 의 키는 전부 유효 V2StatKey, 값은 양수", () => {
    for (const job of V2_JOB_LIST) {
      for (const [label, map] of allStatMaps(job)) {
        for (const [stat, val] of Object.entries(map)) {
          expect(
            (V2_STAT_KEYS as readonly string[]).includes(stat),
            `${job.id}.${label}.${stat}`,
          ).toBe(true);
          expect(val, `${job.id}.${label}.${stat}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("기본 직업의 cultivateProfile 은 V2_CULTIVATE_PROFILE 과 동일하다(동기화 보증)", () => {
    for (const id of BASE_JOBS) {
      expect(V2_JOB_CATALOG[id].cultivateProfile).toEqual(
        V2_CULTIVATE_PROFILE[id],
      );
    }
  });

  it("하이브리드 직업의 cultivateProfile 은 V2_HYBRID_CULTIVATE_PROFILE 과 동일하다(수행 동기화)", () => {
    // 수행은 V2_HYBRID_CULTIVATE_PROFILE 을 쓰므로 카탈로그(문서·표시)와 드리프트하면 안 된다.
    const hybridIds = Object.keys(V2_HYBRID_CULTIVATE_PROFILE);
    expect(hybridIds.length).toBeGreaterThan(0);
    for (const id of hybridIds) {
      expect(V2_JOB_CATALOG[id]?.cultivateProfile, id).toEqual(
        V2_HYBRID_CULTIVATE_PROFILE[id],
      );
      // 합 4 고정(비용 곡선·economy 불변) — 초월자는 올스탯 정체성 때문에 예외적으로 6.
      const sum = Object.values(V2_HYBRID_CULTIVATE_PROFILE[id]).reduce(
        (s, v) => s + (v ?? 0),
        0,
      );
      expect(sum, `${id} 프로필 합`).toBe(
        id === "transcendent" || id === "absolute" ? 6 : 4,
      );
    }
  });

  it("모험가 jobBonus 는 비어 있다(HP% 는 별도 적용)", () => {
    expect(V2_JOB_CATALOG.none.jobBonus).toEqual({});
    expect(V2_JOB_CATALOG.survivor.jobBonus).toEqual({});
  });
});

describe("해금 트리", () => {
  it("일반 직업 차수별 숙련도 요구치를 고정한다", () => {
    expect(TIER2_UNLOCK_CUMLEVEL).toBe(1000);
    expect(TIER3_UNLOCK_CUMLEVEL).toBe(2500);
    expect(TIER4_UNLOCK_CUMLEVEL).toBe(4500);
    expect(TIER5_UNLOCK_CUMLEVEL).toBe(18000);
    expect(TIER6_UNLOCK_CUMLEVEL).toBe(35000);
  });

  it("루트·기본 4직업은 prereqs 가 비어 있다", () => {
    expect(V2_JOB_CATALOG.none.unlock.prereqs).toEqual({});
    expect(V2_JOB_CATALOG.survivor.unlock.prereqs).toEqual({});
    for (const id of BASE_JOBS) {
      expect(V2_JOB_CATALOG[id].unlock.prereqs).toEqual({});
    }
  });

  it("상위 직업은 부모 기본 직업의 cumLevel ≥ TIER2_UNLOCK_CUMLEVEL 을 요구한다", () => {
    for (const [parent, children] of Object.entries(TIER2_BY_PARENT)) {
      for (const childId of children) {
        const job = V2_JOB_CATALOG[childId];
        expect(job.tier).toBe(2);
        const required =
          childId === "fisher"
            ? FISHING_TIER2_UNLOCK_CUMLEVEL
            : childId === "farmer"
              ? FARMING_TIER2_UNLOCK_CUMLEVEL
              : childId === "lumberjack"
                ? WOODCUTTING_TIER2_UNLOCK_CUMLEVEL
                : childId === "miner"
                  ? MINING_TIER2_UNLOCK_CUMLEVEL
                : TIER2_UNLOCK_CUMLEVEL;
        expect(job.unlock.prereqs).toEqual({ [parent]: required });
      }
    }
  });

  it("고차 직업은 계보(바로 아래 2차 부모) jobCumLevel ≥ TIER3 을 요구한다", () => {
    for (const [childId, parent] of Object.entries(TIER3_LINEAGE)) {
      const job = V2_JOB_CATALOG[childId];
      expect(job.tier).toBe(3);
      if (isFarmingJobId(childId) || isWoodcuttingJobId(childId) || isMiningJobId(childId)) {
        expect(job.unlock.prereqs).toEqual({});
        expect(job.unlock.extraConditions).toContainEqual({
          type: "jobUnlocked",
          jobId: parent,
        });
        expect(V2_JOB_CATALOG[parent].tier).toBe(2);
        continue;
      }
      const required =
        childId === "angler"
          ? FISHING_TIER3_UNLOCK_CUMLEVEL
          : TIER3_UNLOCK_CUMLEVEL;
      expect(job.unlock.prereqs).toEqual({ [parent]: required });
      // 계보 부모는 tier-2 직업 → isJobUnlocked 가 jobCumLevel 로 분기(직군 cumLevel 아님).
      expect(V2_JOB_CATALOG[parent].tier).toBe(2);
    }
  });

  it("심화 직업은 계보(바로 아래 3차 부모) jobCumLevel ≥ TIER4 을 요구한다", () => {
    for (const [childId, parent] of Object.entries(TIER4_LINEAGE)) {
      const job = V2_JOB_CATALOG[childId];
      expect(job.tier).toBe(4);
      if (isFarmingJobId(childId) || isWoodcuttingJobId(childId) || isMiningJobId(childId)) {
        expect(job.unlock.prereqs).toEqual({});
        expect(job.unlock.extraConditions).toContainEqual({
          type: "jobUnlocked",
          jobId: parent,
        });
        expect(V2_JOB_CATALOG[parent].tier).toBe(3);
        continue;
      }
      const required =
        childId === "masterangler"
          ? FISHING_TIER4_UNLOCK_CUMLEVEL
          : TIER4_UNLOCK_CUMLEVEL;
      expect(job.unlock.prereqs).toEqual({ [parent]: required });
      expect(V2_JOB_CATALOG[parent].tier).toBe(3);
    }
    // 임계 램프: tier2 < tier3 < tier4.
    expect(TIER2_UNLOCK_CUMLEVEL).toBeLessThan(TIER3_UNLOCK_CUMLEVEL);
    expect(TIER3_UNLOCK_CUMLEVEL).toBeLessThan(TIER4_UNLOCK_CUMLEVEL);
  });

  it("낚시 계열은 reel 성공 기반 숙련도라 2026-07 상향 전 요구치를 유지한다", () => {
    expect(V2_JOB_CATALOG.fisher.unlock.prereqs).toEqual({
      survivor: 900,
    });
    expect(V2_JOB_CATALOG.angler.unlock.prereqs).toEqual({
      fisher: 1800,
    });
    expect(V2_JOB_CATALOG.masterangler.unlock.prereqs).toEqual({
      angler: 2700,
    });
    expect(V2_JOB_CATALOG.fullcatchking.unlock.prereqs).toEqual({
      masterangler: 5400,
    });
    expect(V2_JOB_CATALOG.seagod.unlock.prereqs).toEqual({
      fullcatchking: 9000,
    });
  });

  it("나무꾼은 생존자 숙련도 900에서 해금된다", () => {
    expect(V2_JOB_CATALOG.lumberjack).toMatchObject({
      name: "나무꾼",
      tier: 2,
      unlock: { prereqs: { survivor: 900 } },
    });
  });

  it("나무꾼 상위 직업은 선행 직업과 벌목 레벨을 요구한다", () => {
    for (const [jobId, parentId, level] of [
      ["foresttechnician", "lumberjack", WOODCUTTING_LEVEL_REQUIREMENTS.foresttechnician],
      ["masterlumberjack", "foresttechnician", WOODCUTTING_LEVEL_REQUIREMENTS.masterlumberjack],
      ["forestmaster", "masterlumberjack", WOODCUTTING_LEVEL_REQUIREMENTS.forestmaster],
      ["legendarylumberjack", "forestmaster", WOODCUTTING_LEVEL_REQUIREMENTS.legendarylumberjack],
    ] as const) {
      expect(V2_JOB_CATALOG[jobId].unlock).toEqual({
        prereqs: {},
        extraConditions: [
          { type: "jobUnlocked", jobId: parentId },
          { type: "woodcuttingLevel", min: level },
        ],
      });
      expect(
        isJobUnlocked(
          V2_JOB_CATALOG[jobId],
          profWith({ survivor: WOODCUTTING_TIER2_UNLOCK_CUMLEVEL }),
          { woodcuttingLevel: level - 1 },
        ),
      ).toBe(false);
      expect(
        isJobUnlocked(
          V2_JOB_CATALOG[jobId],
          profWith({ survivor: WOODCUTTING_TIER2_UNLOCK_CUMLEVEL }),
          { woodcuttingLevel: level },
        ),
      ).toBe(true);
    }
  });

  it("광부 계열은 생존자 숙련도 900과 채광 레벨로 차례대로 해금된다", () => {
    expect(V2_JOB_CATALOG.miner).toMatchObject({
      name: "광부",
      tier: 2,
      unlock: { prereqs: { survivor: 900 } },
    });
    for (const [jobId, parentId, level] of [
      ["miningtechnician", "miner", MINING_LEVEL_REQUIREMENTS.miningtechnician],
      ["masterminer", "miningtechnician", MINING_LEVEL_REQUIREMENTS.masterminer],
      ["minemaster", "masterminer", MINING_LEVEL_REQUIREMENTS.minemaster],
      ["legendaryminer", "minemaster", MINING_LEVEL_REQUIREMENTS.legendaryminer],
    ] as const) {
      expect(V2_JOB_CATALOG[jobId].unlock).toEqual({
        prereqs: {},
        extraConditions: [
          { type: "jobUnlocked", jobId: parentId },
          { type: "miningLevel", min: level },
        ],
      });
      expect(
        isJobUnlocked(
          V2_JOB_CATALOG[jobId],
          profWith({ survivor: MINING_TIER2_UNLOCK_CUMLEVEL }),
          { miningLevel: level - 1 },
        ),
      ).toBe(false);
      expect(
        isJobUnlocked(
          V2_JOB_CATALOG[jobId],
          profWith({ survivor: MINING_TIER2_UNLOCK_CUMLEVEL }),
          { miningLevel: level },
        ),
      ).toBe(true);
    }
  });

  it("농부 상위 직업은 숙련도 숫자 없이 선행 직업 해금과 농사 레벨만 요구한다", () => {
    expect(V2_JOB_CATALOG.farmer.unlock.prereqs).toEqual({
      survivor: 900,
    });
    expect(V2_JOB_CATALOG.horticulturist.unlock.prereqs).toEqual({});
    expect(V2_JOB_CATALOG.horticulturist.unlock.extraConditions).toEqual([
      { type: "jobUnlocked", jobId: "farmer" },
      { type: "farmingLevel", min: FARMING_LEVEL_REQUIREMENTS.horticulturist },
    ]);
    expect(V2_JOB_CATALOG.masterfarmer.unlock.prereqs).toEqual({});
    expect(V2_JOB_CATALOG.masterfarmer.unlock.extraConditions).toEqual([
      { type: "jobUnlocked", jobId: "horticulturist" },
      { type: "farmingLevel", min: FARMING_LEVEL_REQUIREMENTS.masterfarmer },
    ]);
    expect(V2_JOB_CATALOG.harvestking.unlock.prereqs).toEqual({});
    expect(V2_JOB_CATALOG.harvestking.unlock.extraConditions).toEqual([
      { type: "jobUnlocked", jobId: "masterfarmer" },
      { type: "farmingLevel", min: FARMING_LEVEL_REQUIREMENTS.harvestking },
    ]);
    expect(V2_JOB_CATALOG.earthartisan.unlock.prereqs).toEqual({});
    expect(V2_JOB_CATALOG.earthartisan.unlock.extraConditions).toEqual([
      { type: "jobUnlocked", jobId: "harvestking" },
      { type: "farmingLevel", min: FARMING_LEVEL_REQUIREMENTS.earthartisan },
    ]);
  });

  it("5차 직업은 계보(바로 아래 4차 부모) jobCumLevel ≥ TIER5 을 요구한다", () => {
    for (const [childId, parent] of Object.entries(TIER5_LINEAGE)) {
      const job = V2_JOB_CATALOG[childId];
      expect(job.tier).toBe(5);
      if (isFarmingJobId(childId) || isWoodcuttingJobId(childId) || isMiningJobId(childId)) {
        expect(job.unlock.prereqs).toEqual({});
        expect(job.unlock.extraConditions).toContainEqual({
          type: "jobUnlocked",
          jobId: parent,
        });
        expect(V2_JOB_CATALOG[parent].tier).toBe(4);
        if (isFarmingJobId(childId)) {
          expect(
            isJobUnlocked(job, profWith({ survivor: FARMING_TIER2_UNLOCK_CUMLEVEL }), {
              farmingLevel: FARMING_LEVEL_REQUIREMENTS.harvestking - 1,
            }),
          ).toBe(false);
          expect(
            isJobUnlocked(job, profWith({ survivor: FARMING_TIER2_UNLOCK_CUMLEVEL }), {
              farmingLevel: FARMING_LEVEL_REQUIREMENTS.harvestking,
            }),
          ).toBe(true);
        }
        continue;
      }
      const required =
        childId === "fullcatchking"
          ? FISHING_TIER5_UNLOCK_CUMLEVEL
          : TIER5_UNLOCK_CUMLEVEL;
      expect(job.unlock.prereqs).toEqual({ [parent]: required });
      expect(V2_JOB_CATALOG[parent].tier).toBe(4);
      expect(isJobUnlocked(job, profJobs({ [parent]: required - 1 }))).toBe(
        false,
      );
      expect(isJobUnlocked(job, profJobs({ [parent]: required }))).toBe(true);
    }
    const elementalPrereqs = {
      firemage: TIER5_UNLOCK_CUMLEVEL,
      frostmage: TIER5_UNLOCK_CUMLEVEL,
      lightningmage: TIER5_UNLOCK_CUMLEVEL,
      windmage: TIER5_UNLOCK_CUMLEVEL,
      earthmage: TIER5_UNLOCK_CUMLEVEL,
    };
    expect(V2_JOB_CATALOG.elementallord.unlock.prereqs).toEqual(
      elementalPrereqs,
    );
    expect(
      isJobUnlocked(
        V2_JOB_CATALOG.elementallord,
        profJobs({ ...elementalPrereqs, earthmage: TIER5_UNLOCK_CUMLEVEL - 1 }),
      ),
    ).toBe(false);
    expect(
      isJobUnlocked(V2_JOB_CATALOG.elementallord, profJobs(elementalPrereqs)),
    ).toBe(true);
    expect(TIER4_UNLOCK_CUMLEVEL).toBeLessThan(TIER5_UNLOCK_CUMLEVEL);
  });

  it("6차 직업은 계보(바로 아래 5차 부모) jobCumLevel ≥ TIER6 을 요구한다", () => {
    for (const [childId, parent] of Object.entries(TIER6_LINEAGE)) {
      const job = V2_JOB_CATALOG[childId];
      expect(job.tier).toBe(6);
      if (isFarmingJobId(childId) || isWoodcuttingJobId(childId) || isMiningJobId(childId)) {
        expect(job.unlock.prereqs).toEqual({});
        expect(job.unlock.extraConditions).toContainEqual({
          type: "jobUnlocked",
          jobId: parent,
        });
        expect(V2_JOB_CATALOG[parent].tier).toBe(5);
        if (isFarmingJobId(childId)) {
          expect(
            isJobUnlocked(job, profWith({ survivor: FARMING_TIER2_UNLOCK_CUMLEVEL }), {
              farmingLevel: FARMING_LEVEL_REQUIREMENTS.earthartisan - 1,
            }),
          ).toBe(false);
          expect(
            isJobUnlocked(job, profWith({ survivor: FARMING_TIER2_UNLOCK_CUMLEVEL }), {
              farmingLevel: FARMING_LEVEL_REQUIREMENTS.earthartisan,
            }),
          ).toBe(true);
        }
        continue;
      }
      const required =
        childId === "seagod"
          ? FISHING_TIER6_UNLOCK_CUMLEVEL
          : TIER6_UNLOCK_CUMLEVEL;
      expect(job.unlock.prereqs).toEqual({ [parent]: required });
      expect(V2_JOB_CATALOG[parent].tier).toBe(5);
      expect(isJobUnlocked(job, profJobs({ [parent]: required - 1 }))).toBe(
        false,
      );
      expect(isJobUnlocked(job, profJobs({ [parent]: required }))).toBe(true);
    }
    expect(TIER5_UNLOCK_CUMLEVEL).toBeLessThan(TIER6_UNLOCK_CUMLEVEL);
    expect(LEGACY_CLASS_SPEC_BY_JOB.fortressknight).toEqual({
      class: "warrior",
      spec: "fortressknight",
    });
    expect(jobIdFromLegacy("warrior", "fortressknight")).toBe("fortressknight");
    expect(LEGACY_CLASS_SPEC_BY_JOB.swordsaint).toEqual({
      class: "warrior",
      spec: "swordsaint",
    });
    expect(jobIdFromLegacy("warrior", "swordsaint")).toBe("swordsaint");
    expect(LEGACY_CLASS_SPEC_BY_JOB.hegemon).toEqual({
      class: "warrior",
      spec: "hegemon",
    });
    expect(jobIdFromLegacy("warrior", "hegemon")).toBe("hegemon");
    expect(LEGACY_CLASS_SPEC_BY_JOB.archmage).toEqual({
      class: "mage",
      spec: "archmage",
    });
    expect(jobIdFromLegacy("mage", "archmage")).toBe("archmage");
    expect(LEGACY_CLASS_SPEC_BY_JOB.primordialmage).toEqual({
      class: "mage",
      spec: "primordialmage",
    });
    expect(jobIdFromLegacy("mage", "primordialmage")).toBe("primordialmage");
    expect(LEGACY_CLASS_SPEC_BY_JOB.savior).toEqual({
      class: "mage",
      spec: "savior",
    });
    expect(jobIdFromLegacy("mage", "savior")).toBe("savior");
    expect(LEGACY_CLASS_SPEC_BY_JOB.doomprophet).toEqual({
      class: "mage",
      spec: "doomprophet",
    });
    expect(jobIdFromLegacy("mage", "doomprophet")).toBe("doomprophet");
    expect(LEGACY_CLASS_SPEC_BY_JOB.heavenlybow).toEqual({
      class: "rogue",
      spec: "heavenlybow",
    });
    expect(jobIdFromLegacy("rogue", "heavenlybow")).toBe("heavenlybow");
    expect(LEGACY_CLASS_SPEC_BY_JOB.blackmoon).toEqual({
      class: "rogue",
      spec: "blackmoon",
    });
    expect(jobIdFromLegacy("rogue", "blackmoon")).toBe("blackmoon");
    expect(LEGACY_CLASS_SPEC_BY_JOB.myriadvenom).toEqual({
      class: "rogue",
      spec: "myriadvenom",
    });
    expect(jobIdFromLegacy("rogue", "myriadvenom")).toBe("myriadvenom");
    expect(LEGACY_CLASS_SPEC_BY_JOB.celestialdragon).toEqual({
      class: "martial",
      spec: "celestialdragon",
    });
    expect(jobIdFromLegacy("martial", "celestialdragon")).toBe("celestialdragon");
    expect(LEGACY_CLASS_SPEC_BY_JOB.vajraarhat).toEqual({
      class: "martial",
      spec: "vajraarhat",
    });
    expect(jobIdFromLegacy("martial", "vajraarhat")).toBe("vajraarhat");
    expect(LEGACY_CLASS_SPEC_BY_JOB.seagod).toEqual({
      class: "survivor",
      spec: "seagod",
    });
    expect(jobIdFromLegacy("survivor", "seagod")).toBe("seagod");
    expect(LEGACY_CLASS_SPEC_BY_JOB.blooddemon).toEqual({
      class: "warrior",
      spec: "blooddemon",
    });
    expect(jobIdFromLegacy("warrior", "blooddemon")).toBe("blooddemon");
    expect(LEGACY_CLASS_SPEC_BY_JOB.absolute).toEqual({
      class: "warrior",
      spec: "absolute",
    });
    expect(jobIdFromLegacy("warrior", "absolute")).toBe("absolute");
  });

  it("5차 하이브리드(초월자) — 성전사·룬 기사를 각각 TIER5 키워야 해금된다", () => {
    const transcendent = V2_JOB_CATALOG.transcendent;
    expect(transcendent.tier).toBe(5);
    expect(transcendent.unlock.prereqs).toEqual({
      crusader: TIER5_UNLOCK_CUMLEVEL,
      runeknight: TIER5_UNLOCK_CUMLEVEL,
    });
    expect(isJobUnlocked(transcendent, profWith({ warrior: 99999, mage: 99999 }))).toBe(false);
    expect(isJobUnlocked(transcendent, profJobs({ crusader: TIER5_UNLOCK_CUMLEVEL }))).toBe(false);
    expect(isJobUnlocked(transcendent, profJobs({ runeknight: TIER5_UNLOCK_CUMLEVEL }))).toBe(false);
    expect(
      isJobUnlocked(transcendent, profJobs({
        crusader: TIER5_UNLOCK_CUMLEVEL,
        runeknight: TIER5_UNLOCK_CUMLEVEL,
      })),
    ).toBe(true);
    expect(LEGACY_CLASS_SPEC_BY_JOB.transcendent).toEqual({
      class: "warrior",
      spec: "transcendent",
    });
    expect(jobIdFromLegacy("warrior", "transcendent")).toBe("transcendent");
  });

  it("하이브리드(성기사) — 기사·사제 두 직업을 각각 TIER3 키워야 해금된다(직업별 cumLevel·AND)", () => {
    const templar = V2_JOB_CATALOG.templar;
    expect(templar.tier).toBe(3);
    // ⚠️ prereq 키는 직군(전사/마법)이 아니라 특정 상위 직업(기사 paladin·사제 acolyte).
    expect(templar.unlock.prereqs).toEqual({
      paladin: TIER3_UNLOCK_CUMLEVEL,
      acolyte: TIER3_UNLOCK_CUMLEVEL,
    });
    // 첫 prereq(paladin) 의 직군 = LEGACY 저장 class(전사) — 브리지 일관성 테스트와 정렬.
    expect(LEGACY_CLASS_SPEC_BY_JOB[Object.keys(templar.unlock.prereqs)[0]].class).toBe(
      "warrior",
    );

    // 직업별 숙련도(jobCumLevel)로 구성한 해금 조건.
    const profJobs = (jobLevels: Record<string, number>): V2ProficiencyState => ({
      ...emptyProficiency(),
      jobCumLevel: { ...jobLevels },
    });
    // 회귀 가드 — 직군 숙련도(전사/마법)만으론 안 열린다. 반드시 기사·사제를 거쳐야(per-job).
    expect(
      isJobUnlocked(templar, profWith({ warrior: 99999, mage: 99999 })),
    ).toBe(false);
    // 한쪽 직업만 임계 → 잠김.
    expect(
      isJobUnlocked(templar, profJobs({ paladin: TIER3_UNLOCK_CUMLEVEL })),
    ).toBe(false);
    expect(
      isJobUnlocked(templar, profJobs({ acolyte: TIER3_UNLOCK_CUMLEVEL })),
    ).toBe(false);
    expect(
      isJobUnlocked(templar, profJobs({
        paladin: TIER3_UNLOCK_CUMLEVEL,
        acolyte: TIER3_UNLOCK_CUMLEVEL - 1,
      })),
    ).toBe(false);
    // 둘 다 임계 → 해금.
    expect(
      isJobUnlocked(templar, profJobs({
        paladin: TIER3_UNLOCK_CUMLEVEL,
        acolyte: TIER3_UNLOCK_CUMLEVEL,
      })),
    ).toBe(true);
    // 왕복 — 저장(전사, templar) → templar.
    expect(jobIdFromLegacy("warrior", "templar")).toBe("templar");
  });

  it("하이브리드(마검사) — 기사·마도사 두 직업을 각각 TIER3 키워야 해금된다(직업별 cumLevel·AND)", () => {
    const spellblade = V2_JOB_CATALOG.spellblade;
    expect(spellblade.tier).toBe(3);
    // prereq = 기사(paladin·전사 3차) + 마도사(magus·마법 3차), 둘 다 상위 직업 키.
    expect(spellblade.unlock.prereqs).toEqual({
      paladin: TIER3_UNLOCK_CUMLEVEL,
      magus: TIER3_UNLOCK_CUMLEVEL,
    });
    // 첫 prereq(paladin) 의 직군 = LEGACY 저장 class(전사).
    expect(
      LEGACY_CLASS_SPEC_BY_JOB[Object.keys(spellblade.unlock.prereqs)[0]].class,
    ).toBe("warrior");

    const profJobs = (jobLevels: Record<string, number>): V2ProficiencyState => ({
      ...emptyProficiency(),
      jobCumLevel: { ...jobLevels },
    });
    // 직군 숙련도만으론 안 열림(per-job).
    expect(
      isJobUnlocked(spellblade, profWith({ warrior: 99999, mage: 99999 })),
    ).toBe(false);
    // 한쪽 직업만 임계 → 잠김.
    expect(
      isJobUnlocked(spellblade, profJobs({ paladin: TIER3_UNLOCK_CUMLEVEL })),
    ).toBe(false);
    expect(
      isJobUnlocked(spellblade, profJobs({ magus: TIER3_UNLOCK_CUMLEVEL })),
    ).toBe(false);
    // 둘 다 임계 → 해금.
    expect(
      isJobUnlocked(spellblade, profJobs({
        paladin: TIER3_UNLOCK_CUMLEVEL,
        magus: TIER3_UNLOCK_CUMLEVEL,
      })),
    ).toBe(true);
    // 왕복.
    expect(jobIdFromLegacy("warrior", "spellblade")).toBe("spellblade");
  });

  it("하이브리드(혈성기사/암흑사제) — 두 부모 직업을 각각 TIER3 키워야 해금된다", () => {
    const cases = [
      {
        id: "bloodtemplar",
        prereqs: { berserker: TIER3_UNLOCK_CUMLEVEL, acolyte: TIER3_UNLOCK_CUMLEVEL },
        legacy: { class: "warrior", spec: "bloodtemplar" },
      },
      {
        id: "darkpriest",
        prereqs: { shadow: TIER3_UNLOCK_CUMLEVEL, acolyte: TIER3_UNLOCK_CUMLEVEL },
        legacy: { class: "rogue", spec: "darkpriest" },
      },
    ] as const;
    for (const c of cases) {
      const job = V2_JOB_CATALOG[c.id];
      expect(job.tier).toBe(3);
      expect(job.unlock.prereqs).toEqual(c.prereqs);
      const [a, b] = Object.keys(c.prereqs);
      expect(isJobUnlocked(job, profJobs({ [a]: TIER3_UNLOCK_CUMLEVEL }))).toBe(false);
      expect(isJobUnlocked(job, profJobs({ [b]: TIER3_UNLOCK_CUMLEVEL }))).toBe(false);
      expect(
        isJobUnlocked(job, profJobs({ [a]: TIER3_UNLOCK_CUMLEVEL, [b]: TIER3_UNLOCK_CUMLEVEL })),
      ).toBe(true);
      expect(LEGACY_CLASS_SPEC_BY_JOB[c.id]).toEqual(c.legacy);
      expect(jobIdFromLegacy(c.legacy.class, c.legacy.spec)).toBe(c.id);
    }
  });
});

describe("isJobUnlocked / unlockedJobs", () => {
  it("빈 숙련도에서 기본 직업은 해금, 상위 직업은 잠김", () => {
    const empty = emptyProficiency();
    expect(isJobUnlocked(V2_JOB_CATALOG.warrior, empty)).toBe(true);
    expect(isJobUnlocked(V2_JOB_CATALOG.squire, empty)).toBe(false);
  });

  it("임계 직전은 잠김, 임계 도달은 해금", () => {
    expect(
      isJobUnlocked(
        V2_JOB_CATALOG.squire,
        profWith({ warrior: TIER2_UNLOCK_CUMLEVEL - 1 }),
      ),
    ).toBe(false);
    expect(
      isJobUnlocked(
        V2_JOB_CATALOG.squire,
        profWith({ warrior: TIER2_UNLOCK_CUMLEVEL }),
      ),
    ).toBe(true);
  });

  it("부모를 충족해도 다른 직군 상위는 잠긴 채로 둔다", () => {
    const prof = profWith({ warrior: 200 });
    expect(isJobUnlocked(V2_JOB_CATALOG.caster, prof)).toBe(false);
  });

  it("고차 직업은 계보(2차 부모) jobCumLevel TIER3 전엔 잠김, 도달 시 해금", () => {
    // 기사(paladin) ← 견습 기사(squire). squire jobCumLevel 로 게이트.
    expect(
      isJobUnlocked(V2_JOB_CATALOG.paladin, profJobs({ squire: TIER3_UNLOCK_CUMLEVEL - 1 })),
    ).toBe(false);
    expect(
      isJobUnlocked(V2_JOB_CATALOG.paladin, profJobs({ squire: TIER3_UNLOCK_CUMLEVEL })),
    ).toBe(true);
    // 🔑 직군(warrior) 누적만 높아도 계보 직업(squire jobCumLevel)을 안 키웠으면 안 열린다.
    expect(isJobUnlocked(V2_JOB_CATALOG.paladin, profWith({ warrior: 99999 }))).toBe(
      false,
    );
    // 형제 2차(방패병 lineage=가디언)를 키워도 paladin 은 안 열림(squire 가 아니라서).
    expect(
      isJobUnlocked(V2_JOB_CATALOG.paladin, profJobs({ shieldman: TIER3_UNLOCK_CUMLEVEL })),
    ).toBe(false);
  });

  it("농부 상위 직업은 선행 직업 해금과 농사 레벨을 모두 요구한다", () => {
    expect(
      isJobUnlocked(
        V2_JOB_CATALOG.horticulturist,
        profWith({ survivor: FARMING_TIER2_UNLOCK_CUMLEVEL - 1 }),
        { farmingLevel: FARMING_LEVEL_REQUIREMENTS.horticulturist },
      ),
    ).toBe(false);
    expect(
      isJobUnlocked(
        V2_JOB_CATALOG.horticulturist,
        profWith({ survivor: FARMING_TIER2_UNLOCK_CUMLEVEL }),
        { farmingLevel: FARMING_LEVEL_REQUIREMENTS.horticulturist - 1 },
      ),
    ).toBe(false);
    expect(
      isJobUnlocked(
        V2_JOB_CATALOG.horticulturist,
        profWith({ survivor: FARMING_TIER2_UNLOCK_CUMLEVEL }),
        { farmingLevel: FARMING_LEVEL_REQUIREMENTS.horticulturist },
      ),
    ).toBe(true);
  });

  it("심화 직업은 계보(3차 부모) jobCumLevel TIER4 전엔 잠김, 도달 시 해금(고차보다 더 깊다)", () => {
    // 정예 기사(veteran) ← 기사(paladin). paladin jobCumLevel 로 게이트.
    expect(
      isJobUnlocked(V2_JOB_CATALOG.veteran, profJobs({ paladin: TIER4_UNLOCK_CUMLEVEL - 1 })),
    ).toBe(false);
    expect(
      isJobUnlocked(V2_JOB_CATALOG.veteran, profJobs({ paladin: TIER4_UNLOCK_CUMLEVEL })),
    ).toBe(true);
    // 부모 3차(paladin)가 TIER3(3차 해금선)는 넘겼어도 TIER4 전이면 4차는 잠김 — TIER3 < TIER4.
    expect(
      isJobUnlocked(V2_JOB_CATALOG.veteran, profJobs({ paladin: TIER3_UNLOCK_CUMLEVEL })),
    ).toBe(false);
  });

  it("unlockedJobs 는 루트 직업과 충족한 직업만 반환한다", () => {
    const empty = emptyProficiency();
    const ids = unlockedJobs(empty).map((j) => j.id);
    expect(ids).toEqual(expect.arrayContaining(["none", "survivor", ...BASE_JOBS]));
    expect(ids).not.toContain("squire");

    const ready = profWith({ warrior: TIER2_UNLOCK_CUMLEVEL });
    const ids2 = unlockedJobs(ready).map((j) => j.id);
    expect(ids2).toEqual(
      expect.arrayContaining(["none", "survivor", ...BASE_JOBS, "shieldman", "squire"]),
    );
    expect(ids2).not.toContain("caster");
  });
});

describe("extraConditions 추가 해금 조건 (#818)", () => {
  // 카탈로그 직업은 아직 extraConditions 미사용 → 합성 직업 정의로 평가 로직만 검증.
  function jobWith(
    extraConditions: ExtraJobCondition[],
    prereqs: Record<string, number> = {},
  ): V2JobDefinition {
    return {
      ...V2_JOB_CATALOG.warrior,
      id: "test_job",
      unlock: { prereqs, extraConditions },
    };
  }
  function profWithCaps(caps: Record<string, number>): V2ProficiencyState {
    const prof = emptyProficiency();
    for (const [stat, v] of Object.entries(caps)) {
      prof.caps[stat as V2StatKey] = v;
    }
    return prof;
  }

  it("statThreshold — 그 스탯의 cultivation cap 이 min 이상이면 통과(proficiency 만으로, ctx 불요)", () => {
    const job = jobWith([{ type: "statThreshold", stat: "str", min: 100 }]);
    expect(isJobUnlocked(job, profWithCaps({ str: 99 }))).toBe(false);
    expect(isJobUnlocked(job, profWithCaps({ str: 100 }))).toBe(true);
    // 다른 스탯 cap 으론 못 연다.
    expect(isJobUnlocked(job, profWithCaps({ int: 999 }))).toBe(false);
  });

  it("questCompleted — ctx.completedQuestIds 포함 시 통과, ctx 없으면 fail-closed", () => {
    const job = jobWith([{ type: "questCompleted", questId: "q-hidden" }]);
    const empty = emptyProficiency();
    expect(isJobUnlocked(job, empty)).toBe(false); // ctx 없음
    expect(
      isJobUnlocked(job, empty, { completedQuestIds: new Set(["other"]) }),
    ).toBe(false);
    expect(
      isJobUnlocked(job, empty, { completedQuestIds: new Set(["q-hidden"]) }),
    ).toBe(true);
  });

  it("monsterKilled — ctx.killCounts 가 minCount 이상이면 통과, ctx 없으면 fail-closed", () => {
    const job = jobWith([
      { type: "monsterKilled", monsterId: "dragon", minCount: 10 },
    ]);
    const empty = emptyProficiency();
    expect(isJobUnlocked(job, empty)).toBe(false); // 킬 트래커 미신설 → 데이터 없음
    expect(isJobUnlocked(job, empty, { killCounts: { dragon: 9 } })).toBe(false);
    expect(isJobUnlocked(job, empty, { killCounts: { dragon: 10 } })).toBe(true);
  });

  it("prereqs(cumLevel) 와 extraConditions 는 둘 다 충족해야 한다(AND)", () => {
    const job = jobWith([{ type: "statThreshold", stat: "str", min: 50 }], {
      warrior: 100,
    });
    // prereq 만 충족(cap 부족) → 잠김.
    const prereqOnly = profWith({ warrior: 100 });
    expect(isJobUnlocked(job, prereqOnly)).toBe(false);
    // 둘 다 충족 → 해금.
    const both = profWith({ warrior: 100 });
    both.caps.str = 50;
    expect(isJobUnlocked(job, both)).toBe(true);
    // cap 만 충족(cumLevel 부족) → 잠김.
    expect(isJobUnlocked(job, profWithCaps({ str: 50 }))).toBe(false);
  });

  it("여러 추가조건은 전부 충족해야 한다(quest + stat)", () => {
    const job = jobWith([
      { type: "statThreshold", stat: "str", min: 50 },
      { type: "questCompleted", questId: "q1" },
    ]);
    const prof = profWithCaps({ str: 50 });
    const ctx: JobUnlockContext = { completedQuestIds: new Set(["q1"]) };
    expect(isJobUnlocked(job, prof, ctx)).toBe(true);
    // 스탯만 충족, 퀘스트 미충족 → 잠김.
    expect(isJobUnlocked(job, prof, { completedQuestIds: new Set() })).toBe(
      false,
    );
    // 퀘스트만 충족, 스탯 미충족 → 잠김.
    expect(isJobUnlocked(job, profWithCaps({ str: 49 }), ctx)).toBe(false);
  });

  it("현 카탈로그는 농부·나무꾼·광부 상위 직업에 생활 레벨 조건을 쓴다", () => {
    expect(CATALOG_USES_QUEST_CONDITION).toBe(false);
    expect(CATALOG_USES_FARMING_LEVEL_CONDITION).toBe(true);
    expect(CATALOG_USES_WOODCUTTING_LEVEL_CONDITION).toBe(true);
    expect(CATALOG_USES_MINING_LEVEL_CONDITION).toBe(true);
    for (const job of V2_JOB_LIST) {
      const extra = job.unlock.extraConditions ?? [];
      if (isFarmingJobId(job.id) && job.id !== "farmer") {
        expect(extra, `${job.id} 는 농사 레벨 조건을 사용`).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "jobUnlocked" }),
            expect.objectContaining({ type: "farmingLevel" }),
          ]),
        );
      } else if (isWoodcuttingJobId(job.id) && job.id !== "lumberjack") {
        expect(extra, `${job.id} 는 벌목 레벨 조건을 사용`).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "jobUnlocked" }),
            expect.objectContaining({ type: "woodcuttingLevel" }),
          ]),
        );
      } else if (isMiningJobId(job.id) && job.id !== "miner") {
        expect(extra, `${job.id} 는 채광 레벨 조건을 사용`).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "jobUnlocked" }),
            expect.objectContaining({ type: "miningLevel" }),
          ]),
        );
      } else {
        expect(extra, `${job.id} 는 extraConditions 미사용`).toEqual([]);
      }
    }
  });
});

describe("jobDisplayName (직업 시스템 — 무조건화)", () => {
  it("직업 카탈로그 이름(견습 X·상위), 미인식 직군은 모험가 폴백", () => {
    expect(jobDisplayName("warrior", null)).toBe("견습 병사");
    expect(jobDisplayName("mage", "knight")).toBe("견습 마법사"); // spec 미매칭 → 부모 직업
    expect(jobDisplayName("mage", "warder")).toBe("결계사");
    expect(jobDisplayName("warrior", "knight")).toBe("방패병"); // 상위 직업 반영
    expect(jobDisplayName("none", null)).toBe("모험가");
    expect(jobDisplayName("bogus" as never, null)).toBe("모험가");
  });
});

describe("isDirectNextJob", () => {
  it("현재 직업을 선행조건으로 둔 바로 다음 직업만 true", () => {
    expect(isDirectNextJob("dragonfist", V2_JOB_CATALOG.celestialdragon)).toBe(
      true,
    );
    expect(isDirectNextJob("sensei", V2_JOB_CATALOG.celestialdragon)).toBe(
      false,
    );
    expect(isDirectNextJob("dragonfist", V2_JOB_CATALOG.dragonfist)).toBe(
      false,
    );
    expect(isDirectNextJob(null, V2_JOB_CATALOG.celestialdragon)).toBe(false);
  });
});

describe("LEGACY_CLASS_SPEC_BY_JOB 브리지 (PR-2)", () => {
  it("모험가(none)를 제외한 모든 직업을 빠짐없이 커버한다", () => {
    const nonNone = V2_JOB_LIST.filter((j) => j.id !== "none").map((j) => j.id);
    expect(Object.keys(LEGACY_CLASS_SPEC_BY_JOB).sort()).toEqual(
      nonNone.sort(),
    );
  });

  it("기본 직업(tier 1)은 자기 자신 class + spec=null", () => {
    for (const id of BASE_JOBS) {
      expect(LEGACY_CLASS_SPEC_BY_JOB[id]).toEqual({ class: id, spec: null });
    }
  });

  it("상위·고차·심화 직업(tier 2·3·4)은 부모 base class + non-null spec 으로 매핑", () => {
    for (const job of V2_JOB_LIST) {
      if (job.tier < 2) continue;
      const legacy = LEGACY_CLASS_SPEC_BY_JOB[job.id];
      // 매핑된 class 는 첫 prereq 의 직군과 일치해야 한다. 단일 부모는 첫 키가 직군(tier1)이라
      //   그대로, 하이브리드(기사·사제 prereq)는 첫 키가 상위 직업이라 그 직업의 직군으로 환산.
      const parentKey =
        Object.keys(job.unlock.prereqs)[0] ??
        job.unlock.extraConditions?.find((cond) => cond.type === "jobUnlocked")
          ?.jobId;
      const parentClass = LEGACY_CLASS_SPEC_BY_JOB[parentKey]?.class ?? parentKey;
      expect(legacy.class).toBe(parentClass);
      expect(typeof legacy.spec).toBe("string");
      expect(legacy.spec).toBeTruthy();
    }
  });

  it("매핑 class 는 전부 유효한 기본 직업 id", () => {
    for (const { class: cls } of Object.values(LEGACY_CLASS_SPEC_BY_JOB)) {
      expect(LEGACY_CLASSES).toContain(cls);
    }
  });
});

describe("jobIdFromLegacy 역브리지 (PR-3)", () => {
  it("LEGACY 매핑의 정확한 역 — (class, spec) → jobId", () => {
    for (const [jobId, { class: cls, spec }] of Object.entries(
      LEGACY_CLASS_SPEC_BY_JOB,
    )) {
      expect(jobIdFromLegacy(cls, spec)).toBe(jobId);
    }
  });

  it("대표 케이스", () => {
    expect(jobIdFromLegacy("warrior", null)).toBe("warrior");
    expect(jobIdFromLegacy("warrior", "gwang")).toBe("squire");
    expect(jobIdFromLegacy("warrior", "knight")).toBe("shieldman");
    expect(jobIdFromLegacy("rogue", "assassin")).toBe("assassin");
    expect(jobIdFromLegacy("rogue", "venomist")).toBe("venomist");
    expect(jobIdFromLegacy("rogue", "venomancer")).toBe("venomancer");
    expect(jobIdFromLegacy("survivor", "fisher")).toBe("fisher");
    expect(jobIdFromLegacy("survivor", "healthtrainer")).toBe("healthtrainer");
    expect(jobIdFromLegacy("survivor", "physicalcoach")).toBe("physicalcoach");
    expect(jobIdFromLegacy("survivor", "angler")).toBe("angler");
    expect(jobIdFromLegacy("survivor", "masterangler")).toBe("masterangler");
    expect(jobIdFromLegacy("survivor", "fullcatchking")).toBe("fullcatchking");
    expect(jobIdFromLegacy("survivor", "seagod")).toBe("seagod");
    expect(jobIdFromLegacy("survivor", "mastertrainer")).toBe("mastertrainer");
    expect(jobIdFromLegacy("survivor", "championmaker")).toBe("championmaker");
    expect(jobIdFromLegacy("survivor", "legendarytrainer")).toBe("legendarytrainer");
    expect(jobIdFromLegacy("survivor", "farmer")).toBe("farmer");
    expect(jobIdFromLegacy("survivor", "horticulturist")).toBe("horticulturist");
    expect(jobIdFromLegacy("survivor", "masterfarmer")).toBe("masterfarmer");
    expect(jobIdFromLegacy("survivor", "harvestking")).toBe("harvestking");
    expect(jobIdFromLegacy("survivor", "earthartisan")).toBe("earthartisan");
    expect(jobIdFromLegacy("warrior", "paladin")).toBe("paladin"); // tier 3
    expect(jobIdFromLegacy("mage", "magus")).toBe("magus"); // tier 3
    expect(jobIdFromLegacy("mage", "runecaster")).toBe("runecaster"); // 문장술사 4차
    expect(jobIdFromLegacy("warrior", "veteran")).toBe("veteran"); // tier 4
    expect(jobIdFromLegacy("warrior", "crusader")).toBe("crusader"); // 성기사 4차
    expect(jobIdFromLegacy("warrior", "runeknight")).toBe("runeknight"); // 마검사 4차
    expect(jobIdFromLegacy("rogue", "chief")).toBe("chief"); // tier 4
    expect(jobIdFromLegacy("rogue", "venomlord")).toBe("venomlord"); // tier 4
  });

  it("알 수 없는 옛 id·모험가는 base class 로 폴백", () => {
    expect(jobIdFromLegacy("warrior", "bogus_spec")).toBe("warrior");
    expect(jobIdFromLegacy("none", null)).toBe("none");
  });

  // 회귀: 직업 표시명(캐릭터 카드/전투 부제)은 직업 카탈로그 이름이어야 한다 — 옛 클래스명(전사 등)
  //   금지. 버그: classDisplayName/V2CharacterCard 가 class 에서 직접 환산해 "전사"로 표기했음.
  it("직업 표시명 = 카탈로그 직업명(견습 병사 등), 옛 클래스명 아님", () => {
    const displayName = (cls: string, spec: string | null) =>
      V2_JOB_CATALOG[jobIdFromLegacy(cls, spec)]?.name;
    expect(displayName("warrior", null)).toBe("견습 병사");
    expect(displayName("warrior", "")).toBe("견습 병사"); // 빈 문자열 spec(라이브 세이브)
    expect(displayName("mage", "")).toBe("견습 마법사");
    expect(displayName("martial", null)).toBe("견습 무인");
    expect(displayName("rogue", null)).toBe("견습 도적");
    expect(displayName("rogue", "venomist")).toBe("독술사");
    expect(displayName("rogue", "venomancer")).toBe("맹독술사");
    expect(displayName("rogue", "venomlord")).toBe("독왕");
    expect(displayName("survivor", "fisher")).toBe("낚시꾼");
    expect(displayName("survivor", "healthtrainer")).toBe("헬스 트레이너");
    expect(displayName("survivor", "physicalcoach")).toBe("피지컬 코치");
    expect(displayName("survivor", "angler")).toBe("명인 낚시꾼");
    expect(displayName("survivor", "masterangler")).toBe("강태공");
    expect(displayName("survivor", "fullcatchking")).toBe("만선왕");
    expect(displayName("survivor", "seagod")).toBe("해신");
    expect(displayName("survivor", "mastertrainer")).toBe("마스터 트레이너");
    expect(displayName("survivor", "championmaker")).toBe("챔피언 메이커");
    expect(displayName("survivor", "legendarytrainer")).toBe("전설의 트레이너");
    expect(displayName("survivor", "farmer")).toBe("농부");
    expect(displayName("survivor", "horticulturist")).toBe("원예가");
    expect(displayName("survivor", "masterfarmer")).toBe("숙련 농부");
    expect(displayName("survivor", "harvestking")).toBe("농업 장인");
    expect(displayName("survivor", "earthartisan")).toBe("전설의 농부");
    expect(displayName("mage", "firemage")).toBe("화염 마법사");
    expect(displayName("mage", "frostmage")).toBe("냉기 마법사");
    expect(displayName("mage", "lightningmage")).toBe("전격 마법사");
    expect(displayName("mage", "windmage")).toBe("바람 마법사");
    expect(displayName("mage", "earthmage")).toBe("대지 마법사");
    expect(displayName("mage", "elementallord")).toBe("원소군주");
    expect(displayName("mage", "primordialmage")).toBe("태초술사");
    expect(displayName("mage", "inscriber")).toBe("각인술사");
    expect(displayName("mage", "archmage")).toBe("대마도사");
    expect(displayName("mage", "savior")).toBe("구원자");
    expect(displayName("mage", "calamitycaller")).toBe("재앙술사");
    expect(displayName("mage", "doomprophet")).toBe("종말예언자");
    expect(displayName("warrior", "knight")).toBe("방패병"); // 상위 직업도 반영
    expect(displayName("warrior", null)).not.toBe("전사"); // 옛 클래스명 금지
  });
});

describe("생활 직업 숙련도 획득 분기", () => {
  it("낚시·농부·나무꾼·광부 계열은 생활 루프에서만 직업 숙련도를 얻는다", () => {
    expect(isFishingJobId("fisher")).toBe(true);
    expect(isFishingJobId("angler")).toBe(true);
    expect(isFishingJobId("masterangler")).toBe(true);
    expect(isFishingJobId("fullcatchking")).toBe(true);
    expect(isFishingJobId("seagod")).toBe(true);
    expect(isFarmingJobId("farmer")).toBe(true);
    expect(isFarmingJobId("horticulturist")).toBe(true);
    expect(isFarmingJobId("masterfarmer")).toBe(true);
    expect(isFarmingJobId("harvestking")).toBe(true);
    expect(isFarmingJobId("earthartisan")).toBe(true);
    expect(isLifestyleMasteryJobId("fisher")).toBe(true);
    expect(isLifestyleMasteryJobId("farmer")).toBe(true);
    expect(isWoodcuttingJobId("lumberjack")).toBe(true);
    expect(isLifestyleMasteryJobId("lumberjack")).toBe(true);
    expect(isMiningJobId("miner")).toBe(true);
    expect(isMiningJobId("legendaryminer")).toBe(true);
    expect(isLifestyleMasteryJobId("miner")).toBe(true);
    expect(isFishingJobId("healthtrainer")).toBe(false);
    expect(isFarmingJobId("healthtrainer")).toBe(false);
    expect(isLifestyleMasteryJobId("healthtrainer")).toBe(false);
    expect(isFishingJobId("physicalcoach")).toBe(false);
    expect(isFishingJobId("mastertrainer")).toBe(false);
  });

  it("생산 직업은 Lv 1, 전투 직업은 Lv 100에서 재전직한다", () => {
    for (const jobId of [
      "fisher",
      "seagod",
      "farmer",
      "earthartisan",
      "lumberjack",
      "legendarylumberjack",
      "miner",
      "legendaryminer",
    ]) {
      expect(rejobRequiredLevel(jobId), jobId).toBe(1);
    }
    expect(rejobRequiredLevel("warrior")).toBe(V2_LEVEL_CAP);
    expect(rejobRequiredLevel("healthtrainer")).toBe(V2_LEVEL_CAP);
  });
});

describe("DROPPED_SPEC_TO_SURVIVING 정규화 (PR-5)", () => {
  it("사라진 4계파가 흡수처 상위 직업으로 해석된다", () => {
    expect(jobIdFromLegacy("warrior", "gladiator")).toBe("squire"); // 검투사 → 견습 기사
    expect(jobIdFromLegacy("martial", "yeonhwan")).toBe("boxer"); // 연환 → 권사
    expect(jobIdFromLegacy("mage", "battlemage")).toBe("caster"); // 워메이지 → 마법사(caster)
    expect(jobIdFromLegacy("rogue", "venom")).toBe("assassin"); // 독사 → 자객
  });

  it("사라진 4계파와 옛 원소술사를 새 생존 직업으로 정규화한다", () => {
    expect(Object.keys(DROPPED_SPEC_TO_SURVIVING).sort()).toEqual(
      ["battlemage", "elementalist", "gladiator", "venom", "yeonhwan"].sort(),
    );
    expect(jobIdFromLegacy("mage", "elementalist")).toBe("firemage");
    // 흡수처(생존 계파)는 LEGACY 역브리지에 실재해 base 폴백이 아니다.
    for (const surviving of Object.values(DROPPED_SPEC_TO_SURVIVING)) {
      const found = Object.values(LEGACY_CLASS_SPEC_BY_JOB).some(
        (m) => m.spec === surviving,
      );
      expect(found, `생존 계파 ${surviving} 가 LEGACY 에 있어야`).toBe(true);
    }
  });

  it("사라진 계파는 올바른 부모 직군과 함께 tier 2 직업으로 귀결(base 폴백 아님)", () => {
    const droppedParent: Record<string, string> = {
      gladiator: "warrior",
      yeonhwan: "martial",
      battlemage: "mage",
      venom: "rogue",
    };
    for (const [dropped, parent] of Object.entries(droppedParent)) {
      const job = V2_JOB_CATALOG[jobIdFromLegacy(parent, dropped)];
      expect(job?.tier, dropped).toBe(2);
    }
  });
});

describe("jobUnlockConditionText (해금 조건 표기 — 전직 화면·도감 공유)", () => {
  it("기본 직업(prereqs 없음)은 Lv 캡 달성 조건으로 표기", () => {
    expect(jobUnlockConditionText(V2_JOB_CATALOG.warrior)).toBe(
      `Lv ${V2_LEVEL_CAP} 달성`,
    );
  });

  it("상위 직업은 부모 직업명 + 숙련도 임계로 표기", () => {
    const txt = jobUnlockConditionText(V2_JOB_CATALOG.squire);
    expect(txt).toContain(V2_JOB_CATALOG.warrior.name); // 부모 직업명
    expect(txt).toContain(`숙련도 ${TIER2_UNLOCK_CUMLEVEL}`);
  });

  it("하이브리드(성기사)는 두 부모 직업 조건을 모두 표기", () => {
    const txt = jobUnlockConditionText(V2_JOB_CATALOG.templar);
    expect(txt).toContain(V2_JOB_CATALOG.paladin.name);
    expect(txt).toContain(V2_JOB_CATALOG.acolyte.name);
    expect(txt).toContain(`숙련도 ${TIER3_UNLOCK_CUMLEVEL}`);
  });

  it("농부 상위 직업은 농사 레벨 조건을 함께 표기", () => {
    const txt = jobUnlockConditionText(V2_JOB_CATALOG.horticulturist);
    expect(txt).toContain(`농사 Lv ${FARMING_LEVEL_REQUIREMENTS.horticulturist}`);
  });
});

describe("cumLevelForJob (직업별 숙련도 — 전직 화면 표기)", () => {
  it("기본 직업(tier1)은 groups[id].cumLevel 을 읽는다", () => {
    const prof = profWith({ warrior: 42 });
    expect(cumLevelForJob(prof, V2_JOB_CATALOG.warrior)).toBe(42);
    // 키운 적 없는 직군은 0.
    expect(cumLevelForJob(prof, V2_JOB_CATALOG.mage)).toBe(0);
  });

  it("상위 직업(tier2+)은 jobCumLevel[id] 을 읽는다(없으면 0)", () => {
    const prof: V2ProficiencyState = {
      ...emptyProficiency(),
      jobCumLevel: { squire: 17, paladin: 333 },
    };
    expect(cumLevelForJob(prof, V2_JOB_CATALOG.squire)).toBe(17);
    expect(cumLevelForJob(prof, V2_JOB_CATALOG.paladin)).toBe(333);
    // jobCumLevel 에 없는 상위 직업은 0.
    expect(cumLevelForJob(prof, V2_JOB_CATALOG.caster)).toBe(0);
  });
});
