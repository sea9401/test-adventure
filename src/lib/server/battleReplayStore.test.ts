import { describe, expect, it, vi } from "vitest";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  BATTLE_REPLAY_RETENTION_DAYS,
  storeBattleReplays,
} from "./battleReplayStore";

describe("storeBattleReplays", () => {
  it("전체 payload는 DB에 저장하고 응답에는 replayId 참조만 남긴다", async () => {
    const values = vi.fn(async () => undefined);
    const executor = {
      insert: vi.fn(() => ({ values })),
    } as unknown as Parameters<typeof storeBattleReplays>[0];
    const payload: ReplayPayload = {
      enemy: { name: "산군", hp: 30_000 },
      playerMaxHp: 500,
      playerMaxMp: 100,
      log: Array.from({ length: 500 }, (_, index) => ({
        kind: "info" as const,
        text: `${index}`,
      })),
    };
    const now = new Date("2026-08-08T00:00:00.000Z");

    const [reference] = await storeBattleReplays(
      executor,
      "user-1",
      [payload],
      BATTLE_REPLAY_RETENTION_DAYS.batchHunt,
      now,
    );

    const [rows] = values.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
    ];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "user-1",
      payload,
      createdAt: now,
      expiresAt: new Date("2026-08-09T00:00:00.000Z"),
    });
    expect(rows[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(reference).toMatchObject({
      replayId: rows[0]?.id,
      enemy: payload.enemy,
      log: [],
    });
    expect(payload.log).toHaveLength(500);
  });
});
