import { describe, it, expect } from "vitest";
import {
  parseProficiency,
  emptyProficiency,
  totalEarned,
  groupEarned,
  groupUsable,
  addEarned,
} from "./proficiency";

describe("v2 직업 숙련도", () => {
  it("parse — 손상/빈 입력은 빈 상태", () => {
    expect(parseProficiency(null)).toEqual(emptyProficiency());
    expect(parseProficiency("x")).toEqual(emptyProficiency());
    expect(parseProficiency({ groups: "bad" })).toEqual(emptyProficiency());
    expect(parseProficiency(undefined)).toEqual(emptyProficiency());
  });

  it("parse — earned>0 그룹만, 음수/비수 0, spent≤earned 클램프", () => {
    const p = parseProficiency({
      groups: {
        swordsman: { earned: 100, spent: 30 },
        archer: { earned: -5, spent: 2 }, // earned 음수→0 → 제외
        mage: { earned: 50, spent: 200 }, // spent>earned → 50 클램프
        bad: { earned: "x", spent: 1 }, // 비수 → 제외
      },
    });
    expect(p.groups.swordsman).toEqual({ earned: 100, spent: 30 });
    expect(p.groups.archer).toBeUndefined();
    expect(p.groups.mage).toEqual({ earned: 50, spent: 50 });
    expect(p.groups.bad).toBeUndefined();
  });

  it("총/직업/사용가능", () => {
    const p = parseProficiency({
      groups: {
        swordsman: { earned: 100, spent: 30 },
        archer: { earned: 40, spent: 0 },
      },
    });
    expect(totalEarned(p)).toBe(140);
    expect(groupEarned(p, "swordsman")).toBe(100);
    expect(groupUsable(p, "swordsman")).toBe(70);
    expect(groupUsable(p, "archer")).toBe(40);
    expect(groupUsable(p, "none")).toBe(0);
  });

  it("addEarned — 비파괴, none/0 은 무변경(동일 참조)", () => {
    const p0 = emptyProficiency();
    const p1 = addEarned(p0, "swordsman", 2);
    expect(p1.groups.swordsman).toEqual({ earned: 2, spent: 0 });
    expect(p0.groups.swordsman).toBeUndefined(); // 원본 비파괴
    const p2 = addEarned(p1, "swordsman", 3);
    expect(p2.groups.swordsman.earned).toBe(5);
    expect(addEarned(p1, "none", 5)).toBe(p1); // none 무변경
    expect(addEarned(p1, "swordsman", 0)).toBe(p1); // 0 무변경
  });
});
