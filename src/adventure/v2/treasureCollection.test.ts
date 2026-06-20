import { describe, it, expect } from "vitest";
import {
  BULK_SELL_MAX_TIER,
  addInstance,
  bulkSellGold,
  emptyTreasureCollection,
  isBulkSellableTier,
  parseTreasureCollection,
  removeInstanceById,
  selectInstancesUpToTier,
} from "./treasureCollection";
import { sellGoldValue } from "@/adventure/data/v2/antique";
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

describe("등급 일괄 판매 (bulk sell)", () => {
  // clay_shard/copper_coin=흔함, bronze_mirror=보통, gold_coin=희귀, dragon_jade_seal=전설.
  const items: AntiqueInstance[] = [
    inst("a", "clay_shard"),
    inst("b", "copper_coin"),
    inst("c", "bronze_mirror"),
    inst("d", "gold_coin"),
    inst("e", "dragon_jade_seal"),
  ];

  it("isBulkSellableTier — 흔함·보통만 허용, 희귀↑ 차단(고가품 보호)", () => {
    expect(BULK_SELL_MAX_TIER).toBe("uncommon");
    expect(isBulkSellableTier("common")).toBe(true);
    expect(isBulkSellableTier("uncommon")).toBe(true);
    expect(isBulkSellableTier("rare")).toBe(false);
    expect(isBulkSellableTier("epic")).toBe(false);
    expect(isBulkSellableTier("legendary")).toBe(false);
    // 알 수 없는/위조 문자열도 거부(indexOf=-1 오판 방지).
    expect(isBulkSellableTier("garbage" as unknown as never)).toBe(false);
  });

  it("selectInstancesUpToTier('common') — 흔함만", () => {
    expect(
      selectInstancesUpToTier(items, "common")
        .map((i) => i.instanceId)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("selectInstancesUpToTier('uncommon') — 흔함+보통, 희귀·전설 절대 제외", () => {
    const sel = selectInstancesUpToTier(items, "uncommon");
    expect(sel.map((i) => i.instanceId).sort()).toEqual(["a", "b", "c"]);
    expect(sel.some((i) => i.instanceId === "d")).toBe(false); // 희귀
    expect(sel.some((i) => i.instanceId === "e")).toBe(false); // 전설
  });

  it("알 수 없는 antiqueId 는 선택 제외(안전)", () => {
    const bad: AntiqueInstance[] = [
      inst("x", "not_a_real_antique"),
      inst("y", "clay_shard"),
    ];
    expect(
      selectInstancesUpToTier(bad, "uncommon").map((i) => i.instanceId),
    ).toEqual(["y"]);
  });

  it("bulkSellGold — 선택분 sellGoldValue 합(빈 배열 0)", () => {
    const sel = selectInstancesUpToTier(items, "uncommon");
    const expected = sel.reduce(
      (s, i) => s + sellGoldValue(i.antiqueId, i.condition),
      0,
    );
    expect(bulkSellGold(sel)).toBe(expected);
    expect(bulkSellGold(sel)).toBeGreaterThan(0);
    expect(bulkSellGold([])).toBe(0);
  });
});
