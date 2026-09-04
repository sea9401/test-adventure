import { describe, expect, it, vi } from "vitest";
import {
  UNEXPLORED_BOSS_CORE_MATERIAL,
} from "@/adventure/data/v2/unexploredBosses";
import type {
  V2EquipInstance,
  V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { applyUnexploredBossEquipmentCraft } from "./unexploredBossEquipmentCraft";

const CORE_ID = UNEXPLORED_BOSS_CORE_MATERIAL.id;
const MATERIAL_A = "v2_unexplored_runaway_machines_material";
const MATERIAL_B = "v2_unexplored_shadow_stalkers_material";
const COMMON_ID = "v2_unexplored_tracking_blade_dagger";
const RARE_ID = "v2_unexplored_phantom_acceleration_boots";

function readyCharacter() {
  return {
    level: 100,
    gold: 123_456,
    materials: {
      [CORE_ID]: 25,
      [MATERIAL_A]: 75,
      [MATERIAL_B]: 75,
      unrelated_material: 9,
    },
    unexplored: {
      selectedNodeIds: ["start"],
      traces: { runaway_machines: 1 },
    },
  };
}

function fixedMint(iid = "crafted-iid") {
  return vi.fn(
    (id: V2EquipmentId): V2EquipInstance => ({ iid, id }),
  );
}

describe("applyUnexploredBossEquipmentCraft", () => {
  it("30% 일반 고유는 핵 8개와 연결 재료 25개씩만 차감한다", () => {
    const character = readyCharacter();
    const before = structuredClone(character);
    const mint = fixedMint();

    const result = applyUnexploredBossEquipmentCraft(
      character,
      COMMON_ID,
      "request-common",
      123_456,
      mint,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(character).toEqual(before);
    expect(result.idempotent).toBe(false);
    expect(result.equipment).toEqual({ iid: "crafted-iid", id: COMMON_ID });
    expect(result.character).toMatchObject({
      level: 100,
      gold: 123_456,
      materials: {
        [CORE_ID]: 17,
        [MATERIAL_A]: 50,
        [MATERIAL_B]: 50,
        unrelated_material: 9,
      },
    });
    expect(result.character.unexplored).toMatchObject({
      selectedNodeIds: ["start"],
      traces: { runaway_machines: 1 },
      equipmentCraftReceipts: [{
        requestId: "request-common",
        equipmentId: COMMON_ID,
        equipmentIid: "crafted-iid",
        craftedAt: 123_456,
      }],
    });
    expect(mint).toHaveBeenCalledOnce();
  });

  it("10% 일반 고유는 핵 25개와 연결 재료 75개씩 차감한다", () => {
    const result = applyUnexploredBossEquipmentCraft(
      readyCharacter(),
      RARE_ID,
      "request-rare",
      200,
      fixedMint("rare-iid"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.materials).toEqual({ unrelated_material: 9 });
    expect(result.receipt).toEqual({
      requestId: "request-rare",
      equipmentId: RARE_ID,
      equipmentIid: "rare-iid",
      craftedAt: 200,
    });
  });

  it.each([
    ["boss_core", CORE_ID, 7, "insufficient_boss_cores"],
    ["pool_a", MATERIAL_A, 24, "insufficient_pool_material"],
    ["pool_b", MATERIAL_B, 24, "insufficient_pool_material"],
  ] as const)(
    "%s 부족은 입력을 바꾸거나 장비를 만들지 않는다",
    (_label, materialId, count, error) => {
      const character = readyCharacter();
      character.materials[materialId] = count;
      const before = structuredClone(character);
      const mint = fixedMint();

      expect(
        applyUnexploredBossEquipmentCraft(
          character,
          COMMON_ID,
          "request-shortage",
          300,
          mint,
        ),
      ).toEqual({ ok: false, error });
      expect(character).toEqual(before);
      expect(mint).not.toHaveBeenCalled();
    },
  );

  it.each([
    "v2_unexplored_infinite_orbit_heart",
    "v2_iron_sword",
  ])("제작 대상이 아닌 장비 %s를 거부한다", (equipmentId) => {
    const mint = fixedMint();
    expect(
      applyUnexploredBossEquipmentCraft(
        readyCharacter(),
        equipmentId,
        "request-invalid",
        400,
        mint,
      ),
    ).toEqual({ ok: false, error: "not_craftable" });
    expect(mint).not.toHaveBeenCalled();
  });

  it("같은 요청 재시도는 최초 IID를 반환하고 비용과 장비를 다시 적용하지 않는다", () => {
    const mint = fixedMint();
    const first = applyUnexploredBossEquipmentCraft(
      readyCharacter(),
      COMMON_ID,
      "request-retry",
      500,
      mint,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = applyUnexploredBossEquipmentCraft(
      first.character,
      COMMON_ID,
      "request-retry",
      999,
      mint,
    );

    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.idempotent).toBe(true);
    expect(retry.equipment).toBeNull();
    expect(retry.receipt).toEqual(first.receipt);
    expect(retry.character).toEqual(first.character);
    expect(mint).toHaveBeenCalledOnce();
  });

  it("같은 요청 ID를 다른 장비 제작에 재사용하면 충돌한다", () => {
    const first = applyUnexploredBossEquipmentCraft(
      readyCharacter(),
      COMMON_ID,
      "request-conflict",
      600,
      fixedMint(),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(
      applyUnexploredBossEquipmentCraft(
        first.character,
        RARE_ID,
        "request-conflict",
        700,
        fixedMint("other-iid"),
      ),
    ).toEqual({ ok: false, error: "request_conflict" });
  });
});
