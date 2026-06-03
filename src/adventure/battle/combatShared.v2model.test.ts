import { describe, it, expect, afterEach, vi } from "vitest";
import {
  rollV2BasicDamage,
  setV2BattleModel,
  isV2BattleModelEnabled,
  setRatioDef,
  v2HitChancePct,
  setV2HitParams,
  v2MultiHitFalloff,
  V2_DAMAGE_FLOOR_PCT_CAP,
} from "./combatShared";
import { derivePlayerCombatV2Pure } from "@/lib/server/derivePlayerCombatV2";

// SIM-핸드오프 §B 통합 전투 모델 — 평타 데미지 헬퍼 + derive damageFloorPct.
// 플래그는 모듈 전역이라 매 테스트 후 OFF 로 복구 (다른 스위트로 누설 방지).
describe("§B 통합 평타 데미지 (rollV2BasicDamage)", () => {
  afterEach(() => {
    setV2BattleModel(false);
    setRatioDef(null);
    setV2HitParams(1, 0);
    vi.restoreAllMocks();
  });

  it("기본 OFF — 천장(atk−def) 결정론, variance 없음", () => {
    expect(isV2BattleModelEnabled()).toBe(false);
    expect(rollV2BasicDamage({ atk: 100, def: 30, floorPct: 0.3 })).toBe(70);
    expect(rollV2BasicDamage({ atk: 100, def: 30, floorPct: 0.9 })).toBe(70);
  });

  it("OFF — elementMult 은 천장에 곱(정수 내림)", () => {
    // 천장 70 × 1.15(우위) = 80.5 → 80
    expect(
      rollV2BasicDamage({ atk: 100, def: 30, floorPct: 0.3, elementMult: 1.15 }),
    ).toBe(80);
    // 천장 70 × 0.85(열세) = 59.5 → 59
    expect(
      rollV2BasicDamage({ atk: 100, def: 30, floorPct: 0.3, elementMult: 0.85 }),
    ).toBe(59);
  });

  it("ON — uniform(바닥, 천장): 천장100·바닥30, random 0→바닥, ~1→천장", () => {
    setV2BattleModel(true);
    vi.spyOn(Math, "random").mockReturnValue(0); // 바닥
    expect(rollV2BasicDamage({ atk: 100, def: 0, floorPct: 0.3 })).toBe(30);
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 중간 30+0.5×70=65
    expect(rollV2BasicDamage({ atk: 100, def: 0, floorPct: 0.3 })).toBe(65);
    vi.spyOn(Math, "random").mockReturnValue(0.999); // 거의 천장
    expect(rollV2BasicDamage({ atk: 100, def: 0, floorPct: 0.3 })).toBe(99);
  });

  it("ON — floorPct 캡 0.9 (초과 클램프)", () => {
    setV2BattleModel(true);
    vi.spyOn(Math, "random").mockReturnValue(0); // 바닥 = 천장×0.9
    expect(rollV2BasicDamage({ atk: 100, def: 0, floorPct: 2.0 })).toBe(90);
    expect(V2_DAMAGE_FLOOR_PCT_CAP).toBe(0.9);
  });

  it("천장·결과 최소 1 (고방어)", () => {
    setV2BattleModel(true);
    vi.spyOn(Math, "random").mockReturnValue(0);
    // atk5 def100 → 천장 max(1,−95)=1, 바닥 0.3, floor(0.3)=0 → max(1,0)=1
    expect(rollV2BasicDamage({ atk: 5, def: 100, floorPct: 0.3 })).toBe(1);
  });

  it("비율경감(setRatioDef) — 천장 = atk×C/(C+def), 절벽 없음", () => {
    setRatioDef(100);
    // OFF(variance 안 켬)면 천장 그대로 반환. atk43·def45 → 43×100/145 = 29.7 → round 30 (빼기였으면 1).
    expect(rollV2BasicDamage({ atk: 43, def: 45, floorPct: 0 })).toBe(30);
    // atk79·def45 → 79×100/145 = 54.5 → 54 (def 가 % 로 깎되 무력화 안 됨).
    expect(rollV2BasicDamage({ atk: 79, def: 45, floorPct: 0 })).toBe(54);
    // C 낮추면 def 강해짐: C=60 → 43×60/105 = 24.6 → 25.
    setRatioDef(60);
    expect(rollV2BasicDamage({ atk: 43, def: 45, floorPct: 0 })).toBe(25);
  });

  it("명중 비율식(v2HitChancePct) — k=1,C=0: acc/(acc+eva), clamp 10~95", () => {
    expect(v2HitChancePct(50, 50)).toBe(50); // 동률 → 50%
    expect(v2HitChancePct(0, 0)).toBe(95); // 둘다 0 → 최대
    expect(v2HitChancePct(10, 90)).toBe(10); // 10/100=10% (바닥 clamp)
    expect(v2HitChancePct(90, 10)).toBe(90); // 90/100=90%
    expect(v2HitChancePct(100, 0)).toBe(95); // 100/100=100 → 캡 95
  });

  it("명중 C↑ — 명중 바닥 상향(회피 약화)", () => {
    setV2HitParams(1, 50); // C=50
    // acc10·eva90 → (10+50)/(10+90+50)=60/150=40% (C=0이면 10%였음)
    expect(v2HitChancePct(10, 90)).toBe(40);
  });

  it("다단감쇠(v2MultiHitFalloff) — 1타 1.0·2타 0.5·3타+ 0.3", () => {
    expect(v2MultiHitFalloff(0)).toBe(1); // 본타
    expect(v2MultiHitFalloff(1)).toBe(0.5); // 2타
    expect(v2MultiHitFalloff(2)).toBe(0.3); // 3타
    expect(v2MultiHitFalloff(5)).toBe(0.3); // 4타+ = 0.3 유지
  });

  it("ON + 속성 열세 — roll 후 ×elementMult", () => {
    setV2BattleModel(true);
    vi.spyOn(Math, "random").mockReturnValue(0); // 바닥 30
    // 30 × 0.85 = 25.5 → 25
    expect(
      rollV2BasicDamage({ atk: 100, def: 0, floorPct: 0.3, elementMult: 0.85 }),
    ).toBe(25);
  });
});

describe("derive damageFloorPct (§D 시드)", () => {
  it("min(0.9, 0.3 + 0.0015×(str + 0.5·int + 0.3·vit)) 정확", () => {
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 200, dex: 10, vit: 80, int: 30, spi: 10, luk: 30 },
    });
    const s = d.totalStats;
    const expected = Math.min(
      0.9,
      0.3 + 0.0015 * (s.str + 0.5 * s.int + 0.3 * s.vit),
    );
    expect(d.player.damageFloorPct).toBeCloseTo(expected, 6);
  });

  it("고스탯 빌드는 캡 0.9 에 바인딩", () => {
    const d = derivePlayerCombatV2Pure({
      level: 100,
      allocatedStats: { str: 500, dex: 0, vit: 0, int: 0, spi: 0, luk: 0 },
    });
    expect(d.player.damageFloorPct).toBe(0.9);
  });
});
