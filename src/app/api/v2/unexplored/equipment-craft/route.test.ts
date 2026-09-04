import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  featureEnabled: true,
  userId: "crafter-1" as string | null,
  character: {} as Record<string, unknown>,
  transaction: vi.fn(),
  lockSave: vi.fn(),
  upsertSave: vi.fn(),
  readSave: vi.fn(),
  mintEquipment: vi.fn(),
  appendEquipment: vi.fn(),
  recordUnique: vi.fn(),
  recordMastery: vi.fn(),
}));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return {
    ...actual,
    get V2_UNEXPLORED() {
      return mocks.featureEnabled;
    },
  };
});
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/db", () => ({
  db: { transaction: mocks.transaction },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: mocks.lockSave,
  upsertSave: mocks.upsertSave,
  readSave: mocks.readSave,
}));
vi.mock("@/adventure/data/v2/v2EquipMint", () => ({
  mintRolledEquipInstance: mocks.mintEquipment,
}));
vi.mock("@/lib/server/equipGrant", () => ({
  appendEquipInstances: mocks.appendEquipment,
}));
vi.mock("@/lib/server/uniqueEquipmentAchievement", () => ({
  recordUniqueEquipmentAcquisitions: mocks.recordUnique,
}));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch: mocks.recordMastery,
}));

import { POST } from "./route";
import {
  UNEXPLORED_BOSS_CORE_MATERIAL,
} from "@/adventure/data/v2/unexploredBosses";

const COMMON_ID = "v2_unexplored_tracking_blade_dagger";
const RARE_ID = "v2_unexplored_phantom_acceleration_boots";
const MATERIAL_A = "v2_unexplored_runaway_machines_material";
const MATERIAL_B = "v2_unexplored_shadow_stalkers_material";
const IMMORTAL_COMMON_ID = "v2_unexplored_immortal_king_greatsword";
const IMMORTAL_DROP_ONLY_ID = "v2_unexplored_eternal_life_core";
const TX = { kind: "test-transaction" };

function readyCharacter() {
  return {
    level: 100,
    materials: {
      [UNEXPLORED_BOSS_CORE_MATERIAL.id]: 25,
      [MATERIAL_A]: 75,
      [MATERIAL_B]: 75,
    },
    unexplored: { selectedNodeIds: ["start"] },
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/v2/unexplored/equipment-craft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.featureEnabled = true;
  mocks.userId = "crafter-1";
  mocks.character = readyCharacter();
  mocks.transaction.mockImplementation(
    async (callback: (tx: typeof TX) => unknown) => callback(TX),
  );
  mocks.lockSave.mockImplementation(async () =>
    structuredClone(mocks.character)
  );
  mocks.upsertSave.mockImplementation(
    async (_tx: unknown, _userId: string, key: string, value: unknown) => {
      if (key === "character.v2") {
        mocks.character = structuredClone(value as Record<string, unknown>);
      }
    },
  );
  mocks.readSave.mockResolvedValue({ registeredIds: [] });
  mocks.mintEquipment.mockImplementation((id: string) => ({
    iid: `crafted-${id}`,
    id,
    roll: { powerPct: 101 },
  }));
  mocks.appendEquipment.mockImplementation(
    async (_tx: unknown, _userId: string, equipment: unknown[]) => equipment,
  );
  mocks.recordUnique.mockResolvedValue(1);
  mocks.recordMastery.mockResolvedValue([]);
});

