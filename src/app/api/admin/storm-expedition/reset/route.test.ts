import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(async () => null as Response | null),
  currentAdminEmail: vi.fn(async () => "admin@example.com"),
  audit: vi.fn(async () => {}),
  lock: vi.fn(async () => ({} as unknown)),
  upsert: vi.fn(async () => {}),
  transaction: vi.fn(),
  targetRows: [
    { id: "target-user", gameName: "대상 모험가" },
  ] as Array<{ id: string; gameName: string | null }>,
  tx: { kind: "transaction" },
}));

vi.mock("@/lib/server/isAdmin", () => ({
  requireAdminRole: mocks.gate,
  currentAdminEmail: mocks.currentAdminEmail,
}));
vi.mock("@/lib/server/adminAudit", () => ({
  logAdminAction: mocks.audit,
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: mocks.lock,
  upsertSave: mocks.upsert,
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.targetRows),
        })),
      })),
    })),
    transaction: mocks.transaction,
  },
}));

import {
  STORM_EXPEDITION_SAVE_KEY,
  stormExpeditionDateKey,
} from "@/adventure/data/v2/stormExpedition";
import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://test/api/admin/storm-expedition/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/storm-expedition/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(null);
    mocks.targetRows = [{ id: "target-user", gameName: "대상 모험가" }];
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) =>
        callback(mocks.tx),
    );
    mocks.lock.mockResolvedValue({});
  });

  it("오늘 입장 사용 횟수만 초기화하고 진행 중 원정과 누적 기록을 보존한다", async () => {
    const date = stormExpeditionDateKey();
    mocks.lock.mockResolvedValue({
      date,
      attemptsUsed: 3,
      clears: 7,
      spFruitPity: 11,
      spFruitObtained: 2,
      active: {
        routeId: "gale",
        stage: 2,
        hp: 123,
        mp: 45,
        pendingGold: 46_000,
      },
    });

    const response = await POST(request({ userId: "target-user" }));
    const json = (await response.json()) as {
      ok?: boolean;
      previousAttemptsUsed?: number;
      attemptsUsed?: number;
      attemptsLeft?: number;
      activePreserved?: boolean;
    };

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      previousAttemptsUsed: 3,
      attemptsUsed: 0,
      attemptsLeft: 3,
      activePreserved: true,
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      mocks.tx,
      "target-user",
      STORM_EXPEDITION_SAVE_KEY,
      expect.objectContaining({
        date,
        attemptsUsed: 0,
        clears: 7,
        spFruitPity: 11,
        spFruitObtained: 2,
        active: expect.objectContaining({
          version: 3,
          routeId: "gale",
          currentNodeId: "gale_elite",
          visitedNodeIds: ["gale_outer", "supply", "gale_middle", "gale_camp", "gale_elite"],
          completedNodeIds: ["gale_outer", "supply", "gale_middle", "gale_camp"],
          hp: 123,
          mp: 45,
        }),
      }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "storm-expedition.reset-daily-attempts",
        targetUserId: "target-user",
        detail: expect.objectContaining({
          previousAttemptsUsed: 3,
          activePreserved: true,
          changed: true,
        }),
      }),
    );
  });

  it("이미 0회 사용 상태이면 세이브 버전을 올리지 않고 성공 이력만 남긴다", async () => {
    mocks.lock.mockResolvedValue({
      date: stormExpeditionDateKey(),
      attemptsUsed: 0,
      clears: 2,
    });

    const response = await POST(request({ userId: "target-user" }));

    expect(response.status).toBe(200);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ changed: false }),
      }),
    );
  });

  it("보상 권한이 없으면 초기화를 거절한다", async () => {
    mocks.gate.mockResolvedValue(
      Response.json({ ok: false, error: "forbidden" }, { status: 403 }),
    );

    const response = await POST(request({ userId: "target-user" }));

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("존재하지 않는 유저는 404를 반환한다", async () => {
    mocks.targetRows = [];

    const response = await POST(request({ userId: "missing-user" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "user_not_found" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
