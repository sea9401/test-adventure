import { describe, expect, it, vi } from "vitest";
import {
  MINING_MATERIALS,
  MINING_NODES,
  MINING_SPOTS,
  MINING_SPOT_IDS,
  isMiningSpotId,
  miningNodeForSpot,
  rollMiningByproducts,
} from "./miningSpots";

describe("채광 장소 카탈로그", () => {
  it("6개 채광지와 서로 다른 6개 광맥을 제공한다", () => {
    expect(MINING_SPOT_IDS).toHaveLength(6);
    expect(isMiningSpotId("iron_quarry")).toBe(true);
    const nodeIds = new Set(
      Object.values(MINING_SPOTS).map((spot) => miningNodeForSpot(spot).id),
    );
    expect(nodeIds.size).toBe(6);
  });

  it("등급이 오를수록 시간·경험치·실패율이 증가한다", () => {
    const order = ["iron", "copper", "silver", "gold", "mythril", "adamantite"] as const;
    const nodes = order.map((id) => MINING_NODES[id]);
    for (let index = 1; index < nodes.length; index += 1) {
      expect(nodes[index].grade).toBeGreaterThan(nodes[index - 1].grade);
      expect(nodes[index].durationMs).toBeGreaterThan(nodes[index - 1].durationMs);
      expect(nodes[index].xp).toBeGreaterThan(nodes[index - 1].xp);
      expect(nodes[index].baseFailureRate).toBeGreaterThan(
        nodes[index - 1].baseFailureRate,
      );
      expect(MINING_MATERIALS[nodes[index].materialId]).toBeDefined();
    }
  });

  it("기본 성공률은 벌목과 같은 90·80·65·50·40·30%다", () => {
    expect(
      ["iron", "copper", "silver", "gold", "mythril", "adamantite"].map(
        (id) =>
          Math.round(
            (1 - MINING_NODES[id as keyof typeof MINING_NODES].baseFailureRate) * 100,
          ),
      ),
    ).toEqual([90, 80, 65, 50, 40, 30]);
  });

  it("부산물은 규칙별 독립 확률로 굴린다", () => {
    const rng = vi.fn().mockReturnValueOnce(0.01).mockReturnValueOnce(0.99);
    const drops = rollMiningByproducts(MINING_NODES.iron, rng);
    expect(drops).toEqual({ v2_mining_stone: 1 });
    expect(rng).toHaveBeenCalledTimes(2);
  });
});
