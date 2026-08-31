import { describe, expect, it } from "vitest";
import { validateCodexMasteryRelease } from "../../../scripts/check-codex-mastery-release.mjs";

const required = [
  "drizzle/0175_codex_research_publication.sql",
  "src/app/api/rankings/codex-research/archive/route.ts",
  "src/app/api/admin/codex-research-seasons/route.ts",
  "src/adventure/rankings/CodexResearchArchivePanel.tsx",
];

function sources() {
  return new Map([
    ["src/lib/server/opsSettings.ts", `export const DEFAULT_CODEX_MASTERY_FEATURES = {
      recordingEnabled: false, overviewVisible: false, rankingVisible: false,
      sealsEnabled: false, trophiesEnabled: false, monthlyProgressEnabled: false,
      monthlyRankingVisible: false, settlementEnabled: false, feedEnabled: false,
    };`],
    ["src/adventure/data/v2/codexResearchOps.ts", `"publish-honors": "PUBLISH"`],
    ["src/app/api/rankings/codex-research/archive/route.ts", `!settings.monthlyRankingVisible || !settings.trophiesEnabled`],
  ]);
}

describe("codex mastery release checker", () => {
  it("accepts the inert required surface", () => {
    expect(validateCodexMasteryRelease(sources(), required)).toEqual([]);
  });

  it("rejects an enabled default and production automation", () => {
    const changed = sources();
    changed.set("src/lib/server/opsSettings.ts", changed.get("src/lib/server/opsSettings.ts")!.replace("feedEnabled: false", "feedEnabled: true"));
    const errors = validateCodexMasteryRelease(changed, [
      ...required,
      "src/app/api/cron/codex-research/route.ts",
    ]);
    expect(errors.join("\n")).toContain("feedEnabled must default to false");
    expect(errors.join("\n")).toContain("production automation is forbidden");
  });
});
