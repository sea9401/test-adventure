import { describe, it, expect } from "vitest";
import {
  OUTPOSTS,
  OUTPOST_BY_ID,
  START_OUTPOST_ID,
  nearestNeutralOutpostId,
} from "./outposts";

describe("nearestNeutralOutpostId (토벌 추방 대상)", () => {
  const neutralIds = new Set(
    OUTPOSTS.filter((o) => o.neutral).map((o) => o.id),
  );

  it("항상 중립 자유도시를 반환", () => {
    for (const o of OUTPOSTS) {
      expect(neutralIds.has(nearestNeutralOutpostId(o.id))).toBe(true);
    }
  });

  it("중앙 거점 → 중앙 자유도시(리베라)", () => {
    expect(nearestNeutralOutpostId("war_central_fort")).toBe(
      "neutral_haven_central",
    );
  });

  it("어느 거점이든 유일 중립 리베라로 (중립=리베라 1곳뿐)", () => {
    // 중립이 리베라(neutral_haven_central) 하나뿐이라 모든 추방은 리베라로 수렴.
    expect(nearestNeutralOutpostId("kingdom_ragnarod")).toBe(
      "neutral_haven_central",
    );
  });

  it("미지의 거점 id → 시작 거점 폴백", () => {
    expect(nearestNeutralOutpostId("does_not_exist")).toBe(START_OUTPOST_ID);
  });

  it("반환값은 실재하는 거점", () => {
    expect(OUTPOST_BY_ID.has(nearestNeutralOutpostId("kingdom_tatiholm"))).toBe(
      true,
    );
  });
});
