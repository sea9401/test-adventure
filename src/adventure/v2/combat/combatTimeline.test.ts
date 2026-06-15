// ATB 타임라인 순수 헬퍼 — 단위테스트. 결정론·~2배 천장·동점 player 우선·몬스터 매핑.
import { describe, it, expect } from "vitest";
import {
  RATE_CAP,
  actionRate,
  actionInterval,
  effectiveMonsterSpd,
  depthSpdCorrection,
  tieRank,
  pickNextEntry,
  nextActor1v1,
  type TimelineEntry,
} from "./combatTimeline";

describe("actionRate — 로그 소프트캡", () => {
  it("SPD↑ 면 rate 단조 증가", () => {
    let prev = -1;
    for (const s of [0, 20, 50, 120, 200, 292]) {
      const r = actionRate(s);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
  });
  it("RATE_CAP(260) 에서 평평 — 고SPD 는 캡", () => {
    expect(actionRate(500)).toBe(RATE_CAP);
    expect(actionRate(10000)).toBe(RATE_CAP);
  });
  it("기준(spd 0)=100", () => {
    expect(actionRate(0)).toBeCloseTo(100, 5);
  });
  it("음수/NaN 방어 → spd 0 취급", () => {
    expect(actionRate(-50)).toBe(100);
    expect(actionRate(NaN)).toBe(100);
  });
});

describe("actionInterval — ~2배 천장(설계 핵심)", () => {
  it("interval 은 정수, SPD↑ 면 단조 감소(자주 행동)", () => {
    let prev = Infinity;
    for (const s of [20, 50, 120, 200, 292]) {
      const iv = actionInterval(s);
      expect(Number.isInteger(iv)).toBe(true);
      expect(iv).toBeLessThanOrEqual(prev);
      prev = iv;
    }
  });
  it("궁사(spd292) 는 탱크(spd20) 대비 ~2배 행동(1.8~2.1×)", () => {
    const ratio = actionInterval(20) / actionInterval(292);
    expect(ratio).toBeGreaterThanOrEqual(1.8);
    expect(ratio).toBeLessThanOrEqual(2.1);
  });
});

describe("effectiveMonsterSpd — 원시 1~14 → 플레이어 스케일", () => {
  it("spd1→16, spd14→94 (역할 밴드)", () => {
    expect(effectiveMonsterSpd(1)).toBe(16);
    expect(effectiveMonsterSpd(14)).toBe(94);
    expect(effectiveMonsterSpd(6)).toBe(46); // 중앙
  });
  it("깊이 보정 가산(음수 무시)", () => {
    expect(effectiveMonsterSpd(6, 10)).toBe(56);
    expect(effectiveMonsterSpd(6, -10)).toBe(46); // 음수 보정 무시
  });
});

describe("depthSpdCorrection — 깊이별 몬스터 SPD 가산(Phase 4, 약한 보정+cap)", () => {
  it("깊이 1 = 0(초반 균형 보존), 이후 선형(K=1.0)", () => {
    expect(depthSpdCorrection(1)).toBe(0);
    expect(depthSpdCorrection(7)).toBe(6);
    expect(depthSpdCorrection(11)).toBe(10);
  });
  it("DEPTH_CORR_MAX_DEPTH(12)에서 cap — endgame frontier 폭주 차단", () => {
    expect(depthSpdCorrection(12)).toBe(11);
    expect(depthSpdCorrection(24)).toBe(11); // capped
    expect(depthSpdCorrection(50)).toBe(11); // capped
  });
  it("단조 비감소", () => {
    let prev = -1;
    for (const d of [1, 4, 7, 11, 12, 24, 50]) {
      const c = depthSpdCorrection(d);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });
  it("손상 입력 방어(<1 → 0)", () => {
    expect(depthSpdCorrection(0)).toBe(0);
    expect(depthSpdCorrection(NaN)).toBe(0);
  });
});

describe("타임라인 큐 — 결정론 순서", () => {
  it("tieRank: player(0) < enemy(1)", () => {
    expect(tieRank("player")).toBe(0);
    expect(tieRank("enemy")).toBe(1);
  });
  it("nextActor1v1: nextTick 작은 쪽, 동점이면 player", () => {
    expect(nextActor1v1(40, 80)).toBe("player");
    expect(nextActor1v1(80, 40)).toBe("enemy");
    expect(nextActor1v1(50, 50)).toBe("player"); // 동점 → player
  });
  it("pickNextEntry: (nextTick, tieRank, sequenceNo) 사전식 최소", () => {
    const q: TimelineEntry[] = [
      { actor: "enemy", nextTick: 100, sequenceNo: 2 },
      { actor: "player", nextTick: 100, sequenceNo: 5 }, // 동점 nextTick → player 우선
      { actor: "enemy", nextTick: 90, sequenceNo: 1 }, // 더 빠름 → 이게 최소
    ];
    expect(pickNextEntry(q)?.sequenceNo).toBe(1);
    // 90짜리 제거하면 동점 100 에서 player 우선.
    expect(pickNextEntry(q.slice(0, 2))?.actor).toBe("player");
  });
  it("빈 큐 → null", () => {
    expect(pickNextEntry([])).toBeNull();
  });
});
