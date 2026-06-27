// 전직(advance-class) 라우트 통합 테스트 — 핸들러를 in-memory savesKv 스토어 위에서 end-to-end
// 로 돌린다(huntRoute.test 하니스 패턴). DB 경계(ensureUser·db.transaction·savesKv)만 모킹하고
// 라우트 본문(전직 변형·proficiency write)·proficiency 파싱은 REAL 코드.
//
// 회귀 가드(#1220): 숙달 포인트는 캐릭터 전역 통화라 전직(재전직/환생)해도 유지돼야 한다.
//   옛 버그=직군별 저장이라 다른 직군으로 가면 0 으로 보였다. 세이브를 옛 직군별 포맷으로 심어
//   마이그(직군별→전역 합산)까지 함께 검증한다. 재전직 경로(코어루프)를 타도록 플래그 강제 ON.

import { describe, it, expect, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: true };
});
vi.mock("@/lib/server/v2QuestContext", () => ({
  loadCompletedQuestIds: vi.fn(async () => [] as string[]),
}));
vi.mock("@/db", () => {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.for = () => chain;
  chain.limit = async () => [];
  const tx = {
    select: () => chain,
    insert: () => ({
      values: () => ({ onConflictDoUpdate: async () => undefined }),
    }),
  };
  return {
    db: {
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      select: () => chain,
    },
  };
});
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/me/advance-class/route";
import {
  parseProficiency,
  usablePoints,
} from "@/adventure/data/v2/proficiency";
import { parseV2Class } from "@/adventure/data/v2/classes";

function advanceReq(targetJobId: string): Request {
  return new Request("http://t/api/v2/me/advance-class", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetJobId }),
  });
}

// 만렙 + 옛 직군별 포맷 proficiency(해당 직군에 points)로 세이브를 심는다.
function seed(activeClass: string, group: string, points: number): void {
  store.clear();
  store.set("character.v2", {
    class: activeClass,
    level: 100,
    specChoice: null,
  });
  store.set("proficiency.v2", {
    groups: { [group]: { points, cultivations: 3, tier: 2, cumLevel: 200 } },
    caps: { int: 40 },
    grown: { int: 30 },
  });
  store.set("skills.v2", { learned: [], equipped: [] });
}

function storedUsable(): number {
  return usablePoints(parseProficiency(store.get("proficiency.v2")));
}

describe("advance-class — 전직 후 숙달 포인트 유지(#1220 전역화 회귀 가드)", () => {
  it("다른 직군으로 재전직(마법사→병사): 포인트 유지 + 활성 직업만 변경", async () => {
    seed("mage", "mage", 5000);
    // 전직 전: 옛 직군별 5000 이 전역으로 합산.
    expect(storedUsable()).toBe(5000);

    const res = await POST(advanceReq("warrior"));
    const json = (await res.json()) as {
      ok?: boolean;
      reincarnated?: boolean;
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.reincarnated).toBe(true);

    // 전직 후: 사용가능 잔액 그대로 5000(사라지지 않음).
    expect(storedUsable()).toBe(5000);

    // 활성 직업은 마법사 → 병사 계열로 변경.
    const char = store.get("character.v2") as { class: unknown };
    expect(parseV2Class(char.class)).not.toBe("mage");

    // 저장 형태: points 는 전역(top-level), 어떤 직군에도 group.points 없음.
    const stored = store.get("proficiency.v2") as {
      points?: number;
      groups?: Record<string, { points?: number }>;
    };
    expect(stored.points).toBe(5000);
    for (const g of Object.values(stored.groups ?? {})) {
      expect(g.points).toBeUndefined();
    }
  });

  it("같은 직업 환생(병사→병사): 포인트 유지", async () => {
    seed("warrior", "warrior", 1234);
    expect(storedUsable()).toBe(1234);

    const res = await POST(advanceReq("warrior"));
    const json = (await res.json()) as { ok?: boolean; reincarnated?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.reincarnated).toBe(true);

    expect(storedUsable()).toBe(1234);
  });
});
