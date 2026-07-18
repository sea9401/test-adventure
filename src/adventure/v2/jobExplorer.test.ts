import { describe, expect, it } from "vitest";
import {
  JOB_TAG_FILTERS,
  compareJobExplorerLineOrder,
  isJobVisibleInShrine,
  jobCultivationSummary,
  jobTags,
  matchesJobExplorerFilters,
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
