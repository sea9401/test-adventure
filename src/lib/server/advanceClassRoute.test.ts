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
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";

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

function materialCodex(count: number): Record<string, number> {
  return Object.fromEntries(
    Object.keys(V2_MATERIALS)
      .slice(0, count)
      .map((id) => [id, 1]),
  );
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

describe("advance-class — 모험가(none) 전직 허용(킷 재학습 경로)", () => {
  it("병사→모험가 전직: 200·class=none·포인트 유지(킷을 다시 배울 수 있게)", async () => {
    seed("warrior", "warrior", 777);
    expect(storedUsable()).toBe(777);

    const res = await POST(advanceReq("none"));
    const json = (await res.json()) as { ok?: boolean; reincarnated?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    // 활성 직업이 모험가(none)로 바뀌고, 숙달 포인트는 그대로 보존.
    const char = store.get("character.v2") as { class: unknown; level?: number };
    expect(parseV2Class(char.class)).toBe("none");
    expect(char.level).toBe(1); // 전직은 레벨 1 리셋(표준 동작).
    expect(storedUsable()).toBe(777);
  });

  it("미인식(카탈로그 미존재) 타겟은 bad_target", async () => {
    // none 만 tier0 허용 — 그 외 tier0(미래 추가분)은 가드 `tier===0 && id!=="none"` 로 차단되지만,
    //   현재 카탈로그 tier0 은 none 하나뿐이라 여기선 미존재 타겟(!jobDef)으로 거부 경로를 검증한다.
    seed("warrior", "warrior", 100);
    const res = await POST(advanceReq("__not_a_job__"));
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(400);
    expect(json.error).toBe("bad_target");
  });
});

describe("advance-class — 재전직/환생 진입 자체는 직업 숙련도를 더하지 않음", () => {
  it("재전직(병사→병사): 직군 숙련도 보존, 직업 숙련도 시드 없음", async () => {
    // 직업 숙련도는 사냥 승리에서만 +1. 전직/재전직은 레벨과 grown만 리셋한다.
    seed("warrior", "warrior", 500); // groups.warrior.cumLevel = 200
    const res = await POST(advanceReq("warrior"));
    expect(((await res.json()) as { ok?: boolean }).ok).toBe(true);

    const prof = parseProficiency(store.get("proficiency.v2"));
    expect(prof.groups.warrior?.cumLevel).toBe(200);
    expect(prof.jobCumLevel?.warrior).toBeUndefined();
  });

  it("다른 직업 전직(마법사→병사): 새 직군 숙련도 미생성, 기존 직군 보존", async () => {
    seed("mage", "mage", 500); // groups.mage.cumLevel = 200
    const res = await POST(advanceReq("warrior"));
    expect(((await res.json()) as { ok?: boolean }).ok).toBe(true);

    const prof = parseProficiency(store.get("proficiency.v2"));
    expect(prof.groups.warrior?.cumLevel ?? 0).toBe(0); // 진입만으로는 숙련도 미적립
    expect(prof.groups.mage?.cumLevel).toBe(200); // 기존 직군 숙련도 보존
    expect(prof.jobCumLevel?.warrior).toBeUndefined();
  });

  it("모험가(none) 전직도 숙련도 미적립", async () => {
    seed("warrior", "warrior", 500);
    const res = await POST(advanceReq("none"));
    expect(((await res.json()) as { ok?: boolean }).ok).toBe(true);

    const prof = parseProficiency(store.get("proficiency.v2"));
    // none 은 숙련도 미사용 — warrior 숙련도 보존, jobCumLevel.none 미적립.
    expect(prof.groups.warrior?.cumLevel).toBe(200);
    expect(prof.jobCumLevel?.none).toBeUndefined();
  });
});

describe("advance-class — 5차 도감 요건", () => {
  function seedTier5Candidate(materialCount: number): void {
    store.clear();
    store.set("character.v2", {
      class: "warrior",
      specChoice: "veteran",
      level: 100,
      materials: materialCodex(materialCount),
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: { warrior: { cultivations: 0, tier: 1, cumLevel: 0 } },
      jobCumLevel: { veteran: 7500 },
      caps: {},
      grown: {},
    });
    store.set("skills.v2", { learned: [], equipped: [] });
  }

  it("5차 신규 전직은 도감 8종을 요구한다", async () => {
    seedTier5Candidate(7);
    const blocked = await POST(advanceReq("swordmaster"));
    const blockedJson = (await blocked.json()) as {
      error?: string;
      required?: number;
      have?: number;
    };
    expect(blocked.status).toBe(400);
    expect(blockedJson).toMatchObject({
      error: "codex_incomplete",
      required: 8,
      have: 7,
    });

    seedTier5Candidate(8);
    const passed = await POST(advanceReq("swordmaster"));
    const passedJson = (await passed.json()) as { ok?: boolean };
    expect(passed.status).toBe(200);
    expect(passedJson.ok).toBe(true);
  });
});
