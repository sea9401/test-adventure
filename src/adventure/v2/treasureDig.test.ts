import { describe, it, expect } from "vitest";
import {
  ACTIONS_ALLOWED,
  COLLAPSE_RISK,
  MAX_DEPTH,
  applyTreasureAction,
  finalConditionForSession,
  hintsForSession,
  parseTreasureSession,
  rollNewSession,
  toPublicSite,
  treasureAppraisalBonusPct,
  treasureUsedProbe,
  type TreasureSession,
} from "./treasureDig";
import { isAntiqueId, MIN_CONDITION } from "@/adventure/data/v2/antique";

function session(overrides: Partial<TreasureSession> = {}): TreasureSession {
  return {
    siteId: "s1",
    siteOptionId: "old_market",
    fieldEventId: "buried_cache",
    antiqueId: "clay_shard",
    condition: 60,
    instability: 0,
    depth: 0,
    maxDepth: MAX_DEPTH,
    haul: 0,
    stability: 92,
    risk: 10,
    insight: 0,
    actionsAllowed: ACTIONS_ALLOWED,
    actions: [],
    openedAt: 0,
    ...overrides,
  };
}

describe("rollNewSession / toPublicSite", () => {
  it("유효 세션을 만들고 공개 뷰는 비밀을 제거한다", () => {
    const s = rollNewSession({
      siteId: "x",
      siteOptionId: "royal_tomb",
      rng: () => 0.5,
      now: 1000,
    });
    expect(isAntiqueId(s.antiqueId)).toBe(true);
    expect(s.siteOptionId).toBe("royal_tomb");
    expect(s.actionsAllowed).toBe(ACTIONS_ALLOWED - 1);
    expect(s.depth).toBe(0);
    expect(s.haul).toBe(0);

    const pub = toPublicSite(s);
    expect(pub).not.toHaveProperty("antiqueId");
    expect(pub).not.toHaveProperty("condition");
    expect(pub).not.toHaveProperty("instability");
    expect(pub.siteOption.id).toBe("royal_tomb");
    expect(pub.actionsUsed).toBe(0);
    expect(pub.canRetreat).toBe(false);
    expect(pub.nextDepthReward).toBeGreaterThan(0);
  });
});

describe("applyTreasureAction", () => {
  it("더 내려가기는 심도와 전리품을 올리고 위험을 키운다", () => {
    const r = applyTreasureAction(session(), "descend");
    expect(r.kind).toBe("progress");
    expect(r.session.depth).toBe(1);
    expect(r.session.haul).toBeGreaterThan(0);
    expect(r.session.risk).toBeGreaterThan(10);
    expect(r.session.actions[0].action).toBe("descend");
  });

  it("우회는 내려가되 직행보다 위험 증가와 전리품이 작다", () => {
    const direct = applyTreasureAction(session(), "descend");
    const detour = applyTreasureAction(session(), "detour");
    expect(direct.kind).toBe("progress");
    expect(detour.kind).toBe("progress");
    expect(detour.session.depth).toBe(1);
    expect(detour.session.risk).toBeLessThan(direct.session.risk);
    expect(detour.session.haul).toBeLessThan(direct.session.haul);
  });

  it("정밀 발굴은 현재 층 전리품과 판독을 올린다", () => {
    const r = applyTreasureAction(session({ depth: 2, haul: 20 }), "excavate");
    expect(r.kind).toBe("progress");
    expect(r.session.depth).toBe(2);
    expect(r.session.haul).toBeGreaterThan(20);
    expect(r.session.insight).toBeGreaterThan(15);
    expect(treasureUsedProbe(r.session)).toBe(true);
  });

  it("보강은 안정도를 회복하고 위험을 낮춘다", () => {
    const r = applyTreasureAction(session({ risk: 80, stability: 45 }), "secure");
    expect(r.kind).toBe("progress");
    expect(r.session.risk).toBeLessThan(80);
    expect(r.session.stability).toBeGreaterThan(45);
  });

  it("위험도가 100에 닿으면 붕괴된다", () => {
    const r = applyTreasureAction(
      session({ risk: 95, stability: 30, depth: 3, instability: 6 }),
      "descend",
    );
    expect(r.kind).toBe("collapsed");
    expect(r.session.risk).toBe(COLLAPSE_RISK);
  });

  it("전리품 없이 철수하면 실패한다", () => {
    const r = applyTreasureAction(session(), "retreat");
    expect(r.kind).toBe("failed");
  });

  it("전리품을 들고 철수하면 유물이 회수되고 최종 보존상태가 산출된다", () => {
    const s = session({ depth: 3, haul: 120, stability: 84, risk: 44, insight: 55 });
    const r = applyTreasureAction(s, "retreat");
    expect(r.kind).toBe("extracted");
    if (r.kind === "extracted") {
      expect(r.condition).toBe(finalConditionForSession(r.session));
      expect(r.condition).toBeGreaterThanOrEqual(MIN_CONDITION);
      expect(r.condition).toBeLessThanOrEqual(100);
    }
  });

  it("행동 예산을 다 쓰면 진행 행동은 무효지만 철수는 가능하다", () => {
    let s = session();
    for (let i = 0; i < ACTIONS_ALLOWED; i += 1) {
      const r = applyTreasureAction(s, "excavate");
      s = r.session;
    }
    expect(applyTreasureAction(s, "secure").kind).toBe("invalid");
    expect(applyTreasureAction({ ...s, haul: 80 }, "retreat").kind).toBe("extracted");
  });
});

