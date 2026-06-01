import { describe, it, expect } from "vitest";
import {
  generateAntiqueInstanceId,
  normalizeAntiqueInstance,
  normalizeAntiqueInstances,
  type AntiqueInstance,
} from "./antiqueInstances";

const valid: AntiqueInstance = {
  instanceId: "a1",
  antiqueId: "celadon_vase",
  condition: 72,
  foundAt: 1000,
};

describe("normalizeAntiqueInstance", () => {
  it("유효 인스턴스 통과", () => {
    expect(normalizeAntiqueInstance({ ...valid })).toEqual(valid);
  });

  it("객체 아님 / instanceId 누락 → null", () => {
    expect(normalizeAntiqueInstance(null)).toBeNull();
    expect(normalizeAntiqueInstance("x")).toBeNull();
    expect(normalizeAntiqueInstance({ ...valid, instanceId: "" })).toBeNull();
    expect(normalizeAntiqueInstance({ ...valid, instanceId: "   " })).toBeNull();
    expect(normalizeAntiqueInstance({ ...valid, instanceId: 5 })).toBeNull();
  });

  it("알 수 없는 antiqueId → null (위조 가드)", () => {
    expect(normalizeAntiqueInstance({ ...valid, antiqueId: "fake" })).toBeNull();
  });

  it("보존상태 범위/정수 위반 → null", () => {
    expect(normalizeAntiqueInstance({ ...valid, condition: 4 })).toBeNull();
    expect(normalizeAntiqueInstance({ ...valid, condition: 101 })).toBeNull();
    expect(normalizeAntiqueInstance({ ...valid, condition: 50.5 })).toBeNull();
    expect(normalizeAntiqueInstance({ ...valid, condition: "72" })).toBeNull();
  });

  it("foundAt 누락/비정상 → 0", () => {
    const { foundAt: _omit, ...noFound } = valid;
    void _omit;
    expect(normalizeAntiqueInstance(noFound)?.foundAt).toBe(0);
    expect(normalizeAntiqueInstance({ ...valid, foundAt: "nope" })?.foundAt).toBe(0);
  });
});

describe("normalizeAntiqueInstances", () => {
  it("배열 아님 → 빈 배열", () => {
    expect(normalizeAntiqueInstances(null)).toEqual([]);
    expect(normalizeAntiqueInstances({})).toEqual([]);
  });

  it("유효만 통과 + instanceId 중복 제거", () => {
    const out = normalizeAntiqueInstances([
      { ...valid, instanceId: "a" },
      { ...valid, instanceId: "a" }, // dup
      { ...valid, instanceId: "b", antiqueId: "gold_coin" },
      { ...valid, instanceId: "c", condition: 999 }, // invalid
      "garbage",
    ]);
    expect(out.map((i) => i.instanceId)).toEqual(["a", "b"]);
  });
});

describe("generateAntiqueInstanceId", () => {
  it("비어있지 않은 문자열", () => {
    const id = generateAntiqueInstanceId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});
