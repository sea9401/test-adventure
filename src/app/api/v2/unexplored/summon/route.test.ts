import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  featureEnabled: true,
  userId: "summoner-1" as string | null,
  character: {} as Record<string, unknown>,
  createResult: {
    ok: true as const,
    sessionId: "personal-session",
    expiresAt: 123_456,
  },
  createCoopBossSession: vi.fn(),
  upsertSave: vi.fn(),
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
  db: { transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})) },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => structuredClone(mocks.character)),
  readSave: vi.fn(async () => ({ name: "개척자" })),
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/v2Coop", () => ({
  createCoopBossSession: mocks.createCoopBossSession,
}));

import { POST } from "./route";
import { UNEXPLORED_BOSSES } from "@/adventure/data/v2/unexploredBosses";

const BOSS = UNEXPLORED_BOSSES.tracking_weapon;

function request(body: unknown) {
  return new Request("http://localhost/api/v2/unexplored/summon", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.featureEnabled = true;
  mocks.userId = "summoner-1";
  mocks.character = {
    level: 1,
    materials: { [BOSS.summonMaterialId]: 1 },
    unexplored: { selectedNodeIds: [] },
  };
  mocks.createCoopBossSession.mockResolvedValue(mocks.createResult);
  mocks.upsertSave.mockResolvedValue(undefined);
});

describe("POST /api/v2/unexplored/summon", () => {
  it("관련 노드가 꺼져 있고 100레벨 미만이어도 보유 소환석을 사용한다", async () => {
    const response = await POST(request({ bossId: "tracking_weapon" }));
    expect(response.status).toBe(200);
    expect(mocks.createCoopBossSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kindId: "tracking_weapon",
        userId: "summoner-1",
        visibility: "summoner_only",
      }),
    );
    expect(mocks.upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "summoner-1",
      "character.v2",
      expect.objectContaining({ materials: {} }),
    );
  });

  it("불멸의 광전왕 소환석 1개로 소환자 전용 세션을 만든다", async () => {
    const immortal = UNEXPLORED_BOSSES.immortal_berserker;
    mocks.character = {
      level: 1,
      materials: { [immortal.summonMaterialId]: 1 },
      unexplored: { selectedNodeIds: [] },
    };

    const response = await POST(request({ bossId: "immortal_berserker" }));

    expect(response.status).toBe(200);
    expect(mocks.createCoopBossSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kindId: "immortal_berserker",
        visibility: "summoner_only",
      }),
    );
    expect(mocks.upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "summoner-1",
      "character.v2",
      expect.objectContaining({ materials: {} }),
    );
  });

  it("소환석이 부족하면 세션도 저장도 만들지 않는다", async () => {
    mocks.character = { materials: {} };
    const response = await POST(request({ bossId: "tracking_weapon" }));
    expect(response.status).toBe(409);
    expect(mocks.createCoopBossSession).not.toHaveBeenCalled();
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("활성 세션 상한이면 소환석을 보존한다", async () => {
    mocks.createCoopBossSession.mockResolvedValue({
      ok: false,
      error: "too_many_active",
      cap: 50,
    });
    const response = await POST(request({ bossId: "tracking_weapon" }));
    expect(response.status).toBe(409);
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });
});

describe("POST /api/v2/unexplored/summon — 위험도", () => {
  const withProgress = (unexplored: Record<string, unknown>) => {
    mocks.character = {
      level: 100,
      materials: { [BOSS.summonMaterialId]: 2 },
      unexplored: { selectedNodeIds: [], ...unexplored },
    };
  };

  it("위험도를 보내지 않으면 지금처럼 위험도 0으로 소환한다", async () => {
    const response = await POST(request({ bossId: "tracking_weapon" }));

    expect(response.status).toBe(200);
    expect(mocks.createCoopBossSession.mock.calls[0][1]).toMatchObject({ riskTier: 0 });
    expect((await response.json()).riskTier).toBe(0);
  });

  it("그 보스를 처치한 적이 없으면 위험도 1로 소환할 수 없고 소환석을 지킨다", async () => {
    const response = await POST(request({ bossId: "tracking_weapon", riskTier: 1 }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: "risk_tier_locked", maxRiskTier: 0 });
    expect(mocks.createCoopBossSession).not.toHaveBeenCalled();
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("처치한 위험도 다음 단계까지 소환할 수 있다", async () => {
    withProgress({ achievementIds: ["defeat_tracking_weapon"], bossRisk: { tracking_weapon: 3 } });

    const locked = await POST(request({ bossId: "tracking_weapon", riskTier: 5 }));
    expect(locked.status).toBe(409);
    expect((await locked.json()).maxRiskTier).toBe(4);

    const response = await POST(request({ bossId: "tracking_weapon", riskTier: 4 }));
    expect(response.status).toBe(200);
    expect(mocks.createCoopBossSession.mock.calls[0][1]).toMatchObject({ kindId: "tracking_weapon", riskTier: 4 });
    expect((await response.json()).riskTier).toBe(4);
  });

  it("다른 보스의 기록으로는 위험도가 열리지 않는다", async () => {
    withProgress({ achievementIds: ["defeat_glacial_colossus"], bossRisk: { glacial_colossus: 9 } });

    expect((await POST(request({ bossId: "tracking_weapon", riskTier: 1 }))).status).toBe(409);
  });

  it.each([-1, 1.5, "2", 61])("잘못된 위험도 %s 는 거절한다", async (riskTier) => {
    withProgress({ achievementIds: ["defeat_tracking_weapon"], bossRisk: { tracking_weapon: 60 } });

    const response = await POST(request({ bossId: "tracking_weapon", riskTier }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_risk_tier");
    expect(mocks.createCoopBossSession).not.toHaveBeenCalled();
  });
});
