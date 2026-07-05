import { describe, it, expect } from "vitest";
import {
  ACTIONS_ALLOWED,
  COLLAPSE_RISK,
  MIN_EXPOSURE_TO_EXTRACT,
  applyTreasureAction,
  finalConditionForSession,
  hintsForSession,
  parseTreasureSession,
  rollNewSession,
  toPublicSite,
  type TreasureSession,
} from "./treasureDig";
import { isAntiqueId, MIN_CONDITION } from "@/adventure/data/v2/antique";

function session(overrides: Partial<TreasureSession> = {}): TreasureSession {
  return {
    siteId: "s1",
    antiqueId: "clay_shard",
    condition: 60,
    instability: 0,
    exposure: 0,
    preservation: 100,
    risk: 10,
    certainty: 0,
    actionsAllowed: ACTIONS_ALLOWED,
    actions: [],
    openedAt: 0,
    ...overrides,
  };
}

describe("rollNewSession / toPublicSite", () => {
  it("유효 세션을 만들고 공개 뷰는 비밀을 제거한다", () => {
    const s = rollNewSession({ siteId: "x", rng: () => 0.5, now: 1000 });
    expect(isAntiqueId(s.antiqueId)).toBe(true);
    expect(s.actionsAllowed).toBe(ACTIONS_ALLOWED);
    expect(s.exposure).toBe(0);
    expect(s.preservation).toBe(100);

    const pub = toPublicSite(s);
    expect(pub).not.toHaveProperty("antiqueId");
    expect(pub).not.toHaveProperty("condition");
    expect(pub).not.toHaveProperty("instability");
    expect(pub.actionsUsed).toBe(0);
    expect(pub.canExtract).toBe(false);
  });
});

describe("applyTreasureAction", () => {
  it("탐침은 확신도를 크게 올리고 행동 기록을 남긴다", () => {
    const r = applyTreasureAction(session(), "probe");
    expect(r.kind).toBe("progress");
    expect(r.session.certainty).toBe(26);
    expect(r.session.exposure).toBe(7);
    expect(r.session.risk).toBe(18);
    expect(r.session.actions).toHaveLength(1);
    expect(r.session.actions[0].action).toBe("probe");
  });

  it("삽질은 빠르게 노출하지만 위험과 보존도 손상이 크다", () => {
    const r = applyTreasureAction(session({ risk: 70 }), "shovel");
    expect(r.kind).toBe("progress");
    expect(r.session.exposure).toBe(24);
    expect(r.session.risk).toBe(88);
    expect(r.session.preservation).toBeLessThan(92);
  });

  it("보강은 위험도를 낮추고 약간의 진행만 준다", () => {
    const r = applyTreasureAction(session({ risk: 80 }), "stabilize");
    expect(r.kind).toBe("progress");
    expect(r.session.risk).toBe(56);
    expect(r.session.exposure).toBe(3);
  });

  it("위험도가 100에 닿으면 붕괴된다", () => {
    const r = applyTreasureAction(session({ risk: 95, instability: 6 }), "shovel");
    expect(r.kind).toBe("collapsed");
    expect(r.session.risk).toBe(COLLAPSE_RISK);
  });

  it("노출도가 부족한 조기 회수는 실패한다", () => {
    const r = applyTreasureAction(session({ exposure: MIN_EXPOSURE_TO_EXTRACT - 1 }), "extract");
    expect(r.kind).toBe("failed");
    expect(r.session.risk).toBe(COLLAPSE_RISK);
  });

  it("충분히 노출된 유물은 회수되고 최종 보존상태가 산출된다", () => {
    const s = session({ exposure: 82, preservation: 90, condition: 50, certainty: 80 });
    const r = applyTreasureAction(s, "extract");
    expect(r.kind).toBe("extracted");
    if (r.kind === "extracted") {
      expect(r.condition).toBe(finalConditionForSession(r.session));
      expect(r.condition).toBeGreaterThanOrEqual(MIN_CONDITION);
      expect(r.condition).toBeLessThanOrEqual(100);
    }
  });

  it("행동 예산을 다 쓰면 진행 행동은 무효지만 회수는 가능하다", () => {
    let s = session();
    for (let i = 0; i < ACTIONS_ALLOWED; i += 1) {
      const r = applyTreasureAction(s, "brush");
      s = r.session;
    }
    expect(applyTreasureAction(s, "brush").kind).toBe("invalid");
    expect(applyTreasureAction({ ...s, exposure: 80 }, "extract").kind).toBe("extracted");
  });
});

describe("hintsForSession", () => {
  it("확신도에 따라 힌트를 단계적으로 공개한다", () => {
    expect(hintsForSession(session({ certainty: 0 }))).toHaveLength(0);
    expect(hintsForSession(session({ certainty: 20 })).map((h) => h.key)).toEqual([
      "theme",
    ]);
    expect(hintsForSession(session({ certainty: 90 })).map((h) => h.key)).toEqual([
      "theme",
      "tier",
      "value",
      "name",
    ]);
  });
});

describe("parseTreasureSession", () => {
  it("손상/빈 입력은 null", () => {
    expect(parseTreasureSession(null)).toBeNull();
    expect(parseTreasureSession({})).toBeNull();
  });

  it("옛 격자 세션은 새 발굴 세션으로 이전한다", () => {
    const migrated = parseTreasureSession({
      siteId: "old",
      gridSize: 6,
      treasureCell: 1,
      antiqueId: "clay_shard",
      condition: 50,
      digsAllowed: 7,
      digs: [{ cell: 0, clue: "warm" }, { cell: 1, clue: "hot" }],
    });
    expect(migrated?.siteId).toBe("old");
    expect(migrated?.antiqueId).toBe("clay_shard");
    expect(migrated?.actions).toHaveLength(2);
    expect(migrated?.exposure).toBeGreaterThan(0);
  });

  it("정상 라운드트립", () => {
    const r = applyTreasureAction(session(), "probe");
    expect(parseTreasureSession(r.session)).toEqual(r.session);
  });

  it("범위 밖 수치와 미지 액션은 null", () => {
    const s = session();
    expect(parseTreasureSession({ ...s, antiqueId: "fake" })).toBeNull();
    expect(parseTreasureSession({ ...s, exposure: 101 })).toBeNull();
    expect(parseTreasureSession({ ...s, preservation: 0 })).toBeNull();
    expect(parseTreasureSession({ ...s, instability: 99 })).toBeNull();
    expect(
      parseTreasureSession({
        ...s,
        actions: [
          {
            action: "wrong",
            exposure: 1,
            preservation: 99,
            risk: 1,
            certainty: 1,
            message: "x",
          },
        ],
      }),
    ).toBeNull();
  });
});
