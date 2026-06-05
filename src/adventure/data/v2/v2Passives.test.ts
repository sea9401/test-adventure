import { describe, it, expect } from "vitest";
import {
  V2_CLASS_PASSIVE,
  resolveClassPassive,
  classPassiveTierText,
} from "@/adventure/data/v2/v2Passives";

// P4 — 구 직업 패시브 은퇴(계파 패시브로 대체). 시스템이 inert 임을 보증.
describe("v2Passives — P4 은퇴", () => {
  it("V2_CLASS_PASSIVE 는 비어 있다(테이블 제거)", () => {
    expect(Object.keys(V2_CLASS_PASSIVE)).toHaveLength(0);
  });

  it("resolveClassPassive 는 어떤 입력에도 null", () => {
    expect(resolveClassPassive(null, [])).toBeNull();
    expect(resolveClassPassive("warrior", ["v2_skill_strike"])).toBeNull();
    expect(resolveClassPassive("mage", [])).toBeNull();
    expect(resolveClassPassive("none", [])).toBeNull();
  });

  it("classPassiveTierText 는 빈 문자열", () => {
    expect(classPassiveTierText("warrior", 1)).toBe("");
    expect(classPassiveTierText("none", 1)).toBe("");
  });
});
