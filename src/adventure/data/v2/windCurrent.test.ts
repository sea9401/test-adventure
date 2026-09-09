import { describe, expect, it } from "vitest";
import { previewWindCurrent, finishWindCurrent, mergeWindCurrentSnapshot } from "./windCurrent";

describe("기류", () => {
  it("현재 주문은 생성 전 기류로 강화하고 적중 후 최대 3개까지 쌓는다", () => {
    const preview = previewWindCurrent(2, 20, {kind: "gather"});
    expect(preview.damageMultiplier).toBe(1.4);
    expect(finishWindCurrent(preview, true)).toEqual({current: 3, hastePct: 0});
    expect(finishWindCurrent(previewWindCurrent(3, 8, {kind:"gather"}), true).current).toBe(3);
  });
  it("폭풍은 시전 전 기류로 강화하고 적중할 때 전부 소비한다", () => {
    const preview = previewWindCurrent(3, 20, {kind:"release", damagePctPerStack:20, hastePctPerStack:15});
    expect(preview.damageMultiplier).toBe(2.2);
    expect(finishWindCurrent(preview, true)).toEqual({current:0, hastePct:45});
    expect(finishWindCurrent(preview, false)).toEqual({current:3, hastePct:0});
  });
  it("미적중·패시브 미장착·일반 주문은 기류를 생성하거나 소비하지 않는다", () => {
    expect(finishWindCurrent(previewWindCurrent(1, 8, {kind:"gather"}), false).current).toBe(1);
    expect(finishWindCurrent(previewWindCurrent(undefined, 0, {kind:"gather"}), true)).toEqual({current:undefined, hastePct:0});
    const ordinary = previewWindCurrent(3, 20, undefined);
    expect(ordinary.damageMultiplier).toBe(1);
    expect(finishWindCurrent(ordinary, true).current).toBe(3);
  });
  it("표시는 활성화된 전투에서만 최대치와 함께 제공한다", () => {
    expect(mergeWindCurrentSnapshot({impact:"1/3"}, undefined)).toEqual({impact:"1/3"});
    expect(mergeWindCurrentSnapshot({}, 2)).toEqual({windCurrent:"2/3"});
  });
});
