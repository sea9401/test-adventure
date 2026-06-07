import { describe, it, expect, vi, afterEach } from "vitest";
import {
  applyExpGain,
  applyNewbieBonus,
  applyNewbieExpBonusByBattles,
  EARLY_LEVEL_EXP_FACTOR,
  getLevelTable,
  isNewbieBonusActiveByBattles,
  levelBandExpMultiplier,
  MAX_LEVEL,
  NEWBIE_BONUS_BATTLE_THRESHOLD,
  requiredExpToNext,
} from "./leveling";

describe("requiredExpToNext", () => {
  it("Lv1→2는 30 (1차 가속 ×0.25, 옛 120)", () => {
    expect(requiredExpToNext(1)).toBe(Math.floor(120 * EARLY_LEVEL_EXP_FACTOR));
  });

  it("레벨이 오르면 단조 증가", () => {
    for (let lv = 1; lv < MAX_LEVEL - 1; lv += 1) {
      expect(requiredExpToNext(lv)!).toBeLessThanOrEqual(
        requiredExpToNext(lv + 1)!,
      );
    }
  });

  it("만렙은 null", () => {
    expect(requiredExpToNext(MAX_LEVEL)).toBeNull();
  });

  it("0 이하는 null", () => {
    expect(requiredExpToNext(0)).toBeNull();
    expect(requiredExpToNext(-1)).toBeNull();
  });

  it("엔드게임 multiplier 구간 경계 — Lv60 ×1.00 / Lv70 ×1.05 / Lv90+ ×1.15(캡) + 35+ 완화 ×0.85", () => {
    // 50 이상은 reduction floor 0.85 풀반영. endgame multiplier(60→89 1.00→1.15 선형, 90+ 1.15 캡)가 위에 곱해진다.
    const base = (lv: number) => (120 / 35) * Math.pow(lv, 2.5);
    expect(requiredExpToNext(60)).toBe(Math.floor(base(60) * 1.0 * 0.85));
    expect(requiredExpToNext(70)).toBe(Math.floor(base(70) * 1.05 * 0.85));
    expect(requiredExpToNext(90)).toBe(Math.floor(base(90) * 1.15 * 0.85));
  });

  it("35~49 reduction 램프 — 35 ×1.00 / 50 ×0.85 / 사이 선형 (전 구간 1차 ×0.25 가속)", () => {
    const base = (lv: number) => (120 / 35) * Math.pow(lv, 2.5);
    const E = EARLY_LEVEL_EXP_FACTOR; // L1~50 가속(0.25)
    // 35 경계는 reduction 1.0 — 35^1.5 기준 lower 곡선과 자연 연속.
    expect(requiredExpToNext(35)).toBe(Math.floor(base(35) * 1.0 * E));
    // 50 부터 floor 0.85 도달.
    expect(requiredExpToNext(50)).toBe(Math.floor(base(50) * 0.85 * E));
    // 중간 — 1.00 → 0.85 선형. lv42 (절반) 시 ~0.925.
    const mult42 = 1 - 0.15 * ((42 - 35) / 15);
    expect(requiredExpToNext(42)).toBe(Math.floor(base(42) * mult42 * E));
  });
});

describe("MAX_LEVEL", () => {
  it("만렙은 100", () => {
    expect(MAX_LEVEL).toBe(100);
  });
});

describe("applyNewbieBonus (정밀 ×2)", () => {
  it("Lv30 미만은 EXP ×2 + 플래그", () => {
    expect(applyNewbieBonus(100, 1)).toEqual({ gained: 200, bonusApplied: true });
    expect(applyNewbieBonus(100, 29)).toEqual({
      gained: 200,
      bonusApplied: true,
    });
  });
  it("Lv30 이상은 무변화", () => {
    expect(applyNewbieBonus(100, 30)).toEqual({
      gained: 100,
      bonusApplied: false,
    });
    expect(applyNewbieBonus(100, 99)).toEqual({
      gained: 100,
      bonusApplied: false,
    });
  });
});

