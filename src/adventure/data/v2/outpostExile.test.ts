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

  it("동쪽 끝 거점 → 동단 자유항(에우로스)", () => {
    // kingdom_ragnarod(8000,3300) 최근접 중립 = neutral_east_outpost(9000,3000).
    expect(nearestNeutralOutpostId("kingdom_ragnarod")).toBe(
      "neutral_east_outpost",
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