describe("POST /api/v2/unexplored/equipment-craft", () => {
  it("불멸 장비는 30% 장비만 확정 제작하고 0.5% 생명핵은 거부한다", async () => {
    mocks.character = {
      level: 100,
      materials: {
        [UNEXPLORED_BOSS_CORE_MATERIAL.id]: 8,
        v2_unexplored_regenerating_swarm_material: 25,
        v2_unexplored_red_berserkers_material: 25,
      },
      unexplored: { selectedNodeIds: ["start"] },
    };

    const crafted = await POST(request({
      equipmentId: IMMORTAL_COMMON_ID,
      requestId: "immortal-common",
    }));
    expect(crafted.status).toBe(200);
    await expect(crafted.json()).resolves.toMatchObject({
      equipmentId: IMMORTAL_COMMON_ID,
      materials: {},
    });

    const dropOnly = await POST(request({
      equipmentId: IMMORTAL_DROP_ONLY_ID,
      requestId: "immortal-drop-only",
    }));
    expect(dropOnly.status).toBe(400);
  });

  it("인증·기능 플래그·본문을 트랜잭션 전에 검증한다", async () => {
    mocks.userId = null;
    expect((await POST(request({}))).status).toBe(401);

    mocks.userId = "crafter-1";
    mocks.featureEnabled = false;
    expect((await POST(request({}))).status).toBe(404);

    mocks.featureEnabled = true;
    expect((await POST(request({ equipmentId: COMMON_ID }))).status).toBe(400);
    expect(
      (await POST(request({
        equipmentId: COMMON_ID,
        requestId: "x".repeat(129),
      }))).status,
    ).toBe(400);
    expect(
      (await POST(request({
        equipmentId: "v2_unexplored_infinite_orbit_heart",
        requestId: "ultra-rare",
      }))).status,
    ).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("첫 제작은 장비와 재료를 함께 저장하고 유니크 획득·제작 숙련도를 기록한다", async () => {
    const response = await POST(
      request({ equipmentId: COMMON_ID, requestId: "request-success" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      idempotent: false,
      equipmentId: COMMON_ID,
      equipmentIid: `crafted-${COMMON_ID}`,
      materials: {
        [UNEXPLORED_BOSS_CORE_MATERIAL.id]: 17,
        [MATERIAL_A]: 50,
        [MATERIAL_B]: 50,
      },
    });
    expect(mocks.lockSave).toHaveBeenCalledWith(
      TX,
      "crafter-1",
      "character.v2",
      {},
    );
    expect(mocks.appendEquipment).toHaveBeenCalledWith(
      TX,
      "crafter-1",
      [{
        iid: `crafted-${COMMON_ID}`,
        id: COMMON_ID,
        roll: { powerPct: 101 },
      }],
    );
    expect(mocks.upsertSave).toHaveBeenCalledWith(
      TX,
      "crafter-1",
      "character.v2",
      expect.objectContaining({
        materials: {
          [UNEXPLORED_BOSS_CORE_MATERIAL.id]: 17,
          [MATERIAL_A]: 50,
          [MATERIAL_B]: 50,
        },
      }),
    );
    expect(mocks.recordUnique).toHaveBeenCalledWith({
      executor: TX,
      userId: "crafter-1",
      evidence: {
        equipmentOwnedAfter: [{
          iid: `crafted-${COMMON_ID}`,
          id: COMMON_ID,
          roll: { powerPct: 101 },
        }],
        equipmentCodexRaw: { registeredIds: [] },
        acquiredIds: [COMMON_ID],
      },
    });
    expect(mocks.recordMastery).toHaveBeenCalledWith(
      TX,
      "crafter-1",
      [{
        category: "equipment",
        entryId: COMMON_ID,
        amount: 1,
        source: "equipment.craft",
      }],
      expect.any(Date),
    );
  });

  it("같은 요청 재시도는 같은 IID만 반환하고 어떤 지급·기록도 반복하지 않는다", async () => {
    const first = await POST(
      request({ equipmentId: COMMON_ID, requestId: "request-retry" }),
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json();

    vi.clearAllMocks();
    const retry = await POST(
      request({ equipmentId: COMMON_ID, requestId: "request-retry" }),
    );

    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      ok: true,
      idempotent: true,
      equipmentId: COMMON_ID,
      equipmentIid: firstBody.equipmentIid,
    });
    expect(mocks.mintEquipment).not.toHaveBeenCalled();
    expect(mocks.appendEquipment).not.toHaveBeenCalled();
    expect(mocks.upsertSave).not.toHaveBeenCalled();
    expect(mocks.recordUnique).not.toHaveBeenCalled();
    expect(mocks.recordMastery).not.toHaveBeenCalled();
  });

  it("재료 부족과 요청 충돌은 409로 거부하고 저장하지 않는다", async () => {
    (mocks.character.materials as Record<string, number>)[
      UNEXPLORED_BOSS_CORE_MATERIAL.id
    ] = 7;
    const shortage = await POST(
      request({ equipmentId: COMMON_ID, requestId: "request-shortage" }),
    );
    expect(shortage.status).toBe(409);
    await expect(shortage.json()).resolves.toEqual({
      ok: false,
      error: "insufficient_boss_cores",
    });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
    expect(mocks.appendEquipment).not.toHaveBeenCalled();

    mocks.character = readyCharacter();
    await POST(
      request({ equipmentId: COMMON_ID, requestId: "request-conflict" }),
    );
    const writesAfterFirst = mocks.upsertSave.mock.calls.length;
    const conflict = await POST(
      request({ equipmentId: RARE_ID, requestId: "request-conflict" }),
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({
      ok: false,
      error: "request_conflict",
    });
    expect(mocks.upsertSave).toHaveBeenCalledTimes(writesAfterFirst);
  });
});
