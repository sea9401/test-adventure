// ATB 타임라인 순수 헬퍼 — 단위테스트. 구간별 속도 점감·동점 player 우선·몬스터 매핑.
import { describe, it, expect } from "vitest";
import {
  RATE_CAP,
  actionRate,
  actionInterval,
  effectiveMonsterSpd,
  monsterActionSpd,
  depthSpdCorrection,
  tieRank,
  pickNextEntry,
  nextActor1v1,
  type TimelineEntry,
} from "./combatTimeline";

describe("actionRate — 구간별 점감 곡선", () => {
  it("SPD↑ 면 rate 단조 증가", () => {
    let prev = -1;
    for (const s of [0, 20, 50, 100, 200, 400, 800, 1_000, 2_000, 20_000]) {
      const r = actionRate(s);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
  });
  it("속도 20,000에서 기술적 안전 상한에 도달한다", () => {
    expect(actionRate(19_999)).toBeLessThan(RATE_CAP);
    expect(actionRate(20_000)).toBe(RATE_CAP);
    expect(actionRate(200_000)).toBe(RATE_CAP);
  });
  it("속도 100을 행동률 100의 기준점으로 삼는다", () => {
    expect(actionRate(100)).toBeCloseTo(100, 10);
    expect(actionInterval(100)).toBe(100);
  });
  it("음수/NaN/0 → spd 1 바닥 취급(동일·양수)", () => {
    const floor = actionRate(1);
    expect(actionRate(0)).toBe(floor);
    expect(actionRate(-50)).toBe(floor);
    expect(actionRate(NaN)).toBe(floor);
    expect(floor).toBeGreaterThan(0);
  });
});

describe("actionInterval — 완만한 고속 성장 곡선", () => {
  it("interval 은 정수, SPD↑ 면 단조 감소(자주 행동)", () => {
    let prev = Infinity;
    for (const s of [20, 50, 100, 200, 400, 800, 1_000, 2_000, 20_000]) {
      const iv = actionInterval(s);
      expect(Number.isInteger(iv)).toBe(true);
      expect(iv).toBeLessThanOrEqual(prev);
      prev = iv;
    }
  });
  it("속도 1000은 속도 100보다 약 4.5~5배 자주 행동한다", () => {
    const ratio = actionInterval(100) / actionInterval(1_000);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThanOrEqual(5);
  });

  it("대표 속도 구간의 행동 간격을 보장한다", () => {
    expect(actionInterval(64)).toBe(125);
    expect(actionInterval(200)).toBe(63);
    expect(actionInterval(400)).toBe(39);
    expect(actionInterval(800)).toBe(25);
    expect(actionRate(1_000)).toBeCloseTo(480, 10);
    expect(actionInterval(1_000)).toBe(21);
    expect(actionInterval(2_000)).toBe(18);
    expect(actionInterval(4_000)).toBe(15);
    expect(actionInterval(10_000)).toBe(12);
  });

  it("속도 20,000부터 10틱으로 고정해 3,000틱 기본 행동을 301개로 제한한다", () => {
    expect(actionInterval(20_000)).toBe(10);
    expect(actionInterval(200_000)).toBe(10);
    expect(Math.floor(3_000 / actionInterval(200_000)) + 1).toBe(301);
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

describe("monsterActionSpd — 몬스터별 속도 단위 선택", () => {
  it("일반 몬스터는 기존 원시 속도 변환을 유지한다", () => {
    expect(monsterActionSpd({ spd: 6 })).toBe(46);
  });

  it("직접 속도 몬스터는 데이터의 spd를 그대로 사용한다", () => {
    expect(monsterActionSpd({ spd: 244, directActionSpd: true })).toBe(244);
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
