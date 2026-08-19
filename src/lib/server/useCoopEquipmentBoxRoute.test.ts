import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexMasteryGameplayEvent } from "./codexMasteryGameplay";

const { store, recordCodexMasteryGameplayBatch } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  recordCodexMasteryGameplayBatch: vi.fn(
    async (
      _executor: unknown,
      _userId: string,
      _events: readonly CodexMasteryGameplayEvent[],
      _now: Date,
    ) => [],
  ),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-coop-box"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/me/use-coop-equipment-box/route";
import {
  COOP_EQUIPMENT_BOX,
  COOP_EQUIPMENT_BOX_ID,
} from "@/adventure/data/v2/coopRewards";

function request(boxId: string): Request {
  return new Request("http://test/api/v2/me/use-coop-equipment-box", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ boxId }),
  });
}

describe("use coop equipment box codex mastery", () => {
  beforeEach(() => {
    store.clear();
    recordCodexMasteryGameplayBatch.mockClear();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records the exact equipment rolled from a consumed boss box", async () => {
    // Break caught: the box is consumed and equipment is owned without permanent acquisition mastery.
    const box = COOP_EQUIPMENT_BOX.mountain_chief_hard;
    const expectedEquipmentId = box.itemIds?.[0];
    store.set("character.v2", { materials: { [box.id]: 2 } });
    store.set("equipment.v2", { owned: [], equipped: {} });

    const response = await POST(request(box.id));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      remaining: 1,
      equipment: { id: expectedEquipmentId },
    });
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      expect.anything(),
      "u-coop-box",
      [{
        category: "equipment",
        entryId: expectedEquipmentId,
        amount: 1,
        source: "equipment.drop",
      }],
      expect.any(Date),
    );
  });

  it("does not record when the user has no box", async () => {
    store.set("character.v2", { materials: {} });

    const response = await POST(request(COOP_EQUIPMENT_BOX_ID.mountain_chief));

    expect(response.status).toBe(400);
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });
});
