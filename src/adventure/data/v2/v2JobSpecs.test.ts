import { describe, it, expect } from "vitest";
import {
  V2_JOB_SPECS,
  getJobSpec,
  getSpecById,
  aggregateSpecPassives,
} from "./v2JobSpecs";

describe("v2 직업 계파(스펙) — 데이터 모델 (docs/v2-job-spec-passives-plan.md)", () => {
  it("전사 = 3계파, 각 계파 패시브 3개 고정 키트 + 무기 게이트", () => {
    const warrior = V2_JOB_SPECS.warrior;
    expect(warrior).toHaveLength(3);
    for (const spec of warrior) {
      expect(spec.passives).toHaveLength(3);
      expect(spec.requiredWeaponType).toBeTruthy();
      // 패시브 id 는 계파 내 유일
      expect(new Set(spec.passives.map((p) => p.id)).size).toBe(3);
    }
  });

  it("계파별 무기 게이트 매핑 — 광검=대검 / 기사=검방 / 검투사=세검", () => {
    expect(getJobSpec("warrior", "gwang")?.requiredWeaponType).toBe("greatsword");
    expect(getJobSpec("warrior", "knight")?.requiredWeaponType).toBe(
      "sword_shield",
    );
    expect(getJobSpec("warrior", "gladiator")?.requiredWeaponType).toBe("rapier");
    expect(getJobSpec("warrior", "nonexistent")).toBeUndefined();
    expect(getJobSpec("mage", "gwang")).toBeUndefined();
  });

  it("패시브 id 는 직군 전역 유일(해금 저장 키 충돌 방지)", () => {
    const ids = V2_JOB_SPECS.warrior.flatMap((s) => s.passives.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("계파 id·패시브 id 는 전 직군 통틀어 전역 유일 (getSpecById 모호성 방지)", () => {
    const all = Object.values(V2_JOB_SPECS).flat();
    const specIds = all.map((s) => s.id);
    expect(new Set(specIds).size).toBe(specIds.length); // 계파 id 전역 유일
    const passiveIds = all.flatMap((s) => s.passives.map((p) => p.id));
    expect(new Set(passiveIds).size).toBe(passiveIds.length); // 패시브 id 전역 유일
    // getSpecById 가 각 계파를 정확히 찾음
    for (const s of all) expect(getSpecById(s.id)?.id).toBe(s.id);
  });

  it("4직군 모두 3계파 × 3패시브 고정 키트 + job 일치 (P4b 뼈대)", () => {
    for (const job of ["warrior", "martial", "mage", "rogue"]) {
      const specs = V2_JOB_SPECS[job];
      expect(specs, job).toHaveLength(3);
      for (const s of specs) {
        expect(s.job, s.id).toBe(job);
        expect(s.passives).toHaveLength(3);
        expect(s.requiredWeaponType).toBeTruthy();
      }
    }
  });

  it("무기 타입은 한 직군 안에서만 공유(직군 간 충돌 없음 — 통합 설계)", () => {
    // 계파 통합으로 같은 직군 안 여러 계파가 한 무기 타입을 공유할 수 있다(예: 마법사 3계파=staff).
    // 단 한 무기 타입이 여러 직군에 걸치면 게이트가 직군을 넘나들어 혼란 → 직군당 1개로 제한.
    const typeToJobs = new Map<string, Set<string>>();
    for (const specs of Object.values(V2_JOB_SPECS)) {
      for (const s of specs) {
        const set = typeToJobs.get(s.requiredWeaponType) ?? new Set<string>();
        set.add(s.job);
        typeToJobs.set(s.requiredWeaponType, set);
      }
    }
    for (const [type, jobs] of typeToJobs) {
      expect(jobs.size, `무기 ${type} 가 여러 직군에서 쓰임`).toBe(1);
    }
  });
});

describe("aggregateSpecPassives — 합산 + 무기 게이트", () => {
  const gwang = getJobSpec("warrior", "gwang")!;

  it("해금 패시브 효과 합산(무기 일치 시)", () => {
    const eff = aggregateSpecPassives(
      gwang,
      ["gwang_cut", "gwang_pierce"],
      "greatsword",
    );
    expect(eff.atkPctAdd).toBe(20); // 절단의 자세
    expect(eff.defPenetrationPct).toBe(17); // 갑옷 가르기
    expect(eff.critMultAdd).toBeUndefined(); // 일격필살 미해금
  });

  it("무기 게이트 불통과(종류 불일치/미장착) = 완전 비활성(빈 효과)", () => {
    // 광검류인데 세검 착용 → 전부 OFF
    expect(aggregateSpecPassives(gwang, ["gwang_cut"], "rapier")).toEqual({});
    // 무기 미장착 → OFF
    expect(aggregateSpecPassives(gwang, ["gwang_cut"], undefined)).toEqual({});
  });

  it("해금 0개 / spec 없음 = 빈 효과", () => {
    expect(aggregateSpecPassives(gwang, [], "greatsword")).toEqual({});
    expect(aggregateSpecPassives(undefined, ["gwang_cut"], "greatsword")).toEqual(
      {},
    );
  });

  it("3개 전부 해금 = 키트 완성(전 효과 합산)", () => {
    const eff = aggregateSpecPassives(
      gwang,
      ["gwang_cut", "gwang_pierce", "gwang_crit"],
      "greatsword",
    );
    expect(eff.atkPctAdd).toBe(20);
    expect(eff.defPenetrationPct).toBe(17);
    // 광폭(gwang_crit) — 신규 필드(방어 감소 + 가하는 피해 증가).
    expect(eff.selfDefReductionPct).toBe(20);
    expect(eff.dmgDealtPctAdd).toBe(30);
  });

  it("복수 필드 패시브(광폭 방깎+딜증) 합산", () => {
    const eff = aggregateSpecPassives(gwang, ["gwang_crit"], "greatsword");
    expect(eff.selfDefReductionPct).toBe(20);
    expect(eff.dmgDealtPctAdd).toBe(30);
  });

  it("아크메이지 — magicAtkPctAdd 합산(무기 일치) / 불일치면 비활성", () => {
    const arcane = getJobSpec("mage", "arcane")!;
    expect(
      aggregateSpecPassives(arcane, ["arcane_power"], "staff").magicAtkPctAdd,
    ).toBe(20);
    // 무기 불일치(지팡이 아님) → 완전 비활성.
    expect(
      aggregateSpecPassives(arcane, ["arcane_power"], "greatsword"),
    ).toEqual({});
  });
});