describe("v2 신참 보너스 (전적 기준, EXP 전용)", () => {
  it("임계치(3만)는 30000", () => {
    expect(NEWBIE_BONUS_BATTLE_THRESHOLD).toBe(30000);
  });
  it("전적 ≤ 3만이면 활성, 초과면 비활성 (경계 포함)", () => {
    expect(isNewbieBonusActiveByBattles(0)).toBe(true);
    expect(isNewbieBonusActiveByBattles(29999)).toBe(true);
    expect(isNewbieBonusActiveByBattles(30000)).toBe(true);
    expect(isNewbieBonusActiveByBattles(30001)).toBe(false);
  });
  it("전적 ≤ 3만은 EXP ×2 + 플래그", () => {
    expect(applyNewbieExpBonusByBattles(100, 0)).toEqual({
      gained: 200,
      bonusApplied: true,
    });
    expect(applyNewbieExpBonusByBattles(100, 30000)).toEqual({
      gained: 200,
      bonusApplied: true,
    });
  });
  it("전적 3만 초과는 무변화", () => {
    expect(applyNewbieExpBonusByBattles(100, 30001)).toEqual({
      gained: 100,
      bonusApplied: false,
    });
  });
  it("exp 0 이하는 보너스 미적용", () => {
    expect(applyNewbieExpBonusByBattles(0, 0)).toEqual({
      gained: 0,
      bonusApplied: false,
    });
  });
});

describe("levelBandExpMultiplier (EXP 페이싱 개편)", () => {
  it("밴드 경계값 — L1-29 ×1.5(초반 가속) / 30-49 ×1.1 / 50-69 ×1.25 / 70-89 ×1.45 / 90+ ×1.55", () => {
    expect(levelBandExpMultiplier(1)).toBe(1.5);
    expect(levelBandExpMultiplier(29)).toBe(1.5);
    expect(levelBandExpMultiplier(30)).toBe(1.1);
    expect(levelBandExpMultiplier(49)).toBe(1.1);
    expect(levelBandExpMultiplier(50)).toBe(1.25);
    expect(levelBandExpMultiplier(69)).toBe(1.25);
    expect(levelBandExpMultiplier(70)).toBe(1.45);
    expect(levelBandExpMultiplier(89)).toBe(1.45);
    expect(levelBandExpMultiplier(90)).toBe(1.55);
    expect(levelBandExpMultiplier(100)).toBe(1.55);
  });
});

describe("엔드게임 세금 캡 1.15 (70→100 완화)", () => {
  const base = (lv: number) => (120 / 35) * Math.pow(lv, 2.5);

  it("L90+ 는 엔드게임 세금 캡 1.15 풀반영", () => {
    expect(requiredExpToNext(90)).toBe(Math.floor(base(90) * 1.15 * 0.85));
    expect(requiredExpToNext(99)).toBe(Math.floor(base(99) * 1.15 * 0.85));
  });

  it("막판 벽 완화 — L99 가 종전 곡선(×1.55)보다 작다", () => {
    const oldReq = Math.floor(base(99) * 1.55 * 0.85);
    expect(requiredExpToNext(99)!).toBeLessThan(oldReq);
  });

  it("90-99 도 단조 증가 유지(역전 없음)", () => {
    for (let lv = 90; lv < 99; lv += 1) {
      expect(requiredExpToNext(lv)!).toBeLessThanOrEqual(
        requiredExpToNext(lv + 1)!,
      );
    }
  });

  it("전체 1→100 누적 요구치 회귀 고정 (엔드게임 세금 1.15 캡 + 1차 L1~50 ×0.25 가속 반영)", () => {
    let sum = 0;
    for (let lv = 1; lv < MAX_LEVEL; lv += 1) sum += requiredExpToNext(lv)!;
    expect(sum).toBe(8_312_961);
  });
});

