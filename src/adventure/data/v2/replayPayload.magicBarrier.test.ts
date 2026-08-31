import { describe, expect, it } from "vitest";
import type { BattleLogEntry } from "@/adventure/v2/combat/engine";
import { toPvpReplayPayloadForSide } from "./replayPayload";

describe("PvP 방어자 시점 마나 장벽 리플레이", () => {
  it("공격자 장벽을 방어자의 상대 열로 옮긴다", () => {
    const hpBar: BattleLogEntry = {
      kind: "hp_bar",
      text: "",
      playerHp: 0,
      playerMaxHp: 4_394,
      enemyHp: 5_083,
      enemyMaxHp: 5_083,
      playerMagicBarrier: 1_748,
      playerMagicBarrierMax: 6_320,
    };

    const replay = toPvpReplayPayloadForSide(
      {
        p1: { maxHp: 4_394, maxMp: 6_384, mp: 6_384 },
        p2: { maxHp: 5_083, maxMp: 535, mp: 429 },
        log: [hpBar],
      },
      "p2",
      "공격자",
    );

    expect(replay.log[0]).toMatchObject({
      playerHp: 5_083,
      playerMaxHp: 5_083,
      playerMagicBarrier: undefined,
      playerMagicBarrierMax: undefined,
      enemyHp: 0,
      enemyMaxHp: 4_394,
      enemyMagicBarrier: 1_748,
      enemyMagicBarrierMax: 6_320,
    });
  });
});
