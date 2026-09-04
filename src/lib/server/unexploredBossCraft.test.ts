import { describe, expect, it } from "vitest";
import { SUMMON_SCROLL_MATERIAL_ID } from "@/adventure/data/v2/coopBosses";
import {
  UNEXPLORED_BOSSES,
  UNEXPLORED_SUMMON_STONE_SCROLL_COST,
} from "@/adventure/data/v2/unexploredBosses";
import {
  UNEXPLORED_SUMMON_STONE_GOLD_COST,
  applyUnexploredBossCraft,
} from "./unexploredBossCraft";

const BOSS = UNEXPLORED_BOSSES.tracking_weapon;
const MATERIAL_A = "v2_unexplored_runaway_machines_material";
const MATERIAL_B = "v2_unexplored_shadow_stalkers_material";

function readyCharacter() {
  return {
    level: 100,
    gold: UNEXPLORED_SUMMON_STONE_GOLD_COST,
    materials: {
      [MATERIAL_A]: 10,
      [MATERIAL_B]: 10,
      [SUMMON_SCROLL_MATERIAL_ID]: UNEXPLORED_SUMMON_STONE_SCROLL_COST,
    },
    unexplored: {
      selectedNodeIds: ["start", "deep-boss"],
      traces: {
        runaway_machines: 500,
        shadow_stalkers: 500,
      },
    },
  };
}

describe("applyUnexploredBossCraft", () => {
  it.each([
    ["trace_a", (save: ReturnType<typeof readyCharacter>) => {
      save.unexplored.traces.runaway_machines = 499;
    }, "insufficient_trace"],
    ["trace_b", (save: ReturnType<typeof readyCharacter>) => {
      save.unexplored.traces.shadow_stalkers = 499;
    }, "insufficient_trace"],
    ["material_a", (save: ReturnType<typeof readyCharacter>) => {
      save.materials[MATERIAL_A] = 9;
    }, "insufficient_material"],
    ["material_b", (save: ReturnType<typeof readyCharacter>) => {
      save.materials[MATERIAL_B] = 9;
    }, "insufficient_material"],
    ["scroll", (save: ReturnType<typeof readyCharacter>) => {
      save.materials[SUMMON_SCROLL_MATERIAL_ID] =
        UNEXPLORED_SUMMON_STONE_SCROLL_COST - 1;
    }, "insufficient_scrolls"],
    ["gold", (save: ReturnType<typeof readyCharacter>) => {
      save.gold = UNEXPLORED_SUMMON_STONE_GOLD_COST - 1;
    }, "insufficient_gold"],
  ])("재료 부족(%s)이면 아무것도 차감하지 않는다", (_label, mutate, error) => {
    const character = readyCharacter();
    mutate(character);
    const before = structuredClone(character);

    expect(
      applyUnexploredBossCraft(character, "tracking_weapon", "req-1", 100),
    ).toEqual({ ok: false, error });
    expect(character).toEqual(before);
  });

  it("우두머리의 흔적 노드가 비활성이면 제작하지 않는다", () => {
    const character = readyCharacter();
    character.unexplored.selectedNodeIds = ["start"];
    expect(
      applyUnexploredBossCraft(character, "tracking_weapon", "req-1", 100),
    ).toEqual({ ok: false, error: "boss_node_required" });
  });

  it("제작식 전부를 차감하고 소환석·업적·영수증을 한 번에 기록한다", () => {
    const result = applyUnexploredBossCraft(
      readyCharacter(),
      "tracking_weapon",
      "req-success",
      123_456,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.idempotent).toBe(false);
    expect(result.character.gold).toBe(0);
    expect(result.character.materials).toMatchObject({
      [BOSS.summonMaterialId]: 1,
    });
    expect(result.character.materials[MATERIAL_A]).toBeUndefined();
    expect(result.character.materials[MATERIAL_B]).toBeUndefined();
    expect(result.character.materials[SUMMON_SCROLL_MATERIAL_ID]).toBeUndefined();
    expect(result.character.unexplored.traces.runaway_machines).toBeUndefined();
    expect(result.character.unexplored.traces.shadow_stalkers).toBeUndefined();
    expect(result.character.unexplored.achievementIds).toContain(
      "first_summon_stone_craft",
    );
    expect(result.receipt).toEqual({
      requestId: "req-success",
      bossId: "tracking_weapon",
      craftedAt: 123_456,
      baseGoldCost: UNEXPLORED_SUMMON_STONE_GOLD_COST,
      goldCost: UNEXPLORED_SUMMON_STONE_GOLD_COST,
      liberationDiscountPct: 0,
    });
  });

  it("할인된 실제 골드 비용을 영수증에 고정해 재시도에도 보존한다", () => {
    const first = applyUnexploredBossCraft(
      readyCharacter(),
      "tracking_weapon",
      "req-discount",
      100,
      10,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.character.gold).toBe(
      UNEXPLORED_SUMMON_STONE_GOLD_COST * 0.1,
    );
    expect(first.receipt).toMatchObject({
      baseGoldCost: UNEXPLORED_SUMMON_STONE_GOLD_COST,
      goldCost: UNEXPLORED_SUMMON_STONE_GOLD_COST * 0.9,
      liberationDiscountPct: 10,
    });

    const retry = applyUnexploredBossCraft(
      first.character,
      "tracking_weapon",
      "req-discount",
      999,
      0,
    );
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.receipt).toEqual(first.receipt);
  });

  it("같은 requestId 재시도는 최초 영수증을 반환하고 다시 차감하지 않는다", () => {
    const first = applyUnexploredBossCraft(
      readyCharacter(),
      "tracking_weapon",
      "req-retry",
      100,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = applyUnexploredBossCraft(
      first.character,
      "tracking_weapon",
      "req-retry",
      999,
    );
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.idempotent).toBe(true);
    expect(retry.receipt.craftedAt).toBe(100);
    expect(retry.character).toEqual(first.character);
  });

  it("같은 requestId를 다른 보스에 재사용하면 충돌한다", () => {
    const first = applyUnexploredBossCraft(
      readyCharacter(),
      "tracking_weapon",
      "req-conflict",
      100,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(
      applyUnexploredBossCraft(
        first.character,
        "toxic_blood_lord",
        "req-conflict",
        200,
      ),
    ).toEqual({ ok: false, error: "request_conflict" });
  });
});
