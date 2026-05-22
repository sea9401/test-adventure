import { describe, it, expect } from "vitest";
import { sanitizeSavePayload } from "./saveSanitize";

describe("sanitizeSavePayload", () => {
  describe("NaN/Infinity 차단 (전 키 공통)", () => {
    it("최상위 NaN 거부", () => {
      const r = sanitizeSavePayload("character.v2", {
        level: 1,
        gold: NaN,
        exp: 0,
      });
      expect(r.ok).toBe(false);
    });

    it("최상위 Infinity 거부", () => {
      const r = sanitizeSavePayload("character.v2", {
        level: 1,
        gold: Infinity,
        exp: 0,
      });
      expect(r.ok).toBe(false);
    });

    it("중첩 객체 안의 NaN 거부", () => {
      const r = sanitizeSavePayload("inventory.v2", {
        materials: { "iron-ore": NaN },
      });
      expect(r.ok).toBe(false);
    });

    it("배열 안의 NaN 거부", () => {
      const r = sanitizeSavePayload("quest-progress.v2", {
        active: [{ id: "x", count: NaN }],
      });
      expect(r.ok).toBe(false);
    });

    it("정상 payload 통과", () => {
      const r = sanitizeSavePayload("character.v2", {
        level: 10,
        gold: 5000,
        exp: 1234,
        fame: 50,
        hp: 200,
      });
      expect(r.ok).toBe(true);
    });
  });

  describe("character.v2 절대값 가드", () => {
    it("음수 gold 거부", () => {
      const r = sanitizeSavePayload("character.v2", {
        level: 1,
        gold: -100,
        exp: 0,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("gold");
    });

    it("비현실 gold 거부", () => {
      const r = sanitizeSavePayload("character.v2", {
        level: 1,
        gold: 1e15,
        exp: 0,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("gold");
    });

    it("비정수 gold 거부 (소수)", () => {
      const r = sanitizeSavePayload("character.v2", {
        level: 1,
        gold: 100.5,
        exp: 0,
      });
      expect(r.ok).toBe(false);
    });

    it("level 0 거부 (최소 1)", () => {
      const r = sanitizeSavePayload("character.v2", {
        level: 0,
        gold: 0,
        exp: 0,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("level");
    });

    it("level 200 거부 (만렙 100 + 여유 10)", () => {
      const r = sanitizeSavePayload("character.v2", {
        level: 200,
        gold: 0,
        exp: 0,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("level");
    });

    it("optional 필드 미지정 통과 (fame/hp 없어도)", () => {
      const r = sanitizeSavePayload("character.v2", {
        level: 5,
        gold: 1000,
        exp: 100,
      });
      expect(r.ok).toBe(true);
    });

    it("만렙(110) 경계 통과", () => {
      const r = sanitizeSavePayload("character.v2", {
        level: 110,
        gold: 0,
        exp: 0,
      });
      expect(r.ok).toBe(true);
    });

    it("gold 상한(1e9) 경계 통과", () => {
      const r = sanitizeSavePayload("character.v2", {
        level: 1,
        gold: 1_000_000_000,
        exp: 0,
      });
      expect(r.ok).toBe(true);
    });
  });

  describe("character.v2 외 키는 NaN 검사만", () => {
    it("inventory.v2 거대 gold 같은 거 있어도 통과 (character.v2 가 아니므로)", () => {
      const r = sanitizeSavePayload("inventory.v2", {
        someKey: 1e15, // 거대해도 character 의 gold/exp 가 아니라 패스
      });
      expect(r.ok).toBe(true);
    });

    it("tower.v1 거대 floor 같은 거 있어도 패스 (이번 PR 스코프 밖)", () => {
      const r = sanitizeSavePayload("tower.v1", {
        floor: 99999,
      });
      expect(r.ok).toBe(true);
    });

    it("NaN 만 차단", () => {
      const r = sanitizeSavePayload("tower.v1", {
        floor: NaN,
      });
      expect(r.ok).toBe(false);
    });
  });

  describe("깊이 폭주 가드", () => {
    it("매우 깊은 중첩 거부", () => {
      let value: unknown = "leaf";
      for (let i = 0; i < 50; i++) {
        value = { nested: value };
      }
      const r = sanitizeSavePayload("inventory.v2", value);
      expect(r.ok).toBe(false);
    });
  });
});
