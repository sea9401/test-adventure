import { describe, it, expect } from "vitest";
import { toReplayPayload, toReplayPayloadLite } from "./replayPayload";
import type { BattleState } from "@/adventure/v2/combat/engine";

// toReplayPayloadLite 만 읽는 필드(enemy.{name,hp,image}·playerMax*·playerMp)로 구성한 최소 픽스처.
const fixture = (logLen: number): BattleState =>
  ({
    enemy: { name: "더미", hp: 300, image: "dummy.webp" },
    playerMaxHp: 500,
    playerMaxMp: 120,
    playerMp: 80,
    log: Array.from({ length: logLen }, (_, i) => ({
      kind: "info" as const,
      text: `줄 ${i}`,
    })),
  }) as unknown as BattleState;

describe("toReplayPayloadLite (일괄 사냥 경량 payload)", () => {
  it("배치가 읽는 메타(playerMaxMp 등)는 담고 log 는 빈 배열(무거운 복사 회피)", () => {
    const p = toReplayPayloadLite(fixture(500));
    expect(p.playerMaxMp).toBe(120); // 배치 집계가 읽는 유일 필드
    expect(p.playerMaxHp).toBe(500);
    expect(p.playerMp).toBe(80);
    expect(p.enemy).toEqual({ name: "더미", hp: 300, image: "dummy.webp" });
    expect(p.log).toEqual([]); // log 는 복사 안 함(배치는 미사용)
  });

  it("full toReplayPayload 와 메타 필드는 동일 — log 만 다름(단판 무변경 보증)", () => {
    const fs = fixture(10);
    const full = toReplayPayload(fs, 200);
    const lite = toReplayPayloadLite(fs);
    expect(lite.enemy).toEqual(full.enemy);
    expect(lite.playerMaxHp).toBe(full.playerMaxHp);
    expect(lite.playerMaxMp).toBe(full.playerMaxMp);
    expect(lite.playerMp).toBe(full.playerMp);
    expect(full.log).toHaveLength(10); // full 은 로그 보존
    expect(lite.log).toHaveLength(0); // lite 는 생략
  });
});
