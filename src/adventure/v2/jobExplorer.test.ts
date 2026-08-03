import { describe, expect, it } from "vitest";
import { effectiveCultivateProfile } from "@/adventure/data/v2/proficiency";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_LIST,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  V2_STAT_KEYS,
  V2_STAT_LABELS,
} from "@/adventure/data/v2/v2StatKeys";
import {
  JOB_TAG_FILTERS,
  compareJobExplorerLineOrder,
  isJobVisibleInShrine,
  jobCardTags,
  jobCultivationProfile,
  jobCultivationSummary,
  jobTags,
  matchesJobExplorerFilters,
  toggleJobTagFilter,
  type JobExplorerJob,
} from "./jobExplorer";

const job = (id: string, extra: Partial<JobExplorerJob> = {}): JobExplorerJob => ({
  id,
  name: id,
  tier: 2,
  unlocked: true,
  ...extra,
});

describe("jobExplorer tags", () => {
  it("keeps the visible tag list focused on line, stats, life, and collection", () => {
    expect(JOB_TAG_FILTERS.map((tag) => tag.label)).toEqual([
      "기본",
      "상위",
      "힘",
      "활력",
      "민첩",
      "지능",
      "정신",
      "행운",
      "생활",
      "수집완료",
      "수집미완료",
    ]);
  });

  it("상위 filters unlocked jobs in the current job line", () => {
    const activeTags = new Set(["line"]);
    expect(
      matchesJobExplorerFilters(job("monk"), "", activeTags, {
        currentJobId: "boxer",
      }),
    ).toBe(true);
    expect(
      matchesJobExplorerFilters(job("mage"), "", activeTags, {
        currentJobId: "boxer",
      }),
    ).toBe(false);
    expect(
      matchesJobExplorerFilters(
        job("sensei", { unlocked: false }),
        "",
        activeTags,
        { currentJobId: "boxer" },
      ),
    ).toBe(false);
  });

  it("stat tags use job data rather than label text", () => {
    const intTag = new Set(["int"]);
    const vitTag = new Set(["vit"]);
    expect(matchesJobExplorerFilters(job("shieldman"), "", vitTag)).toBe(true);
    expect(
      matchesJobExplorerFilters(
        job("shieldman", { bonus: "지능이라는 단어가 있어도" }),
        "",
        intTag,
      ),
    ).toBe(false);
  });

  it("stat filters only represent stats that cultivation can raise", () => {
    const strTag = new Set(["str"]);
    const dexTag = new Set(["dex"]);

    // 궁수는 힘 직업 보너스가 있지만 수행으로는 민첩과 행운만 올린다.
    expect(matchesJobExplorerFilters(job("archer"), "", strTag)).toBe(false);
    expect(matchesJobExplorerFilters(job("archer"), "", dexTag)).toBe(true);
    expect(jobCultivationSummary("archer")).toBe("민첩 +2 · 행운 +2");
  });

  it("모험가는 실제 수행과 같이 네 스탯만 표시한다", () => {
    expect(jobCultivationSummary("none")).toBe(
      "힘 +1 · 민첩 +1 · 활력 +1 · 지능 +1",
    );
    expect(matchesJobExplorerFilters(job("none"), "", new Set(["spi"]))).toBe(
      false,
    );
    expect(matchesJobExplorerFilters(job("none"), "", new Set(["luk"]))).toBe(
      false,
    );
  });

  it("일반 상위 직업과 생활 직업은 저장 직군의 실제 수행 프로필을 표시한다", () => {
    expect(jobCultivationSummary("shieldman")).toBe(
      "힘 +2 · 민첩 +1 · 활력 +1",
    );
    expect(jobCultivationSummary("fisher")).toBe(
      "활력 +2 · 힘 +1 · 정신 +1",
    );
    expect(jobCultivationSummary("templar")).toBe(
      "힘 +2 · 활력 +1 · 정신 +1",
    );
  });

  it("모든 직업의 수행 설명과 스탯 필터가 실제 적용 프로필과 일치한다", () => {
    for (const definition of V2_JOB_LIST) {
      const group =
        LEGACY_CLASS_SPEC_BY_JOB[definition.id]?.class ?? definition.id;
      const actual = effectiveCultivateProfile(group, definition.id);
      const expectedSummary = [...V2_STAT_KEYS]
        .filter((stat) => (actual?.[stat] ?? 0) > 0)
        .sort((a, b) => (actual?.[b] ?? 0) - (actual?.[a] ?? 0))
        .map((stat) => `${V2_STAT_LABELS[stat]} +${actual?.[stat]}`)
        .join(" · ");

      expect(jobCultivationProfile(definition.id)).toEqual(actual);
      expect(jobCultivationSummary(definition.id)).toBe(expectedSummary);

      for (const stat of V2_STAT_KEYS) {
        expect(
          matchesJobExplorerFilters(job(definition.id), "", new Set([stat])),
        ).toBe((actual?.[stat] ?? 0) > 0);
      }
    }
  });

  it("생활 matches explicit non-combat job lines", () => {
    const lifeTag = new Set(["life"]);
    expect(matchesJobExplorerFilters(job("healthtrainer"), "", lifeTag)).toBe(true);
    expect(matchesJobExplorerFilters(job("championmaker"), "", lifeTag)).toBe(true);
    expect(matchesJobExplorerFilters(job("legendarytrainer"), "", lifeTag)).toBe(true);
    expect(matchesJobExplorerFilters(job("warrior"), "", lifeTag)).toBe(false);
  });

  it("jobTags does not emit removed tier or hybrid labels", () => {
    expect(jobTags(job("templar", { tier: 3 }))).not.toEqual(
      expect.arrayContaining(["고차", "심화", "최종", "초월", "복합"]),
    );
  });

  it("keeps completed and incomplete collection filters mutually exclusive", () => {
    const collectedJob = job("warrior", {
      tier: 1,
      skillsCollected: true,
    });
    const incompleteJob = job("mage", {
      tier: 1,
      skillsCollected: false,
    });

    expect(jobTags(collectedJob)).toContain("수집완료");
    expect(jobTags(incompleteJob)).toContain("수집미완료");
    expect(jobCardTags(collectedJob)).not.toContain("수집완료");
    expect(jobCardTags(incompleteJob)).not.toContain("수집미완료");
    expect(
      matchesJobExplorerFilters(collectedJob, "", new Set(["collected"])),
    ).toBe(true);
    expect(
      matchesJobExplorerFilters(collectedJob, "", new Set(["incomplete"])),
    ).toBe(false);
    expect(
      matchesJobExplorerFilters(incompleteJob, "", new Set(["incomplete"])),
    ).toBe(true);
    expect(
      matchesJobExplorerFilters(incompleteJob, "", new Set(["collected"])),
    ).toBe(false);

    expect(
      toggleJobTagFilter(new Set(["str", "collected"]), "incomplete"),
    ).toEqual(new Set(["str", "incomplete"]));
    expect(
      toggleJobTagFilter(new Set(["str", "incomplete"]), "collected"),
    ).toEqual(new Set(["str", "collected"]));
  });

  it("growth shrine hides locked jobs until their unlock condition is revealed", () => {
    expect(
      isJobVisibleInShrine(
        job("hidden-master", {
          unlocked: false,
          conditionRevealed: false,
        }),
      ),
    ).toBe(false);
    expect(
      isJobVisibleInShrine(
        job("revealed-master", {
          unlocked: false,
          conditionRevealed: true,
        }),
      ),
    ).toBe(true);
    expect(isJobVisibleInShrine(job("warrior", { unlocked: true }))).toBe(
      true,
    );
  });

  it("growth shrine orders jobs by job line instead of tier blocks", () => {
    const ids = [
      "mage",
      "shieldman",
      "warrior",
      "paladin",
      "squire",
      "caster",
      "guardian",
      "survivor",
      "camper",
    ];

    expect(
      ids
        .map((id) => job(id))
        .sort(compareJobExplorerLineOrder)
        .map((j) => j.id),
    ).toEqual([
      "warrior",
      "shieldman",
      "guardian",
      "squire",
      "paladin",
      "mage",
      "caster",
      "survivor",
      "camper",
    ]);
  });
});
