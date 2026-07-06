import { describe, it, expect } from "vitest";
import {
  ACTIONS_ALLOWED,
  COLLAPSE_RISK,
  TREASURE_GRID_HEIGHT,
  TREASURE_GRID_SIZE,
  TREASURE_MAX_ENERGY,
  applyTreasureAction,
  finalConditionForSession,
  hintsForSession,
  parseTreasureSession,
  rollNewSession,
  toPublicSite,
  type TreasureCellKind,
  type TreasureSession,
} from "./treasureDig";
import { isAntiqueId, MIN_CONDITION } from "@/adventure/data/v2/antique";

function session(overrides: Partial<TreasureSession> = {}): TreasureSession {
  const base = rollNewSession({ siteId: "s1", rng: () => 0.5, now: 0 });
  return {
    ...base,
    antiqueId: "clay_shard",
    condition: 60,
    instability: 0,
    stability: 92,
    risk: 10,
    insight: 0,
    ...overrides,
  };
}

function adjacentHidden(s: TreasureSession, kind?: TreasureCellKind): number {
  const target = s.cells.find((cell) => {
    if (cell.revealed) return false;
    if (kind && cell.kind !== kind) return false;
    const ax = cell.index % s.gridSize;
    const ay = Math.floor(cell.index / s.gridSize);
    const px = s.position % s.gridSize;
    const py = Math.floor(s.position / s.gridSize);
    return Math.abs(ax - px) + Math.abs(ay - py) === 1;
  });
  if (!target) throw new Error("adjacent hidden cell not found");
  return target.index;
}

function adjacentRevealed(s: TreasureSession): number {
  const target = s.cells.find((cell) => {
    if (!cell.revealed || cell.index === s.position) return false;
    const ax = cell.index % s.gridSize;
    const ay = Math.floor(cell.index / s.gridSize);
    const px = s.position % s.gridSize;
    const py = Math.floor(s.position / s.gridSize);
    return Math.abs(ax - px) + Math.abs(ay - py) === 1;
  });
  if (!target) throw new Error("adjacent revealed cell not found");
  return target.index;
}

function withAdjacentKind(s: TreasureSession, kind: TreasureCellKind): {
  session: TreasureSession;
  cell: number;
} {
  const cell = adjacentHidden(s);
  return {
    cell,
    session: {
      ...s,
      cells: s.cells.map((c) =>
        c.index === cell ? { ...c, kind, revealed: false, scanned: false } : c,
      ),
    },
  };
}

describe("rollNewSession / toPublicSite", () => {
  it("유효 지도 세션을 만들고 공개 뷰는 비밀을 제거한다", () => {
    const s = rollNewSession({ siteId: "x", rng: () => 0.5, now: 1000 });
    expect(isAntiqueId(s.antiqueId)).toBe(true);
    expect(s.actionsAllowed).toBe(ACTIONS_ALLOWED);
    expect(s.gridSize).toBe(TREASURE_GRID_SIZE);
    expect(s.gridHeight).toBe(TREASURE_GRID_HEIGHT);
    expect(s.energy).toBe(TREASURE_MAX_ENERGY);
    expect(s.cells).toHaveLength(TREASURE_GRID_SIZE * TREASURE_GRID_HEIGHT);

    const pub = toPublicSite(s);
    expect(pub).not.toHaveProperty("antiqueId");
    expect(pub).not.toHaveProperty("condition");
    expect(pub).not.toHaveProperty("instability");
    expect(pub.actionsUsed).toBe(0);
    expect(pub.canRetreat).toBe(false);
    expect(pub.cells.some((c) => c.kind === undefined && !c.revealed)).toBe(true);
  });
});

