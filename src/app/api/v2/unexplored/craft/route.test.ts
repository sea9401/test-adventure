import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  featureEnabled: true,
  userId: "crafter-1" as string | null,
  character: {} as Record<string, unknown>,
  writes: 0,
  transactionTail: Promise.resolve(),
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
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => {
      const run = mocks.transactionTail.then(() => callback({}));
      mocks.transactionTail = run.then(() => undefined, () => undefined);
      return run;
    }),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => structuredClone(mocks.character)),
  upsertSave: vi.fn(async (_tx, _userId, _key, value: unknown) => {
    mocks.character = structuredClone(value as Record<string, unknown>);
    mocks.writes += 1;
  }),
}));

import { POST } from "./route";
import { SUMMON_SCROLL_MATERIAL_ID } from "@/adventure/data/v2/coopBosses";
import {
  UNEXPLORED_BOSSES,
  UNEXPLORED_SUMMON_STONE_SCROLL_COST,
} from "@/adventure/data/v2/unexploredBosses";
import { UNEXPLORED_SUMMON_STONE_GOLD_COST } from "@/lib/server/unexploredBossCraft";

function readyCharacter() {
  return {
    level: 100,
    gold: UNEXPLORED_SUMMON_STONE_GOLD_COST * 2,
    materials: {
      v2_unexplored_runaway_machines_material: 20,
      v2_unexplored_shadow_stalkers_material: 20,
      [SUMMON_SCROLL_MATERIAL_ID]:
        UNEXPLORED_SUMMON_STONE_SCROLL_COST * 2,
    },
    unexplored: {
      selectedNodeIds: ["start", "deep-boss"],
      traces: { runaway_machines: 1_000, shadow_stalkers: 1_000 },
    },
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/v2/unexplored/craft", {
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
  mocks.writes = 0;
  mocks.transactionTail = Promise.resolve();
});

describe("POST /api/v2/unexplored/craft", () => {
  it("인증·기능 플래그·본문을 검증한다", async () => {
    mocks.userId = null;
    expect((await POST(request({}))).status).toBe(401);
    mocks.userId = "crafter-1";
    mocks.featureEnabled = false;
    expect((await POST(request({}))).status).toBe(404);
    mocks.featureEnabled = true;
    expect((await POST(request({ bossId: "bad", requestId: "x" }))).status).toBe(400);
  });

  it("같은 requestId 재시도는 저장을 다시 쓰지 않고 최초 스냅샷을 돌려준다", async () => {
    const first = await POST(request({ bossId: "tracking_weapon", requestId: "same" }));
    const retry = await POST(request({ bossId: "tracking_weapon", requestId: "same" }));
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ ok: true, idempotent: true });
    expect(mocks.writes).toBe(1);
  });

  it("같은 requestId를 다른 보스에 쓰면 409를 반환한다", async () => {
    await POST(request({ bossId: "tracking_weapon", requestId: "conflict" }));
    const response = await POST(
      request({ bossId: "toxic_blood_lord", requestId: "conflict" }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "request_conflict",
    });
  });

  it("동시 두 요청은 잠금 뒤 순서대로 처리되어 보유량만큼만 성공한다", async () => {
    mocks.character = readyCharacter();
    (mocks.character as { gold: number }).gold = UNEXPLORED_SUMMON_STONE_GOLD_COST;
    const materials = (mocks.character as { materials: Record<string, number> }).materials;
    materials.v2_unexplored_runaway_machines_material = 10;
    materials.v2_unexplored_shadow_stalkers_material = 10;
    materials[SUMMON_SCROLL_MATERIAL_ID] =
      UNEXPLORED_SUMMON_STONE_SCROLL_COST;
    const unexplored = mocks.character.unexplored as {
      traces: Record<string, number>;
    };
    unexplored.traces = { runaway_machines: 500, shadow_stalkers: 500 };

    const responses = await Promise.all([
      POST(request({ bossId: "tracking_weapon", requestId: "concurrent-a" })),
      POST(request({ bossId: "tracking_weapon", requestId: "concurrent-b" })),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const outputId = UNEXPLORED_BOSSES.tracking_weapon.summonMaterialId;
    expect(
      (mocks.character.materials as Record<string, number>)[outputId],
    ).toBe(1);
  });
});
