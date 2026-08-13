import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetUserRateLimitForTests } from "@/lib/server/userRateLimit";
import {
  ARENA_DAMAGE_MULTIPLIER,
  ARENA_SUSTAIN_MULTIPLIER,
} from "@/lib/server/arena";

const mocks = vi.hoisted(() => ({
  userId: "viewer" as string | null,
  target: {
    userId: "target",
    name: "상대",
    level: 77,
    avatar: "female2",
    profileBorder: null,
  } as Record<string, unknown> | null,
  viewerCombatant: {
    name: "나",
    level: 80,
    player: { hp: 100, maxHp: 100, mp: 20, maxMp: 20 },
    skills: { learned: [], equipped: [] },
  } as Record<string, unknown> | null,
  targetCombatant: {
    name: "상대",
    level: 77,
    player: { hp: 120, maxHp: 120, mp: 30, maxMp: 30 },
    skills: { learned: [], equipped: [] },
  } as Record<string, unknown> | null,
  resolveBattlePvP: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/friendlySparring", () => ({
  resolveFriendlySparringTarget: vi.fn(async () => mocks.target),
  prepareFriendlySparringCombatant: vi.fn(async (userId: string) =>
    userId === "viewer" ? mocks.viewerCombatant : mocks.targetCombatant,
  ),
}));
vi.mock("@/adventure/v2/combat/engine-pvp", () => ({
  resolveBattlePvP: mocks.resolveBattlePvP,
}));
vi.mock("@/adventure/data/v2/replayPayload", () => ({
  toPvpReplayPayload: vi.fn(() => ({
    enemy: { name: "상대", hp: 120 },
    playerMaxHp: 100,
    log: [],
  })),
}));

import { GET, POST } from "./route";

function getRequest(name = "상대") {
  return new Request(
    `http://local/api/v2/training/friendly?name=${encodeURIComponent(name)}`,
  );
}

function postRequest(name = "상대") {
  return new Request("http://local/api/v2/training/friendly", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetName: name }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetUserRateLimitForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-14T00:00:00Z"));
  mocks.userId = "viewer";
  mocks.target = {
    userId: "target",
    name: "상대",
    level: 77,
    avatar: "female2",
    profileBorder: null,
  };
  mocks.viewerCombatant = {
    name: "나",
    level: 80,
    player: { hp: 100, maxHp: 100, mp: 20, maxMp: 20 },
    skills: { learned: [], equipped: [] },
  };
  mocks.targetCombatant = {
    name: "상대",
    level: 77,
    player: { hp: 120, maxHp: 120, mp: 30, maxMp: 30 },
    skills: { learned: [], equipped: [] },
  };
  mocks.resolveBattlePvP.mockReturnValue({
    outcome: "p1_win",
    turns: 7,
    finalState: { p1: {}, p2: {}, log: [] },
  });
});

describe("GET /api/v2/training/friendly", () => {
  it("로그인한 유저에게 공개 상대 요약만 반환한다", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      target: {
        name: "상대",
        level: 77,
        avatar: "female2",
        profileBorder: null,
      },
    });
  });

  it("인증 실패와 숨겨진 대상을 구분된 상태 코드로 거부한다", async () => {
    mocks.userId = null;
    expect((await GET(getRequest())).status).toBe(401);

    mocks.userId = "viewer";
    mocks.target = null;
    const missing = await GET(getRequest());
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      ok: false,
      error: "target_not_found",
    });
  });
});

describe("POST /api/v2/training/friendly", () => {
  it("아레나 PvP 보정으로 읽기 전용 친선전을 계산한다", async () => {
    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    expect(mocks.resolveBattlePvP).toHaveBeenCalledWith(
      expect.objectContaining({ hp: 100 }),
      expect.objectContaining({ hp: 120 }),
      "나",
      "상대",
      expect.objectContaining({
        damageMultiplier: ARENA_DAMAGE_MULTIPLIER,
        sustainMultiplier: ARENA_SUSTAIN_MULTIPLIER,
        v2Skills: {
          p1: { learned: [], equipped: [] },
          p2: { learned: [], equipped: [] },
        },
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      result: {
        outcome: "win",
        turns: 7,
        opponent: { name: "상대", level: 77 },
        startPlayerHp: 100,
        cooldownMs: 10_000,
        replay: { enemy: { name: "상대" } },
      },
    });
  });

  it("성립한 전투 뒤 10초 동안 같은 도전자의 재요청을 막는다", async () => {
    expect((await POST(postRequest())).status).toBe(200);
    const second = await POST(postRequest());
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toMatchObject({
      ok: false,
      error: "cooldown",
      retryAfterSec: 10,
    });
    expect(mocks.resolveBattlePvP).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    expect((await POST(postRequest())).status).toBe(200);
  });

  it("대상이나 내 전투원을 만들 수 없으면 쿨타임을 소비하지 않는다", async () => {
    mocks.target = null;
    expect((await POST(postRequest())).status).toBe(404);

    mocks.target = {
      userId: "target",
      name: "상대",
      level: 77,
      avatar: "female2",
      profileBorder: null,
    };
    mocks.viewerCombatant = null;
    expect((await POST(postRequest())).status).toBe(400);

    mocks.viewerCombatant = {
      name: "나",
      level: 80,
      player: { hp: 100, maxHp: 100, mp: 20, maxMp: 20 },
      skills: { learned: [], equipped: [] },
    };
    expect((await POST(postRequest())).status).toBe(200);
  });
});