describe("applyExpGain", () => {
  it("임계치 미달이면 EXP만 누적", () => {
    // req(1)=30 (1차 ×0.25 가속) — 25 는 미달.
    const r = applyExpGain(1, 10, 15);
    expect(r).toEqual({ level: 1, exp: 25, levelsGained: 0, overflowExp: 0 });
  });

  it("임계치 정확히 도달하면 1 레벨업, 잉여 0", () => {
    const r = applyExpGain(1, 0, 30); // req(1)=30
    expect(r).toEqual({ level: 2, exp: 0, levelsGained: 1, overflowExp: 0 });
  });

  it("한 번에 여러 레벨도 처리", () => {
    // 1차 ×0.25 가속: req(1)=30, req(2)=84, req(3)=155, req(4)=240 → 500 으로 3레벨업.
    const r = applyExpGain(1, 0, 500);
    expect(r.level).toBe(4);
    expect(r.levelsGained).toBe(3);
    expect(r.exp).toBe(500 - 30 - 84 - 155);
    expect(r.overflowExp).toBe(0);
  });

  it("만렙 도달 시 잉여 EXP는 overflowExp 로 분리, exp 는 0으로 캡", () => {
    const r = applyExpGain(MAX_LEVEL, 0, 999_999);
    expect(r.level).toBe(MAX_LEVEL);
    expect(r.exp).toBe(0);
    expect(r.overflowExp).toBe(999_999);
  });

  it("만렙 도달하는 호출은 잔여 EXP 가 overflow 로", () => {
    // Lv 99 에서 99→100 비용을 5000 초과로 받으면 5000 이 overflow.
    const need99 = requiredExpToNext(99)!;
    const r = applyExpGain(99, 0, need99 + 5000);
    expect(r.level).toBe(MAX_LEVEL);
    expect(r.exp).toBe(0);
    expect(r.overflowExp).toBe(5000);
  });

  it("음수 gain은 0으로 클램프", () => {
    const r = applyExpGain(2, 50, -100);
    expect(r).toEqual({ level: 2, exp: 0, levelsGained: 0, overflowExp: 0 });
  });

  it("maxLevel(차수캡) 도달 시 그 레벨서 정지, 잉여는 overflow (v2 환생)", () => {
    // 차수1 캡 50 — 대량 exp 줘도 Lv50 에서 멈추고 잉여 버림(overflow).
    const r = applyExpGain(1, 0, 999_999_999, 50);
    expect(r.level).toBe(50);
    expect(r.exp).toBe(0);
    expect(r.overflowExp).toBeGreaterThan(0);
  });

  it("maxLevel 미지정 = 만렙 100 기본 (하위호환)", () => {
    expect(applyExpGain(1, 0, 500)).toEqual(applyExpGain(1, 0, 500, MAX_LEVEL));
  });
});

describe("getLevelTable", () => {
  it("MAX_LEVEL - 1 줄을 반환하고 누적은 단조 증가", () => {
    const rows = getLevelTable();
    expect(rows.length).toBe(MAX_LEVEL - 1);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].cumulative).toBeGreaterThan(rows[i - 1].cumulative);
    }
  });
});

describe("XP_RATE_MULT (staging 기본값 + override)", () => {
  // XP_RATE_MULT 은 모듈 로드 시 env 로 파싱되는 const → resetModules + 동적 import 로 재평가.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadXpRate(): Promise<number> {
    vi.resetModules();
    return (await import("./leveling")).XP_RATE_MULT;
  }

  it("env 미설정 + 라이브(IS_STAGING≠true) → 1.0", async () => {
    vi.stubEnv("NEXT_PUBLIC_XP_RATE_MULT", "");
    vi.stubEnv("IS_STAGING", "");
    expect(await loadXpRate()).toBe(1);
  });

  it("env 미설정 + staging(IS_STAGING=true) → 2.2 자동", async () => {
    vi.stubEnv("NEXT_PUBLIC_XP_RATE_MULT", "");
    vi.stubEnv("IS_STAGING", "true");
    expect(await loadXpRate()).toBe(2.2);
  });

  it("NEXT_PUBLIC_XP_RATE_MULT 명시 → staging 이어도 명시값 우선 + 클램프", async () => {
    vi.stubEnv("NEXT_PUBLIC_XP_RATE_MULT", "1.5");
    vi.stubEnv("IS_STAGING", "true");
    expect(await loadXpRate()).toBe(1.5);
    vi.stubEnv("NEXT_PUBLIC_XP_RATE_MULT", "999"); // [0.1,100] 클램프
    vi.stubEnv("IS_STAGING", "true");
    expect(await loadXpRate()).toBe(100);
  });
});
