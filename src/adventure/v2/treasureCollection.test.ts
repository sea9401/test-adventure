import { describe, it, expect } from "vitest";
import {
  addInstance,
  emptyTreasureCollection,
  parseTreasureCollection,
} from "./treasureCollection";
import type { AntiqueInstance } from "./antiqueInstances";

const inst = (instanceId: string, antiqueId = "gold_coin", condition = 60): AntiqueInstance => ({
  instanceId,
  antiqueId: antiqueId as AntiqueInstance["antiqueId"],
  condition,
  foundAt: 1,
});

describe("parseTreasureCollection", () => {
  it("손상 입력 → 빈 보관함", () => {
    expect(parseTreasureCollection(null)).toEqual(emptyTreasureCollection());
    expect(parseTreasureCollection("x")).toEqual(emptyTreasureCollection());
  });

  it("{instances:[...]} 와 배열 그 자체 모두 수용, 위조 인스턴스 drop", () => {
    const good = inst("a");
    const fromObj = parseTreasureCollection({ instances: [good, { instanceId: "" }] });
    const fromArr = parseTreasureCollection([good]);
    expect(fromObj.instances).toEqual([good]);
    expect(fromArr.instances).toEqual([good]);
  });
});

describe("addInstance", () => {
  it("추가 + instanceId 중복 무시", () => {
    let c = emptyTreasureCollection();
    c = addInstance(c, inst("a"));
    c = addInstance(c, inst("b"));
    c = addInstance(c, inst("a")); // dup
    expect(c.instances.map((i) => i.instanceId)).toEqual(["a", "b"]);
  });
});
