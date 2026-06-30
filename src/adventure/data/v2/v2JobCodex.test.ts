import { describe, it, expect } from "vitest";
import { buildJobCodex } from "./v2JobCodex";
import { TIER2_UNLOCK_CUMLEVEL, V2_JOB_LIST } from "./v2JobCatalog";
import { emptyProficiency, type V2ProficiencyState } from "./proficiency";

// 직군 cumLevel 을 세팅한 proficiency 생성 헬퍼.
function profWith(groups: Record<string, number>): V2ProficiencyState {
  const p = emptyProficiency();
  for (const [g, cum] of Object.entries(groups)) {
    p.groups[g] = { cultivations: 0, tier: 1, cumLevel: cum };
  }
  return p;
}

describe("buildJobCodex", () => {
  it("전체 직업 목록 + unlocked 상태 + totalJobs=전체 + 폐지 필드 없음 + condition 포함", () => {
    const prof = profWith({
      warrior: TIER2_UNLOCK_CUMLEVEL,
      mage: TIER2_UNLOCK_CUMLEVEL,
    });
    const codex = buildJobCodex(prof, [], "warrior", null);

    // 폐지된 필드는 codex 에 없다.
    expect("groups" in codex).toBe(false);
    expect("collectionPoints" in codex).toBe(false);
    expect("rank" in codex).toBe(false);

    // totalJobs = 모험가(tier0) 제외 전체. 목록도 전체를 싣고 unlocked 로 상태를 구분한다.
    const nonAdventurer = V2_JOB_LIST.filter((j) => j.tier > 0).length;
    expect(codex.totalJobs).toBe(nonAdventurer);
    expect(codex.jobs.length).toBe(nonAdventurer);
    expect(codex.jobs.some((j) => j.unlocked)).toBe(true);
    // 잠긴 직업도 목표/조건 확인용으로 목록에 남는다.
    expect(codex.jobs.find((j) => j.id === "veteran")?.unlocked).toBe(false);
    expect(codex.jobs.every((j) => typeof j.tier === "number")).toBe(true);
    // 각 직업에 해금 조건 텍스트가 붙는다.
    expect(codex.jobs.every((j) => typeof j.condition === "string" && j.condition.length > 0)).toBe(true);
    const shieldman = codex.jobs.find((j) => j.id === "shieldman");
    expect(shieldman?.condition).toContain("숙련도");
  });

  it("warrior 숙련도가 임계 이상이면 상위 전사 직업은 해금, mage 상위 계열은 잠김", () => {
    const prof = profWith({ warrior: TIER2_UNLOCK_CUMLEVEL });
    const codex = buildJobCodex(prof, [], "warrior", null);
    expect(codex.jobs.find((j) => j.id === "shieldman")?.unlocked).toBe(true);
    expect(codex.jobs.find((j) => j.id === "squire")?.unlocked).toBe(true);
    // mage 상위 계열(mage cum 0)은 목록에는 있지만 잠김 상태다.
    expect(codex.jobs.find((j) => j.id === "caster")?.unlocked).toBe(false);
  });

  it("현재 직업 표시 + 스킬 수집 진행도(시그니처 2개 중 학습 수, 둘 다=수집 완료)", () => {
    const prof = profWith({ warrior: 50 });
    // 견습 병사 액티브만 학습 → 1/2.
    const onlyActive = buildJobCodex(prof, ["v2c_warrior_strike"], "warrior", null);
    const w1 = onlyActive.jobs.find((j) => j.id === "warrior")!;
    expect(w1.isCurrent).toBe(true);
    expect(w1.skillsTotal).toBe(2);
    expect(w1.skillsLearned).toBe(1);

    // 액티브+패시브 둘 다 → 2/2(수집 완료).
    const both = buildJobCodex(
      prof,
      ["v2c_warrior_strike", "v2c_warrior_might"],
      "warrior",
      null,
    );
    const w2 = both.jobs.find((j) => j.id === "warrior")!;
    expect(w2.skillsLearned).toBe(w2.skillsTotal);

    // 아무것도 안 배운 직업 = 0/2.
    const mage = both.jobs.find((j) => j.id === "mage")!;
    expect(mage.skillsLearned).toBe(0);
    expect(mage.skillsTotal).toBe(2);
  });

  it("모험가(none)면 현재 직업으로 매칭되는 직업 없음", () => {
    const codex = buildJobCodex(emptyProficiency(), [], "none", null);
    expect(codex.jobs.every((j) => !j.isCurrent)).toBe(true);
  });
});
