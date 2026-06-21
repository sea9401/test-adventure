import { describe, it, expect } from "vitest";
import { OUTPOSTS } from "./outposts";
import {
  outpostDefensePower,
  OUTPOST_DEFENSE_CENTER,
  OUTPOST_DEFENSE_EDGE,
  OUTPOST_DEFENSE_BY_TIER,
} from "./outpostDefense";

// id 기반 lookup — 표시 이름은 콘텐츠 리네이밍으로 바뀔 수 있다.
const byId = (id: string) => OUTPOSTS.find((o) => o.id === id)!;

describe("outpostDefensePower", () => {
  it("tier 4 거점은 최대 수비 전투력(CENTER)", () => {
    const t4 = OUTPOSTS.filter((o) => o.tier === 4);
    expect(t4.length).toBe(5);
    for (const k of t4) {
      expect(outpostDefensePower(k)).toBe(OUTPOST_DEFENSE_CENTER);
    }
  });

  it("절대 중립 거점은 0 (게이트 없음)", () => {
    for (const n of OUTPOSTS.filter((o) => o.neutral)) {
      expect(outpostDefensePower(n)).toBe(0);
    }
  });

  it("중앙 분쟁지대 거점은 0 (기존 산적 난이도 유지)", () => {
    expect(outpostDefensePower(byId("war_central_fort"))).toBe(0);
    expect(outpostDefensePower(byId("outpost_plain_square"))).toBe(0);
  });

  it("외곽 쟁탈 거점(분쟁 반경 밖)은 tier 게이트 적용", () => {
    // 발마르·알토렌은 쟁탈풀이지만 중앙 800반경 밖이라 0 면제 아님 — tier2 정적값.
    expect(outpostDefensePower(byId("outpost_plain_fort"))).toBe(
      OUTPOST_DEFENSE_BY_TIER[2],
    );
    expect(outpostDefensePower(byId("outpost_plain_tower"))).toBe(
      OUTPOST_DEFENSE_BY_TIER[2],
    );
  });

  it("게이트 있는 거점은 tier 정적값 — 위치 무관, 같은 tier 동일", () => {
    // 옛 왕국거리 모델 폐기: 같은 tier 거점은 좌표와 무관하게 같은 수비값.
    for (const o of OUTPOSTS) {
      if (o.neutral) continue;
      const v = outpostDefensePower(o);
      if (v === 0) continue; // 분쟁지대 면제
      expect(v).toBe(OUTPOST_DEFENSE_BY_TIER[o.tier]);
    }
  });

  it("tier 가 높을수록 수비값이 크다 (단조 증가)", () => {
    expect(OUTPOST_DEFENSE_BY_TIER[1]).toBe(OUTPOST_DEFENSE_EDGE);
    expect(OUTPOST_DEFENSE_BY_TIER[4]).toBe(OUTPOST_DEFENSE_CENTER);
    expect(OUTPOST_DEFENSE_BY_TIER[1]).toBeLessThan(OUTPOST_DEFENSE_BY_TIER[2]);
    expect(OUTPOST_DEFENSE_BY_TIER[2]).toBeLessThan(OUTPOST_DEFENSE_BY_TIER[3]);
    expect(OUTPOST_DEFENSE_BY_TIER[3]).toBeLessThan(OUTPOST_DEFENSE_BY_TIER[4]);
  });

  it("모든 거점 수비 전투력은 0 또는 [EDGE, CENTER] 범위", () => {
    for (const o of OUTPOSTS) {
      const v = outpostDefensePower(o);
      expect(
        v === 0 || (v >= OUTPOST_DEFENSE_EDGE && v <= OUTPOST_DEFENSE_CENTER),
      ).toBe(true);
    }
  });
});
