import { describe, expect, it } from "vitest";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  battleLogHandoffHref,
  readBattleLogHandoff,
  writeBattleLogHandoff,
  type BattleLogStorage,
} from "./battleLogHandoff";

class MemoryStorage implements BattleLogStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const replay: ReplayPayload = {
  enemy: { name: "훈련용 적", hp: 100 },
  playerMaxHp: 100,
  playerMaxMp: 0,
  log: [],
};

describe("전투 로그 페이지 handoff", () => {
  it("임의 ID로 저장한 구조화 리플레이를 다시 읽는다", () => {
    const storage = new MemoryStorage();
    const id = writeBattleLogHandoff(
      {
        kind: "replay",
        title: "훈련용 적 전투 로그",
        replay: {
          payload: replay,
          playerName: "모험가",
          gender: "male1",
          exp: 0,
          maxExp: 1,
        },
      },
      { storage, now: 1_000, id: "handoff-1" },
    );

    expect(id).toBe("handoff-1");
    expect(battleLogHandoffHref(id)).toBe("/battle/log/handoff-1");
    expect(readBattleLogHandoff(id, { storage, now: 1_001 })).toMatchObject({
      kind: "replay",
      title: "훈련용 적 전투 로그",
      replay: { playerName: "모험가" },
    });
  });

  it("만료되거나 손상된 레코드는 반환하지 않고 제거한다", () => {
    const storage = new MemoryStorage();
    writeBattleLogHandoff(
      {
        kind: "text",
        title: "격자 던전 전투 로그",
        playerName: "모험가",
        enemyName: "수문장",
        lines: ["모험가가 10 피해를 입혔다."],
      },
      { storage, now: 1_000, id: "expired", ttlMs: 10 },
    );

    expect(readBattleLogHandoff("expired", { storage, now: 1_011 })).toBeNull();

    storage.setItem("battle-log-handoff.v1:broken", "{not-json");
    expect(readBattleLogHandoff("broken", { storage, now: 1_011 })).toBeNull();
    expect(storage.getItem("battle-log-handoff.v1:broken")).toBeNull();
  });
});
