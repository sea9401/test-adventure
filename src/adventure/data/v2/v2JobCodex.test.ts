import { describe, it, expect } from "vitest";
import { buildJobCodex } from "./v2JobCodex";
import { V2_JOB_LIST } from "./v2JobCatalog";
import { emptyProficiency, type V2ProficiencyState } from "./proficiency";

// 직군 cumLevel 을 세팅한 proficiency 생성 헬퍼.
function profWith(groups: Record<string, number>): V2ProficiencyState {
  const p = emptyProficiency();
  for (const [g, cum] of Object.entries(groups)) {
    p.groups[g] = { points: 0, cultivations: 0, tier: 1, cumLevel: cum };
  }
  return p;
}

describe("buildJobCodex", () => {
  it("비모험가 직업 전부 평면 목록 — 직군 묶음·수집 포인트/칭호 폐기", () => {
    const prof = profWith({ warrior: 250, mage: 100 });
    const codex = buildJobCodex(prof, [], "warrior", null);

    // 폐지된 필드는 codex 에 없다.
    expect("groups" in codex).toBe(false);
    expect("collectionPoints" in codex).toBe(false);
    expect("rank" in codex).toBe(false);
    // 모험가(tier0) 제외 — 카탈로그 확장에 견고(하드코딩 회피).
    const nonAdventurer = V2_JOB_LIST.filter((j) => j.tier > 0).length;
    expect(codex.jobs).toHaveLength(nonAdventurer);
  });

  it("해금 상태 — 기본직업은 warrior cum≥100이면 상위 전사 직업 해금", () => {
    const prof = profWith({ warrior: 100 });
    const codex = buildJobCodex(prof, [], "warrior", null);
    const shieldman = codex.jobs.find((j) => j.id === "shieldman")!;
    expect(shieldman.unlocked).toBe(true); // warrior cumLevel 100 ≥ prereq
    const squire = codex.jobs.find((j) => j.id === "squire")!;
    expect(squire.unlocked).toBe(true);
    // mage 계열 상위는 mage cum 0 → 잠김
    const caster = codex.jobs.find((j) => j.id === "caster")!;
    expect(caster.unlocked).toBe(false);
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
