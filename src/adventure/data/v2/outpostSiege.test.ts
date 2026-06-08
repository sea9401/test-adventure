import { describe, it, expect } from "vitest";
import {
  FORT_MAX_HP,
  SIEGE_DAMAGE_PER_WIN,
  FORT_REGEN_PER_HOUR,
  currentFortHp,
  isOutpostProtected,
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

describe("다이얼 sanity", () => {
  it("함락까지 ≈ 5승 (FORT_MAX_HP / SIEGE_DAMAGE_PER_WIN)", () => {
    expect(Math.ceil(FORT_MAX_HP / SIEGE_DAMAGE_PER_WIN)).toBe(5);
  });
});