describe("applyTreasureAction", () => {
  it("인접한 숨은 칸을 발굴하면 탐사력을 쓰고 그 칸으로 이동한다", () => {
    const s = session();
    const cell = adjacentHidden(s);
    const r = applyTreasureAction(s, "excavate", { cell });
    expect(r.kind).toBe("progress");
    expect(r.session.position).toBe(cell);
    expect(r.session.energy).toBeLessThan(TREASURE_MAX_ENERGY);
    expect(r.session.cells[cell].revealed).toBe(true);
    expect(r.session.haul).toBeGreaterThan(0);
    expect(r.session.actions[0].action).toBe("excavate");
    expect(r.session.actions[0].cell).toBe(cell);
  });

  it("이미 드러난 인접 칸으로 이동할 수 있다", () => {
    const s = session();
    const opened = applyTreasureAction(s, "excavate", { cell: adjacentHidden(s) });
    expect(opened.kind).toBe("progress");
    const cell = adjacentRevealed(opened.session);
    const r = applyTreasureAction(opened.session, "move", { cell });
    expect(r.kind).toBe("progress");
    expect(r.session.position).toBe(cell);
    expect(r.session.energy).toBeLessThan(opened.session.energy);
  });

  it("탐지는 주변 숨은 칸의 종류를 공개하지 않고 스캔 상태로 만든다", () => {
    const s = session();
    const r = applyTreasureAction(s, "scan");
    expect(r.kind).toBe("progress");
    expect(r.session.energy).toBe(TREASURE_MAX_ENERGY - 2);
    expect(r.session.insight).toBeGreaterThan(0);
    expect(r.session.cells.some((c) => c.scanned && !c.revealed)).toBe(true);
  });

  it("폭약은 인접 숨은 칸을 낮은 탐사력 비용으로 열고 폭약을 소비한다", () => {
    const { session: s, cell } = withAdjacentKind(session(), "rock");
    const normal = applyTreasureAction(s, "excavate", { cell });
    const bombed = applyTreasureAction(s, "bomb", { cell });
    expect(normal.kind).toBe("progress");
    expect(bombed.kind).toBe("progress");
    expect(bombed.session.position).toBe(cell);
    expect(bombed.session.tools.bombs).toBe(s.tools.bombs - 1);
    expect(bombed.session.energy).toBeGreaterThan(normal.session.energy);
    expect(bombed.session.risk).toBeLessThan(normal.session.risk);
  });

  it("보강은 탐사력을 쓰고 안정도를 회복하며 위험을 낮춘다", () => {
    const r = applyTreasureAction(session({ risk: 80, stability: 45 }), "secure");
    expect(r.kind).toBe("progress");
    expect(r.session.energy).toBe(TREASURE_MAX_ENERGY - 2);
    expect(r.session.risk).toBeLessThan(80);
    expect(r.session.stability).toBeGreaterThan(45);
  });

  it("위험도가 100에 닿으면 붕괴된다", () => {
    const { session: s, cell } = withAdjacentKind(
      session({ risk: 95, stability: 30, instability: 6 }),
      "fissure",
    );
    const r = applyTreasureAction(s, "excavate", { cell });
    expect(r.kind).toBe("collapsed");
    expect(r.session.risk).toBe(COLLAPSE_RISK);
  });

  it("전리품 없이 귀환하면 실패한다", () => {
    const r = applyTreasureAction(session(), "retreat");
    expect(r.kind).toBe("failed");
  });

  it("전리품을 들고 귀환하면 유물이 회수되고 최종 보존상태가 산출된다", () => {
    const s = session({ depth: 3, haul: 120, stability: 84, risk: 44, insight: 55 });
    const r = applyTreasureAction(s, "retreat");
    expect(r.kind).toBe("extracted");
    if (r.kind === "extracted") {
      expect(r.condition).toBe(finalConditionForSession(r.session));
      expect(r.condition).toBeGreaterThanOrEqual(MIN_CONDITION);
      expect(r.condition).toBeLessThanOrEqual(100);
    }
  });

  it("로프 귀환은 로프를 소비하고 일반 귀환보다 보존상태를 높인다", () => {
    const s = session({ depth: 4, haul: 130, stability: 62, risk: 88, insight: 45 });
    const normal = applyTreasureAction(s, "retreat");
    const rope = applyTreasureAction(s, "rope");
    expect(normal.kind).toBe("extracted");
    expect(rope.kind).toBe("extracted");
    if (normal.kind === "extracted" && rope.kind === "extracted") {
      expect(rope.session.tools.ropes).toBe(s.tools.ropes - 1);
      expect(rope.condition).toBeGreaterThan(normal.condition);
    }
  });

  it("행동 예산을 다 쓰면 진행 행동은 무효지만 귀환은 가능하다", () => {
    let s = session({ haul: 80 });
    for (let i = 0; i < ACTIONS_ALLOWED; i += 1) {
      const r = applyTreasureAction(s, "secure");
      s = r.session;
    }
    expect(applyTreasureAction(s, "scan").kind).toBe("invalid");
    expect(applyTreasureAction(s, "retreat").kind).toBe("extracted");
  });
});

describe("hintsForSession", () => {
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
});

describe("parseTreasureSession", () => {
  it("손상/빈 입력은 null", () => {
    expect(parseTreasureSession(null)).toBeNull();
    expect(parseTreasureSession({})).toBeNull();
  });

  it("옛 격자 세션은 지도형 세션으로 이전한다", () => {
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
    expect(migrated?.cells).toHaveLength(TREASURE_GRID_SIZE * TREASURE_GRID_HEIGHT);
    expect(migrated?.tools.bombs).toBeGreaterThan(0);
    expect(migrated?.actions).toHaveLength(2);
    expect(migrated?.haul).toBeGreaterThan(0);
  });

  it("이전 수치형 세션도 지도형 세션으로 이전한다", () => {
    const migrated = parseTreasureSession({
      siteId: "meter",
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
    expect(migrated?.tools.ropes).toBeGreaterThan(0);
  });

  it("심도 돌파형 세션도 지도형 세션으로 이전한다", () => {
    const migrated = parseTreasureSession({
      siteId: "depth",
      antiqueId: "clay_shard",
      condition: 50,
      instability: 3,
      depth: 2,
      maxDepth: 5,
      haul: 80,
      stability: 82,
      risk: 41,
      insight: 36,
      actionsAllowed: 8,
      actions: [
        {
          action: "descend",
          depth: 1,
          haul: 16,
          stability: 90,
          risk: 30,
          insight: 12,
          message: "x",
        },
      ],
      openedAt: 10,
    });
    expect(migrated?.siteId).toBe("depth");
    expect(migrated?.cells).toHaveLength(TREASURE_GRID_SIZE * TREASURE_GRID_HEIGHT);
    expect(migrated?.haul).toBe(80);
    expect(migrated?.tools.bombs).toBeGreaterThan(0);
  });

  it("정상 라운드트립", () => {
    const s = session();
    const r = applyTreasureAction(s, "excavate", { cell: adjacentHidden(s) });
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
            energy: 1,
            message: "x",
          },
        ],
      }),
    ).toBeNull();
  });
});
