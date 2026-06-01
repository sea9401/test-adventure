import { describe, it, expect } from "vitest";
import {
  addInstance,
  emptyTreasureCollection,
  parseTreasureCollection,
  removeInstanceById,
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

describe("removeInstanceById", () => {
  it("제거 + removed 반환, 없으면 null", () => {
    let c = emptyTreasureCollection();
    c = addInstance(c, inst("a", "gold_coin"));
    c = addInstance(c, inst("b", "clay_shard"));
    expect(removeInstanceById(c, "zzz")).toBeNull();
    const r = removeInstanceById(c, "a");
    expect(r?.removed.instanceId).toBe("a");
    expect(r?.collection.instances.map((i) => i.instanceId)).toEqual(["b"]);
  });
});