describe("hints / bonus", () => {
  it("판독에 따라 힌트를 단계적으로 공개한다", () => {
    expect(hintsForSession(session({ insight: 0 }))).toHaveLength(0);
    expect(hintsForSession(session({ insight: 15 })).map((h) => h.key)).toEqual([
      "theme",
    ]);
    expect(hintsForSession(session({ insight: 85 })).map((h) => h.key)).toEqual([
      "theme",
      "tier",
      "value",
      "name",
    ]);
  });

  it("봉인된 방 감정 보너스는 정밀 발굴 사용 후에만 적용된다", () => {
    const sealed = session({ fieldEventId: "sealed_chamber" });
    expect(treasureAppraisalBonusPct(sealed)).toBe(0);
    const excavated = applyTreasureAction(sealed, "excavate").session;
    expect(treasureAppraisalBonusPct(excavated)).toBe(25);
  });
});

describe("parseTreasureSession", () => {
  it("손상/빈 입력은 null", () => {
    expect(parseTreasureSession(null)).toBeNull();
    expect(parseTreasureSession({})).toBeNull();
  });

  it("옛 격자 세션은 심도 돌파형 세션으로 이전한다", () => {
    const migrated = parseTreasureSession({
      siteId: "old",
      siteOptionId: "royal_tomb",
      fieldEventId: "intact_layer",
      gridSize: 6,
      treasureCell: 1,
      antiqueId: "clay_shard",
      condition: 50,
      digsAllowed: 7,
      digs: [{ cell: 0, clue: "warm" }, { cell: 1, clue: "hot" }],
    });
    expect(migrated?.siteId).toBe("old");
    expect(migrated?.siteOptionId).toBe("royal_tomb");
    expect(migrated?.fieldEventId).toBe("intact_layer");
    expect(migrated?.actions).toHaveLength(2);
    expect(migrated?.haul).toBeGreaterThan(0);
  });

  it("이전 수치형 세션도 심도 돌파형 세션으로 이전한다", () => {
    const migrated = parseTreasureSession({
      siteId: "meter",
      siteOptionId: "old_market",
      fieldEventId: "buried_cache",
      antiqueId: "clay_shard",
      condition: 50,
      instability: 3,
      exposure: 58,
      preservation: 82,
      risk: 41,
      certainty: 36,
      actionsAllowed: 9,
      actions: [
        {
          action: "probe",
          exposure: 7,
          preservation: 99,
          risk: 18,
          certainty: 26,
          message: "x",
        },
      ],
      openedAt: 10,
    });
    expect(migrated?.siteId).toBe("meter");
    expect(migrated?.depth).toBeGreaterThan(0);
    expect(migrated?.haul).toBeGreaterThan(0);
  });

  it("정상 라운드트립", () => {
    const r = applyTreasureAction(session(), "descend");
    expect(parseTreasureSession(r.session)).toEqual(r.session);
  });

  it("범위 밖 수치와 미지 액션은 null", () => {
    const s = session();
    expect(parseTreasureSession({ ...s, antiqueId: "fake" })).toBeNull();
    expect(parseTreasureSession({ ...s, depth: 99 })).toBeNull();
    expect(parseTreasureSession({ ...s, haul: -1 })).toBeNull();
    expect(parseTreasureSession({ ...s, stability: 101 })).toBeNull();
    expect(parseTreasureSession({ ...s, instability: 99 })).toBeNull();
    expect(
      parseTreasureSession({
        ...s,
        actions: [
          {
            action: "wrong",
            depth: 1,
            haul: 1,
            stability: 99,
            risk: 1,
            insight: 1,
            message: "x",
          },
        ],
      }),
    ).toBeNull();
  });
});
