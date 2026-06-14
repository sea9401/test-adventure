import { describe, it, expect } from "vitest";
import {
  ACTIVE_CONTEST_OUTPOST_IDS,
  CONTESTABLE_OUTPOST_IDS,
  WAR_ACTIVE_OUTPOST_COUNT,
  isActiveContestOutpost,
  isContestableOutpost,
  validateContestablePool,
} from "./warOutposts";

describe("warOutposts", () => {
  it("후보 풀이 전부 실재하는 비중립 거점", () => {
    const { ok, problems } = validateContestablePool();
    expect(problems).toEqual([]);
    expect(ok).toBe(true);
  });

  it("앵커는 카스트라(war_central_fort)이고 활성 집합 맨 앞", () => {
    expect(CONTESTABLE_OUTPOST_IDS[0]).toBe("war_central_fort");
    expect(ACTIVE_CONTEST_OUTPOST_IDS[0]).toBe("war_central_fort");
  });

  it("활성 집합 = 풀 앞에서부터 N개", () => {
    expect(ACTIVE_CONTEST_OUTPOST_IDS).toEqual(
      CONTESTABLE_OUTPOST_IDS.slice(0, WAR_ACTIVE_OUTPOST_COUNT),
    );
  });

  it("isContestable / isActive 판정", () => {
    expect(isContestableOutpost("war_central_fort")).toBe(true);
    expect(isActiveContestOutpost("war_central_fort")).toBe(true);
    // 풀에 있지만(있다면) 비활성인 거점은 contestable 이되 active 아님.
    const inactive = CONTESTABLE_OUTPOST_IDS.slice(WAR_ACTIVE_OUTPOST_COUNT);
    for (const id of inactive) {
      expect(isContestableOutpost(id)).toBe(true);
      expect(isActiveContestOutpost(id)).toBe(false);
    }
    // 풀 밖 거점.
    expect(isContestableOutpost("kingdom_sunderhold")).toBe(false);
    expect(isActiveContestOutpost("kingdom_sunderhold")).toBe(false);
  });
});
