import { describe, expect, it } from "vitest";
import {
  getRuneMagnitude,
  isWellFormedRuneSlot,
  type RuneGrade,
  type RuneId,
} from "./runes";

describe("isWellFormedRuneSlot — carry-through 보존 규칙", () => {
  it("정의된 룬 슬롯은 통과", () => {
    expect(isWellFormedRuneSlot({ id: "rune_attack", grade: 5 })).toBe(true);
  });

  it("미인식 id 라도 모양만 멀쩡하면 통과(carry-through)", () => {
    expect(isWellFormedRuneSlot({ id: "rune_future_unknown", grade: 3 })).toBe(
      true,
    );
  });

  it("미래 등급(현재 정의 밖)이라도 모양만 멀쩡하면 통과", () => {
    expect(isWellFormedRuneSlot({ id: "rune_attack", grade: 7 })).toBe(true);
  });

  it("진짜 손상은 거른다 — null/비객체/빈 id/음수·0·비정수 grade", () => {
    expect(isWellFormedRuneSlot(null)).toBe(false);
    expect(isWellFormedRuneSlot(undefined)).toBe(false);
    expect(isWellFormedRuneSlot(42)).toBe(false);
    expect(isWellFormedRuneSlot({ id: "", grade: 1 })).toBe(false);
    expect(isWellFormedRuneSlot({ id: "rune_attack" })).toBe(false);
    expect(isWellFormedRuneSlot({ id: "rune_attack", grade: 0 })).toBe(false);
    expect(isWellFormedRuneSlot({ id: "rune_attack", grade: -1 })).toBe(false);
    expect(isWellFormedRuneSlot({ id: "rune_attack", grade: 1.5 })).toBe(false);
    expect(isWellFormedRuneSlot({ id: 1, grade: 1 })).toBe(false);
  });
});

describe("getRuneMagnitude — 미인식 입력 NaN 방지", () => {
  it("정의된 id+grade 는 magnitude 그대로", () => {
    expect(getRuneMagnitude("rune_attack", 5)).toBe(7);
  });

  it("미인식 grade 는 0 (NaN 아님)", () => {
    const v = getRuneMagnitude("rune_attack", 99 as RuneGrade);
    expect(v).toBe(0);
    expect(Number.isNaN(v)).toBe(false);
  });

  it("미인식 id 는 0 (NaN/throw 아님)", () => {
    const v = getRuneMagnitude("rune_future_unknown" as RuneId, 5);
    expect(v).toBe(0);
  });
});
