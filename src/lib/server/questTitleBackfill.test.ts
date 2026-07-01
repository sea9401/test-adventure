import { describe, expect, it } from "vitest";
import {
  addTitlesToAdventureLog,
  missingClaimedQuestTitleRewards,
} from "@/lib/server/questTitleBackfill";

describe("questTitleBackfill", () => {
  it("이미 수령한 퀘스트에 나중에 붙은 칭호 보상을 찾아낸다", () => {
    const missing = missingClaimedQuestTitleRewards(
      new Set(["a_depth48"]),
      { titles: {} },
    );

    expect(missing).toEqual(["ach_frontier_end"]);
  });

  it("이미 보유한 칭호는 백필 대상에서 제외한다", () => {
    const missing = missingClaimedQuestTitleRewards(new Set(["a_depth48"]), {
      titles: { ach_frontier_end: { obtainedAt: 111 } },
    });

    expect(missing).toEqual([]);
  });

  it("응답 계산에 쓰는 adventure-log 스냅샷에 지급 칭호를 합친다", () => {
    const next = addTitlesToAdventureLog(
      { battleLosses: 2, titles: { first_blood: { obtainedAt: 1 } } },
      ["ach_frontier_end"],
      222,
    );

    expect(next).toEqual({
      battleLosses: 2,
      titles: {
        first_blood: { obtainedAt: 1 },
        ach_frontier_end: { obtainedAt: 222 },
      },
    });
  });
});
