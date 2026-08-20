import { beforeEach, describe, expect, it, vi } from "vitest";

const { rollout, store } = vi.hoisted(() => ({
  rollout: { active: false },
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  },
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx, _uid, key: string, fallback: unknown) =>
      store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSaves: vi.fn(async (_tx, _uid, fallbacks: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(fallbacks).map(([key, fallback]) => [
        key,
        store.has(key) ? store.get(key) : fallback,
      ]),
    ),
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

vi.mock("@/lib/server/jobUnlockContext", () => ({
  readJobUnlockContext: vi.fn(async () => ({
    jobSpRebalance: {
      startedAt: rollout.active ? 1 : null,
      endsAt: rollout.active ? Number.MAX_SAFE_INTEGER : null,
      active: rollout.active,
    },
  })),
}));

import { POST } from "@/app/api/v2/me/loadout/route";

const LIFESTYLE_SKILL = "v2c_farmer_seedselection";

function request(equipped: string[]): Request {
  return new Request("http://t/api/v2/me/loadout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ equipped }),
  });
}

describe("POST /api/v2/me/loadout — 생활 패시브", () => {
  beforeEach(() => {
    rollout.active = false;
    store.clear();
    store.set("character.v2", { class: "survivor", level: 1 });
    store.set("skills.v2", {
      learned: [LIFESTYLE_SKILL],
      equipped: [],
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: {},
      caps: {},
      grown: {},
    });
  });

  it("요청에서 빠진 학습 생활 패시브도 응답과 저장값에 포함한다", async () => {
    const response = await POST(request([]));
    const json = (await response.json()) as {
      ok?: boolean;
      equipped?: string[];
    };

    expect(response.status).toBe(200);
    expect(json.equipped).toEqual([LIFESTYLE_SKILL]);
    expect(
      (store.get("skills.v2") as { equipped: string[] }).equipped,
    ).toEqual([LIFESTYLE_SKILL]);
  });
});

describe("POST /api/v2/me/loadout — 직업 SP 조정 유예", () => {
  const replacement = "v2c_myriadvenom_mutation";
  const equipped = [
    "v2c_vajraarhat_body",
    "v2c_blackmoon_dominion",
    "v2c_elementallord_surge",
    "v2c_primordialmage_return",
  ];

  beforeEach(() => {
    rollout.active = true;
    store.clear();
    store.set("character.v2", { class: "survivor", level: 1 });
    store.set("skills.v2", {
      learned: [...equipped, replacement],
      equipped,
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: {},
      caps: {},
      grown: {},
    });
  });

  it("초과 상태가 남아도 기존 스킬 하나를 해제해 사용 SP를 줄일 수 있다", async () => {
    const next = equipped.slice(1);
    const response = await POST(request(next));
    const json = (await response.json()) as {
      ok?: boolean;
      equipped?: string[];
      spUsed?: number;
      spBudget?: number;
    };

    expect(json.spUsed).toBeGreaterThan(json.spBudget ?? 0);
    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, equipped: next });
    expect(
      (store.get("skills.v2") as { equipped: string[] }).equipped,
    ).toEqual(next);
  });

  it.each([
    {
      label: "유예가 끝났으면",
      graceActive: false,
      next: equipped.slice(1),
    },
    {
      label: "다른 스킬을 추가하면",
      graceActive: true,
      next: [...equipped.slice(1), replacement],
    },
    {
      label: "해제 없이 순서만 바꾸면",
      graceActive: true,
      next: [...equipped].reverse(),
    },
  ])("$label 초과 로드아웃을 저장하지 않는다", async ({ graceActive, next }) => {
    rollout.active = graceActive;
    const response = await POST(request(next));
    const json = (await response.json()) as {
      ok?: boolean;
      overBudget?: boolean;
    };

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ ok: false, overBudget: true });
    expect(
      (store.get("skills.v2") as { equipped: string[] }).equipped,
    ).toEqual(equipped);
  });
});
