import { describe, it, expect } from "vitest";
import {
  HP_RESTORE_MS,
  applyHpRegen,
  parseHpRegenSince,
} from "./hpRegen";

describe("hp 회복", () => {
  it("만피면 hp 그대로 + lastUpdatedAt 만 갱신", () => {
    const r = applyHpRegen(100, 100, 0, HP_RESTORE_MS * 2);
    expect(r.hp).toBe(100);
    expect(r.lastUpdatedAt).toBe(HP_RESTORE_MS * 2);
  });

  it("정확히 HP_RESTORE_MS 흐름 = 만피", () => {
    const r = applyHpRegen(0, 100, 0, HP_RESTORE_MS);
    expect(r.hp).toBe(100);
  });

  it("절반 흐름 = 절반 회복", () => {
    const r = applyHpRegen(0, 100, 0, HP_RESTORE_MS / 2);
    expect(r.hp).toBe(50);
  });

  it("hp + elapsed 합산", () => {
    const r = applyHpRegen(20, 100, 0, HP_RESTORE_MS / 2);
    expect(r.hp).toBe(70);
  });

  it("만피 초과 안 됨", () => {
    const r = applyHpRegen(80, 100, 0, HP_RESTORE_MS);
    expect(r.hp).toBe(100);
  });

  it("음수 hp 들어와도 0 이상 보장 (단 회복 결과)", () => {
    const r = applyHpRegen(-50, 100, 0, HP_RESTORE_MS / 2);
    // -50 + 50 = 0
    expect(r.hp).toBe(0);
  });

  it("maxHp 0 처리 — 1 로 clamp", () => {
    const r = applyHpRegen(0, 0, 0, HP_RESTORE_MS);
    expect(r.hp).toBe(1);
  });
});

describe("hpRegenSince 파싱", () => {
  it("숫자 그대로", () => {
    expect(parseHpRegenSince(12345, 0)).toBe(12345);
  });
  it("undefined / null / 문자열 → fallback", () => {
    expect(parseHpRegenSince(undefined, 999)).toBe(999);
    expect(parseHpRegenSince(null, 999)).toBe(999);
    expect(parseHpRegenSince("abc", 999)).toBe(999);
  });
  it("NaN / Infinity / 음수 → fallback", () => {
    expect(parseHpRegenSince(NaN, 999)).toBe(999);
    expect(parseHpRegenSince(Infinity, 999)).toBe(999);
    expect(parseHpRegenSince(-1, 999)).toBe(999);
  });
});
