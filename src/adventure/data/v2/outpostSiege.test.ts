import { describe, it, expect } from "vitest";
import {
  FORT_MAX_HP,
  SIEGE_DAMAGE_PER_WIN,
  FORT_REGEN_PER_HOUR,
  REPAIR_GOLD_PER_HP,
  currentFortHp,
  isOutpostProtected,
  repairHpFromGold,
  siegeWinsToFall,
} from "./outpostSiege";

describe("currentFortHp (성벽 lazy 재생)", () => {
  const t0 = new Date("2026-06-08T00:00:00.000Z");

  it("경과 0 이면 그대로", () => {
    expect(currentFortHp(60, 100, t0, t0)).toBe(60);
  });

  it("시간당 FORT_REGEN_PER_HOUR 만큼 재생", () => {
    const t2h = new Date(t0.getTime() + 2 * 3_600_000);
    expect(currentFortHp(60, 100, t0, t2h)).toBe(60 + FORT_REGEN_PER_HOUR * 2);
  });

  it("상한(fortMaxHp) 으로 클램프", () => {
    const t100h = new Date(t0.getTime() + 100 * 3_600_000);
    expect(currentFortHp(60, 100, t0, t100h)).toBe(100);
  });

  it("음수 경과(clock skew)는 증가만 — 0 경과로 처리", () => {
    const tPast = new Date(t0.getTime() - 3_600_000);
    expect(currentFortHp(60, 100, t0, tPast)).toBe(60);
  });
});

describe("isOutpostProtected (보호막)", () => {
  const now = new Date("2026-06-08T00:00:00.000Z");
  it("protectedUntil 미래면 보호중", () => {
    expect(isOutpostProtected(new Date(now.getTime() + 1000), now)).toBe(true);
  });
  it("과거/현재면 해제", () => {
    expect(isOutpostProtected(new Date(now.getTime() - 1), now)).toBe(false);
    expect(isOutpostProtected(now, now)).toBe(false);
  });
});

describe("repairHpFromGold (길드 금고 자동 수리)", () => {
  it("결손/금고 0 이면 0", () => {
    expect(repairHpFromGold(0, 10000)).toBe(0);
    expect(repairHpFromGold(40, 0)).toBe(0);
  });
  it("금고가 충분하면 결손분 전부", () => {
    expect(repairHpFromGold(40, 40 * REPAIR_GOLD_PER_HP)).toBe(40);
    expect(repairHpFromGold(5, 100000)).toBe(5);
  });
  it("금고가 한도면 살 수 있는 만큼만(내림)", () => {
    // 금고 = 9.5 HP 어치 → 9 HP.
    expect(repairHpFromGold(40, Math.floor(9.5 * REPAIR_GOLD_PER_HP))).toBe(9);
  });
});

describe("다이얼 sanity", () => {
  it("함락까지 ≈ 5승 (FORT_MAX_HP / SIEGE_DAMAGE_PER_WIN)", () => {
    expect(Math.ceil(FORT_MAX_HP / SIEGE_DAMAGE_PER_WIN)).toBe(5);
  });
});

describe("siegeWinsToFall (함락까지 승수 표기)", () => {
  it("경계 — 정확히 나누어떨어지면 그 몫", () => {
    expect(siegeWinsToFall(SIEGE_DAMAGE_PER_WIN * 3)).toBe(3);
    expect(siegeWinsToFall(FORT_MAX_HP)).toBe(5);
  });
  it("나머지가 있으면 올림", () => {
    expect(siegeWinsToFall(SIEGE_DAMAGE_PER_WIN * 2 + 1)).toBe(3);
  });
  it("0 이하라도 최소 1승 (이미 함락 직전 표기 안정)", () => {
    expect(siegeWinsToFall(0)).toBe(1);
    expect(siegeWinsToFall(1)).toBe(1);
  });
});
