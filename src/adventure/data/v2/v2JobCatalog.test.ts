import { describe, it, expect } from "vitest";
import {
  V2_JOB_CATALOG,
  V2_JOB_LIST,
  TIER2_UNLOCK_CUMLEVEL,
  V2_JOB_SYSTEM_V2,
  LEGACY_CLASS_SPEC_BY_JOB,
  DROPPED_SPEC_TO_SURVIVING,
  jobIdFromLegacy,
  isJobUnlocked,
  jobById,
  unlockedJobs,
  type V2JobDefinition,
} from "./v2JobCatalog";
import { V2_CULTIVATE_PROFILE } from "./proficiency";
import { V2_STAT_KEYS } from "./v2StatKeys";
import { emptyProficiency } from "./proficiency";

const BASE_JOBS = ["warrior", "martial", "mage", "rogue"];
const TIER2_BY_PARENT: Record<string, string[]> = {
  warrior: ["shieldman", "squire"],
  martial: ["boxer", "monk"],
  mage: ["caster", "acolyte"],
  rogue: ["assassin", "archer"],
};

function profWith(groupCumLevels: Record<string, number>) {
  const prof = emptyProficiency();
  for (const [id, cumLevel] of Object.entries(groupCumLevels)) {
    prof.groups[id] = { points: 0, cultivations: 0, tier: 1, cumLevel };
  }
  return prof;
}

describe("v2JobCatalog 구조", () => {
  it("13개 직업(모험가 1 + 기본 4 + 상위 8)을 정의한다", () => {
    expect(V2_JOB_LIST).toHaveLength(13);
    const byTier = (t: number) => V2_JOB_LIST.filter((j) => j.tier === t).length;
    expect(byTier(0)).toBe(1);
    expect(byTier(1)).toBe(4);
    expect(byTier(2)).toBe(8);
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

  it("모험가 jobBonus 는 비어 있다(HP% 는 별도 적용)", () => {
    expect(V2_JOB_CATALOG.none.jobBonus).toEqual({});
  });
});

describe("해금 트리", () => {
  it("모험가·기본 직업은 prereqs 가 비어 있다", () => {
    expect(V2_JOB_CATALOG.none.unlock.prereqs).toEqual({});
    for (const id of BASE_JOBS) {
      expect(V2_JOB_CATALOG[id].unlock.prereqs).toEqual({});
    }
  });

  it("상위 직업은 부모 기본 직업의 cumLevel ≥ TIER2_UNLOCK_CUMLEVEL 을 요구한다", () => {
    for (const [parent, children] of Object.entries(TIER2_BY_PARENT)) {
      for (const childId of children) {
        const job = V2_JOB_CATALOG[childId];
        expect(job.tier).toBe(2);
        expect(job.unlock.prereqs).toEqual({ [parent]: TIER2_UNLOCK_CUMLEVEL });
      }
    }
  });
});

describe("isJobUnlocked / unlockedJobs", () => {
  it("빈 숙련도에서 기본 직업은 해금, 상위 직업은 잠김", () => {
    const empty = emptyProficiency();
    expect(isJobUnlocked(V2_JOB_CATALOG.warrior, empty)).toBe(true);
    expect(isJobUnlocked(V2_JOB_CATALOG.squire, empty)).toBe(false);
  });

  it("임계 직전(99)은 잠김, 임계 도달(100)은 해금", () => {
    expect(
      isJobUnlocked(V2_JOB_CATALOG.squire, profWith({ warrior: 99 })),
    ).toBe(false);
    expect(
      isJobUnlocked(V2_JOB_CATALOG.squire, profWith({ warrior: 100 })),
    ).toBe(true);
  });

  it("부모를 충족해도 다른 직군 상위는 잠긴 채로 둔다", () => {
    const prof = profWith({ warrior: 200 });
    expect(isJobUnlocked(V2_JOB_CATALOG.caster, prof)).toBe(false);
  });

  it("unlockedJobs 는 모험가(tier 0)를 제외하고, 충족한 직업만 반환한다", () => {
    const empty = emptyProficiency();
    const ids = unlockedJobs(empty).map((j) => j.id);
    expect(ids).toEqual(expect.arrayContaining(BASE_JOBS));
    expect(ids).not.toContain("none");
    expect(ids).not.toContain("squire");

    const ready = profWith({ warrior: 100 });
    const ids2 = unlockedJobs(ready).map((j) => j.id);
    expect(ids2).toEqual(expect.arrayContaining([...BASE_JOBS, "shieldman", "squire"]));
    expect(ids2).not.toContain("caster");
  });
});

describe("V2_JOB_SYSTEM_V2 플래그", () => {
  it("기본은 off(env 미설정)", () => {
    expect(V2_JOB_SYSTEM_V2).toBe(false);
  });
});

describe("LEGACY_CLASS_SPEC_BY_JOB 브리지 (PR-2)", () => {
  it("모험가(none)를 제외한 12직업 전부를 커버한다", () => {
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

  it("상위 직업(tier 2)은 부모 base class + 옛 계파 spec(non-null) 로 매핑", () => {
    for (const job of V2_JOB_LIST) {
      if (job.tier !== 2) continue;
      const legacy = LEGACY_CLASS_SPEC_BY_JOB[job.id];
      // 매핑된 class 는 그 직업의 부모(prereqs 키)와 일치해야 한다.
      const parent = Object.keys(job.unlock.prereqs)[0];
      expect(legacy.class).toBe(parent);
      expect(typeof legacy.spec).toBe("string");
      expect(legacy.spec).toBeTruthy();
    }
  });

  it("매핑 class 는 전부 유효한 기본 직업 id", () => {
    for (const { class: cls } of Object.values(LEGACY_CLASS_SPEC_BY_JOB)) {
      expect(BASE_JOBS).toContain(cls);
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
  });

  it("알 수 없는 옛 id·모험가는 base class 로 폴백", () => {
    expect(jobIdFromLegacy("warrior", "bogus_spec")).toBe("warrior");
    expect(jobIdFromLegacy("none", null)).toBe("none");
  });
});

describe("DROPPED_SPEC_TO_SURVIVING 정규화 (PR-5)", () => {
  it("사라진 4계파가 흡수처 상위 직업으로 해석된다", () => {
    expect(jobIdFromLegacy("warrior", "gladiator")).toBe("squire"); // 검투사 → 견습 기사
    expect(jobIdFromLegacy("martial", "yeonhwan")).toBe("boxer"); // 연환 → 권사
    expect(jobIdFromLegacy("mage", "battlemage")).toBe("caster"); // 워메이지 → 술사
    expect(jobIdFromLegacy("rogue", "venom")).toBe("assassin"); // 독사 → 자객
  });

  it("정규화 대상은 사라진 4계파뿐(생존 계파는 그대로)", () => {
    expect(Object.keys(DROPPED_SPEC_TO_SURVIVING).sort()).toEqual(
      ["battlemage", "gladiator", "venom", "yeonhwan"].sort(),
    );
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
