import { describe, expect, it } from "vitest";
import { V2_JOB_CATALOG } from "./v2JobCatalog";
import { V2_SKILLS, spCostOf } from "./v2Skills";
import { skillsForJob } from "./v2SkillsByJob";
import {
  TIER6_CAREER_ROUTES,
  buildCareerSnapshot,
  selectCareerLoadout,
  type SimArch,
} from "../../../../scripts/sim-v2-career-loadout";

describe("sim-v2 6차 직업 수집 스냅샷", () => {
  it("0개는 첫 5차까지만, 1~3개는 정해진 6차 순회 순서를 누적한다", () => {
    const zero = buildCareerSnapshot("STR", 0);
    expect(V2_JOB_CATALOG[zero.currentJob]?.tier).toBe(5);
    expect(zero.visitedJobs.every((jobId) => V2_JOB_CATALOG[jobId]?.tier !== 6)).toBe(true);

    for (const count of [1, 2, 3]) {
      const snapshot = buildCareerSnapshot("STR", count);
      expect(snapshot.tier6Jobs).toEqual(TIER6_CAREER_ROUTES.STR.slice(0, count));
      expect(snapshot.currentJob).toBe(TIER6_CAREER_ROUTES.STR[count - 1]);
      expect(snapshot.spBudget).toBeGreaterThanOrEqual(zero.spBudget);
    }
  });

  it("모든 아키타입이 서로 다른 전투형 6차 세 직업 조합을 가진다", () => {
    for (const arch of Object.keys(TIER6_CAREER_ROUTES) as SimArch[]) {
      const route = TIER6_CAREER_ROUTES[arch];
      expect(route).toHaveLength(3);
      expect(new Set(route).size).toBe(3);
      expect(route.every((jobId) => V2_JOB_CATALOG[jobId]?.tier === 6)).toBe(true);
    }
  });

  it("수집한 여러 직업의 패시브를 SP 예산 안에서 실제 장착 조합으로 만든다", () => {
    const snapshot = buildCareerSnapshot("VIT", 3);
    const selected = selectCareerLoadout(
      "VIT",
      snapshot.learnedJobSkills,
      snapshot.spBudget,
    );
    const computedCost = selected.equipped.reduce(
      (sum, id) => sum + spCostOf(V2_SKILLS[id]),
      0,
    );
    const passiveJobs = new Set(
      snapshot.visitedJobs.filter((jobId) =>
        skillsForJob(jobId).some(
          (skillId) =>
            V2_SKILLS[skillId]?.passive != null &&
            selected.equipped.includes(skillId),
        ),
      ),
    );

    expect(selected.spUsed).toBe(computedCost);
    expect(selected.spUsed).toBeLessThanOrEqual(snapshot.spBudget);
    expect(selected.equipped.every((id) => selected.learned.includes(id))).toBe(true);
    expect(selected.equipped.some((id) => V2_SKILLS[id].category === "attack")).toBe(true);
    expect(selected.equipped.filter((id) => V2_SKILLS[id].passive != null).length).toBeGreaterThan(2);
    expect(passiveJobs.size).toBeGreaterThan(1);
  });

  it("모든 대표 성장 경로가 공격기와 복수 패시브를 예산 안에 유지한다", () => {
    for (const arch of Object.keys(TIER6_CAREER_ROUTES) as SimArch[]) {
      for (const tier6Count of [0, 1, 2, 3]) {
        const snapshot = buildCareerSnapshot(arch, tier6Count);
        const selected = selectCareerLoadout(
          arch,
          snapshot.learnedJobSkills,
          snapshot.spBudget,
        );
        const activeCount = selected.equipped.filter(
          (id) => V2_SKILLS[id].passive == null,
        ).length;
        const passiveCount = selected.equipped.length - activeCount;

        expect(selected.spUsed, `${arch}/${tier6Count}`).toBeLessThanOrEqual(
          snapshot.spBudget,
        );
        expect(activeCount, `${arch}/${tier6Count}`).toBeGreaterThanOrEqual(1);
        expect(passiveCount, `${arch}/${tier6Count}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
