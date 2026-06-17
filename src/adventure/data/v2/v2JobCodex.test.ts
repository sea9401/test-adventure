import { describe, it, expect } from "vitest";
import { buildJobCodex, masteryRank } from "./v2JobCodex";
import { V2_JOB_LIST } from "./v2JobCatalog";
import { emptyProficiency, type V2ProficiencyState } from "./proficiency";
import { SP_MASTERED_CUMLEVEL } from "./coreLoopConfig";

// 직군 cumLevel 을 세팅한 proficiency 생성 헬퍼.
function profWith(groups: Record<string, number>): V2ProficiencyState {
  const p = emptyProficiency();
  for (const [g, cum] of Object.entries(groups)) {
    p.groups[g] = { points: 0, cultivations: 0, tier: 1, cumLevel: cum };
  }
  return p;
}

describe("buildJobCodex", () => {
  it("4 직군 + 비모험가 직업 전부, 직군 정복은 cumLevel≥임계", () => {
    const prof = profWith({ warrior: SP_MASTERED_CUMLEVEL, mage: 100 });
    const codex = buildJobCodex(prof, [], "warrior", null);

    expect(codex.groups).toHaveLength(4);
    // 모험가(tier0) 제외 — 카탈로그 확장에 견고(하드코딩 회피).
    const nonAdventurer = V2_JOB_LIST.filter((j) => j.tier > 0).length;
    expect(codex.jobs).toHaveLength(nonAdventurer);

    const warriorGroup = codex.groups.find((g) => g.group === "warrior")!;
    expect(warriorGroup.mastered).toBe(true); // cumLevel 250 ≥ 250
    expect(warriorGroup.masteredAt).toBe(SP_MASTERED_CUMLEVEL);
    const mageGroup = codex.groups.find((g) => g.group === "mage")!;
    expect(mageGroup.cumLevel).toBe(100);
    expect(mageGroup.mastered).toBe(false);
  });

  it("해금 상태 — 기본직업은 warrior cum≥100이면 상위 전사 직업 해금", () => {
    const prof = profWith({ warrior: 100 });
    const codex = buildJobCodex(prof, [], "warrior", null);
    const shieldman = codex.jobs.find((j) => j.id === "shieldman")!;
    expect(shieldman.group).toBe("warrior");
    expect(shieldman.unlocked).toBe(true); // warrior cumLevel 100 ≥ prereq
    const squire = codex.jobs.find((j) => j.id === "squire")!;
    expect(squire.unlocked).toBe(true);
    // mage 계열 상위는 mage cum 0 → 잠김
    const caster = codex.jobs.find((j) => j.id === "caster")!;
    expect(caster.unlocked).toBe(false);
  });

  it("정복 포인트 = 수집한 패시브 수 + 등급 산출", () => {
    const prof = profWith({ warrior: 50 });
    // 패시브 2개 학습 → 정복 포인트 2.
    const codex = buildJobCodex(
      prof,
      ["v2c_warrior_might", "v2c_shieldman_vitality"],
      "warrior",
      null,
    );
    expect(codex.masteryPoints).toBe(2);
    expect(codex.rank.title).toBe("직업 입문"); // 1점 임계 통과, 3점 미만
    expect(codex.rank.next).toEqual({ title: "직업 견습", at: 3 });
  });

  it("masteryRank — 임계 경계 + 0점 무명 + 최고등급 next null", () => {
    expect(masteryRank(0).title).toBe("무명");
    expect(masteryRank(0).next).toEqual({ title: "직업 입문", at: 1 });
    expect(masteryRank(1).title).toBe("직업 입문");
    expect(masteryRank(10).title).toBe("직업 탐험가");
    expect(masteryRank(63).title).toBe("직업 통달자"); // 64 미만
    expect(masteryRank(64).title).toBe("만직의 현자");
    expect(masteryRank(999).next).toBeNull(); // 최고 등급
  });

  it("현재 직업 표시 + 패시브 수집 여부", () => {
    const prof = profWith({ warrior: 50 });
    // 견습 병사 패시브(근력)만 학습한 상태.
    const codex = buildJobCodex(prof, ["v2c_warrior_might"], "warrior", null);
    const warrior = codex.jobs.find((j) => j.id === "warrior")!;
    expect(warrior.isCurrent).toBe(true);
    expect(warrior.passive?.id).toBe("v2c_warrior_might");
    expect(warrior.passive?.learned).toBe(true);
    // 안 배운 직업 패시브는 learned=false
    const martial = codex.jobs.find((j) => j.id === "martial")!;
    expect(martial.isCurrent).toBe(false);
    expect(martial.passive?.learned).toBe(false);
  });

  it("모든 직업이 패시브를 가짐(수집 대상) + 직군 매핑 정확", () => {
    const codex = buildJobCodex(emptyProficiency(), [], "none", null);
    for (const job of codex.jobs) {
      expect(job.passive, `${job.id} 패시브`).not.toBeNull();
      expect(["warrior", "martial", "mage", "rogue"]).toContain(job.group);
    }
    // 모험가(none)면 현재 직업 매칭 직업 없음
    expect(codex.jobs.every((j) => !j.isCurrent)).toBe(true);
  });
});
