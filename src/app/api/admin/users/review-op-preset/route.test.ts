import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(async () => null as Response | null),
  isSuperAdminEmail: vi.fn(
    (email: string | null | undefined) => email === "review@example.com",
  ),
  currentAdminEmail: vi.fn(async () => "operator@example.com"),
  audit: vi.fn(async () => {}),
  lock: vi.fn(),
  read: vi.fn(),
  upsert: vi.fn(
    async (
      _tx: unknown,
      _userId: string,
      _key: string,
      _value: unknown,
    ) => {},
  ),
  transaction: vi.fn(),
  select: vi.fn(),
  targetRows: [
    { id: "review-user", email: "review@example.com", gameName: "심의자" },
  ] as Array<{ id: string; email: string | null; gameName: string | null }>,
  store: new Map<string, unknown>(),
  tx: { kind: "transaction" },
}));

vi.mock("@/lib/server/isAdmin", () => ({
  requireAdminRole: mocks.gate,
  isSuperAdminEmail: mocks.isSuperAdminEmail,
  currentAdminEmail: mocks.currentAdminEmail,
}));

vi.mock("@/lib/server/adminAudit", () => ({
  logAdminAction: mocks.audit,
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: mocks.lock,
  readSave: mocks.read,
  upsertSave: mocks.upsert,
}));

vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2FromSaves: vi.fn(() => ({
    maxHp: 9_999,
    player: { maxMp: 8_888 },
  })),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));

import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://test/api/admin/users/review-op-preset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/users/review-op-preset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(null);
    mocks.targetRows = [
      { id: "review-user", email: "review@example.com", gameName: "심의자" },
    ];
    mocks.store = new Map<string, unknown>([
      [
        "character.v2",
        {
          class: "mage",
          level: 20,
          exp: 5,
          hp: 1,
          mp: 2,
          gold: 3,
          fame: 4,
          frontierDepth: 5,
          questFlag: "preserve",
        },
      ],
      ["proficiency.v2", {}],
      ["inventory.v2", { hpCharges: 1, mpCharges: 2 }],
      ["equipment.v2", { equipped: {} }],
      ["skills.v2", { learned: [], equipped: [] }],
    ]);
    mocks.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.targetRows),
        })),
      })),
    });
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) =>
        callback(mocks.tx),
    );
    mocks.lock.mockImplementation(
      async (_tx: unknown, _userId: string, key: string, fallback: unknown) =>
        mocks.store.has(key) ? mocks.store.get(key) : fallback,
    );
    mocks.read.mockImplementation(
      async (_tx: unknown, _userId: string, key: string, fallback: unknown) =>
        mocks.store.has(key) ? mocks.store.get(key) : fallback,
    );
    mocks.upsert.mockImplementation(
      async (_tx: unknown, _userId: string, key: string, value: unknown) => {
        mocks.store.set(key, value);
      },
    );
  });

  it("최고 관리자 권한이 없으면 대상 조회 전에 거절한다", async () => {
    mocks.gate.mockResolvedValue(
      Response.json({ ok: false, error: "forbidden" }, { status: 403 }),
    );

    const response = await POST(request({ userId: "review-user" }));

    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("대상 입력과 존재 여부를 검증한다", async () => {
    const missingId = await POST(request({}));
    expect(missingId.status).toBe(400);
    expect(await missingId.json()).toMatchObject({ error: "missing_userId" });

    mocks.targetRows = [];
    const missingUser = await POST(request({ userId: "missing" }));
    expect(missingUser.status).toBe(404);
    expect(await missingUser.json()).toMatchObject({ error: "user_not_found" });
  });

  it("ADMIN_EMAILS에 없는 대상 계정은 거절한다", async () => {
    mocks.targetRows = [
      { id: "normal-user", email: "normal@example.com", gameName: "일반" },
    ];

    const response = await POST(request({ userId: "normal-user" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "target_not_super_admin",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("캐릭터 또는 직업이 없으면 임의 생성하지 않는다", async () => {
    mocks.store.delete("character.v2");
    const noCharacter = await POST(request({ userId: "review-user" }));
    expect(noCharacter.status).toBe(409);
    expect(await noCharacter.json()).toMatchObject({
      error: "character_required",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();

    mocks.store.set("character.v2", { class: "none", level: 1 });
    const noClass = await POST(request({ userId: "review-user" }));
    expect(noClass.status).toBe(409);
    expect(await noClass.json()).toMatchObject({ error: "class_required" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("세 저장값을 상향하고 파생 최대 HP와 MP로 회복한 뒤 감사 로그를 남긴다", async () => {
    const response = await POST(request({ userId: "review-user" }));
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      level: 100,
      frontierDepth: MAX_FRONTIER_DEPTH,
      gold: 1_000_000_000,
      bankedGold: 1_000_000_000,
      fame: 1_000_000,
      hpCharges: 100_000,
      mpCharges: 100_000,
    });
    expect(mocks.lock.mock.calls.map((call) => call[2])).toEqual([
      "character.v2",
      "proficiency.v2",
      "inventory.v2",
    ]);
    expect(mocks.upsert).toHaveBeenCalledWith(
      mocks.tx,
      "review-user",
      "character.v2",
      expect.objectContaining({
        level: 100,
        hp: 9_999,
        mp: 8_888,
        questFlag: "preserve",
      }),
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      mocks.tx,
      "review-user",
      "proficiency.v2",
      expect.objectContaining({ points: 1_000_000 }),
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      mocks.tx,
      "review-user",
      "inventory.v2",
      expect.objectContaining({ hpCharges: 100_000, mpCharges: 100_000 }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        adminEmail: "operator@example.com",
        action: "review-op-preset.apply",
        targetUserId: "review-user",
        detail: expect.objectContaining({
          gameName: "심의자",
          before: expect.objectContaining({ level: 20, frontierDepth: 5 }),
          after: expect.objectContaining({
            level: 100,
            frontierDepth: MAX_FRONTIER_DEPTH,
            proficiencyPoints: 1_000_000,
          }),
        }),
      }),
    );
  });
});
