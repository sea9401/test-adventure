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

import { POST } from "@/app/api/v2/me/advance-class/route";
import {
  parseProficiency,
  usablePoints,
} from "@/adventure/data/v2/proficiency";
import { parseV2Class } from "@/adventure/data/v2/classes";
import {
  TIER5_UNLOCK_CUMLEVEL,
  TIER6_UNLOCK_CUMLEVEL,
} from "@/adventure/data/v2/v2JobCatalog";
import { miningXpForLevel } from "@/adventure/v2/miningProgression";
import { woodcuttingXpForLevel } from "@/adventure/v2/woodcuttingProgression";

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
    growthRespecPoints: 20,
  });
  store.set("skills.v2", { learned: [], equipped: [] });
}

function storedUsable(): number {
  return usablePoints(parseProficiency(store.get("proficiency.v2")));
}

describe("advance-class — 전직 후 숙달 포인트 유지(#1220 전역화 회귀 가드)", () => {
  it("Lv.100 전투 생애 완료 시 최신 영구 범위로 새 Lv.1 자원을 굴린다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    seed("warrior", "warrior", 5000);
    store.set("proficiency.v2", {
      ...(store.get("proficiency.v2") as Record<string, unknown>),
      lifeResourceGrowth: {
        version: 1,
        rolledLevel: 100,
        baseHp: 999,
        baseMp: 999,
        gainedHp: 999,
        gainedMp: 999,
      },
    });

    const res = await POST(advanceReq("warrior"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      lifeResources: {
        maxHp: 150,
        maxMp: 65,
        hpPerLevel: { min: 8, max: 12 },
        mpPerLevel: { min: 3, max: 9 },
      },
    });
    expect(
      parseProficiency(store.get("proficiency.v2")).lifeResourceGrowth,
    ).toEqual({
      version: 1,
      rolledLevel: 1,
      baseHp: 150,
      baseMp: 65,
      gainedHp: 0,
      gainedMp: 0,
    });
  });

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
      jobHistory?: string[];
    };
    expect(stored.points).toBe(5000);
    expect(stored.jobHistory).toEqual(["mage", "warrior"]);
    expect(stored).toMatchObject({ grown: {}, growthRespecPoints: 0 });
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
    expect(parseProficiency(store.get("proficiency.v2")).reincarnations).toBe(1);
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

  it("병사→생존자 전직: 200·class=survivor·포인트 유지(루트 직업 전환)", async () => {
    seed("warrior", "warrior", 888);
    expect(storedUsable()).toBe(888);

    const res = await POST(advanceReq("survivor"));
    const json = (await res.json()) as { ok?: boolean; reincarnated?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const char = store.get("character.v2") as { class: unknown; level?: number };
    expect(parseV2Class(char.class)).toBe("survivor");
    expect(char.level).toBe(1);
    expect(storedUsable()).toBe(888);
  });

  it("미인식(카탈로그 미존재) 타겟은 bad_target", async () => {
    // 현재 허용 루트는 none/survivor. 여기선 미존재 타겟(!jobDef)으로 거부 경로를 검증한다.
    seed("warrior", "warrior", 100);
    const res = await POST(advanceReq("__not_a_job__"));
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(400);
    expect(json.error).toBe("bad_target");
  });

  it("공개된 7차 직업 타겟은 bad_target 대신 최초 전직 조건을 검사한다", async () => {
    seed("warrior", "warrior", 100);

    const res = await POST(advanceReq("shadowblade"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "tier7_prerequisite_proficiency",
    });
  });
});

describe("advance-class — 생활 직업 레벨 조건", () => {
  function seedLifestyleCandidate(specChoice: "miner" | "lumberjack"): void {
    store.clear();
    store.set("character.v2", {
      class: "survivor",
      specChoice,
      level: 100,
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: {
        survivor: { cultivations: 0, tier: 1, cumLevel: 900 },
      },
      caps: {},
      grown: {},
    });
    store.set("skills.v2", { learned: [], equipped: [] });
  }

  it("생산 직업은 Lv.1에서 재전직할 수 있지만 업적 횟수에는 포함하지 않는다", async () => {
    seedLifestyleCandidate("miner");
    store.set("character.v2", {
      class: "survivor",
      specChoice: "miner",
      level: 1,
    });
    const seededProf = store.get("proficiency.v2") as Record<string, unknown>;
    const lifeResourceGrowth = {
      version: 1,
      rolledLevel: 1,
      baseHp: 142,
      baseMp: 81,
      gainedHp: 0,
      gainedMp: 0,
    };
    store.set("proficiency.v2", {
      ...seededProf,
      reincarnations: 7,
      lifeResourceGrowth,
    });

    // 같은 생활직을 반복 선택해도 전직 자체는 허용하되 재전직 업적을 올릴 수 없다.
    for (let i = 0; i < 2; i += 1) {
      const res = await POST(advanceReq("miner"));
      const json = (await res.json()) as { ok?: boolean; reincarnated?: boolean };
      expect(res.status).toBe(200);
      expect(json).toMatchObject({ ok: true, reincarnated: true });
    }
    const stored = parseProficiency(store.get("proficiency.v2"));
    expect(stored.reincarnations).toBe(7);
    expect(stored.lifeResourceGrowth).toEqual(lifeResourceGrowth);
  });

  it("레거시 생활직 전환은 생애 기록을 새로 만들지 않는다", async () => {
    seedLifestyleCandidate("miner");
    store.set("character.v2", {
      class: "survivor",
      specChoice: "miner",
      level: 1,
    });

    const res = await POST(advanceReq("miner"));

    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("lifeResources");
    expect(
      parseProficiency(store.get("proficiency.v2")).lifeResourceGrowth,
    ).toBeUndefined();
  });

  it("전투 직업은 여전히 캐릭터 Lv.100을 요구한다", async () => {
    seed("warrior", "warrior", 0);
    store.set("character.v2", {
      class: "warrior",
      specChoice: null,
      level: 1,
    });

    const res = await POST(advanceReq("warrior"));
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      required?: number;
    };
    expect(res.status).toBe(400);
    expect(json).toMatchObject({
      ok: false,
      error: "level_too_low",
      required: 100,
    });
  });

  it("광부가 채광 Lv.10이면 광산 기술자로 전직된다", async () => {
    seedLifestyleCandidate("miner");
    store.set("mining-log.v1", {
      successes: 324,
      xp: miningXpForLevel(10),
      oreEarned: 324,
      byproductsEarned: 0,
      nodes: {},
    });

    const res = await POST(advanceReq("miningtechnician"));
    const json = (await res.json()) as { ok?: boolean; spec?: string | null };
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, spec: "miningtechnician" });
  });

  it("광부라도 채광 Lv.10 미만이면 광산 기술자 전직을 거절한다", async () => {
    seedLifestyleCandidate("miner");
    store.set("mining-log.v1", {
      successes: 323,
      xp: miningXpForLevel(10) - 1,
      oreEarned: 323,
      byproductsEarned: 0,
      nodes: {},
    });

    const res = await POST(advanceReq("miningtechnician"));
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(400);
    expect(json).toMatchObject({ ok: false, error: "job_locked" });
  });

  it("나무꾼의 기존 벌목 Lv.10 산림 기술자 전직도 유지된다", async () => {
    seedLifestyleCandidate("lumberjack");
    store.set("woodcutting-log.v1", {
      cuts: 324,
      xp: woodcuttingXpForLevel(10),
      timberEarned: 324,
      byproductsEarned: 0,
      trees: {},
    });

    const res = await POST(advanceReq("foresttechnician"));
    const json = (await res.json()) as { ok?: boolean; spec?: string | null };
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, spec: "foresttechnician" });
  });
});

describe("advance-class — 과거 직업 재방문", () => {
  it("과거 직업에서는 Lv.1에도 다른 직업으로 나갈 수 있고 환생 횟수는 올리지 않는다", async () => {
    seed("mage", "mage", 5000);
    const seededProf = store.get("proficiency.v2") as Record<string, unknown>;
    store.set("proficiency.v2", {
      ...seededProf,
      reincarnations: 4,
      jobHistory: ["warrior", "mage"],
      jobCumLevel: { warrior: 30, mage: 200 },
    });

    // 정상적인 Lv.100 전직으로 예전에 수련했던 병사에 돌아온다.
    const returned = await POST(advanceReq("warrior"));
    expect(returned.status).toBe(200);
    expect(await returned.json()).toMatchObject({
      ok: true,
      revisitExpedited: true,
    });
    expect(store.get("character.v2")).toMatchObject({
      class: "warrior",
      level: 1,
      revisitJobId: "warrior",
    });
    expect(parseProficiency(store.get("proficiency.v2")).reincarnations).toBe(5);

    // 놓친 스킬을 배웠다고 가정하고, 재육성 없이 곧바로 마법사로 복귀한다.
    const left = await POST(advanceReq("mage"));
    expect(left.status).toBe(200);
    expect(await left.json()).toMatchObject({
      ok: true,
      revisitExpedited: true,
    });
    expect(store.get("character.v2")).toMatchObject({
      class: "mage",
      level: 1,
      revisitJobId: "mage",
    });
    // Lv.1 조기 이동은 전투직 재전직 업적을 올리지 않는다.
    expect(parseProficiency(store.get("proficiency.v2")).reincarnations).toBe(5);
  });

  it("재방문하지 않은 전투 직업은 다른 직업으로 갈 때도 Lv.100이 필요하다", async () => {
    seed("warrior", "warrior", 0);
    store.set("character.v2", {
      class: "warrior",
      specChoice: null,
      level: 1,
    });

    const res = await POST(advanceReq("mage"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "level_too_low",
      required: 100,
    });
  });

  it("재방문 패스로 같은 직업을 Lv.1에서 반복 초기화할 수는 없다", async () => {
    seed("warrior", "warrior", 0);
    store.set("character.v2", {
      class: "warrior",
      specChoice: null,
      level: 1,
      revisitJobId: "warrior",
    });

    const res = await POST(advanceReq("warrior"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "level_too_low",
      required: 100,
    });
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

describe("advance-class — 5차 전직 조건", () => {
  function seedTier5Candidate(): void {
    store.clear();
    store.set("character.v2", {
      class: "warrior",
      specChoice: "veteran",
      level: 100,
      materials: {},
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: { warrior: { cultivations: 0, tier: 1, cumLevel: 0 } },
      jobCumLevel: { veteran: TIER5_UNLOCK_CUMLEVEL },
      caps: {},
      grown: {},
    });
    store.set("skills.v2", { learned: [], equipped: [] });
  }

  it("5차 신규 전직은 숙련도만 충족하면 도감 없이 통과한다", async () => {
    seedTier5Candidate();
    const passed = await POST(advanceReq("swordmaster"));
    const passedJson = (await passed.json()) as { ok?: boolean };
    expect(passed.status).toBe(200);
    expect(passedJson.ok).toBe(true);
  });
});

describe("advance-class — 6차 전직 조건", () => {
  function seedTier6Candidate(): void {
    store.clear();
    store.set("character.v2", {
      class: "survivor",
      specChoice: "immortal",
      level: 100,
      materials: {},
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: { survivor: { cultivations: 0, tier: 1, cumLevel: 0 } },
      jobCumLevel: { immortal: TIER6_UNLOCK_CUMLEVEL },
      caps: {},
      grown: {},
    });
    store.set("skills.v2", { learned: [], equipped: [] });
  }

  it("영겁자는 불멸자 숙련도 TIER6 충족 시 전직된다", async () => {
    seedTier6Candidate();
    const res = await POST(advanceReq("eternal"));
    const json = (await res.json()) as {
      ok?: boolean;
      class?: string;
      spec?: string | null;
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.class).toBe("survivor");
    expect(json.spec).toBe("eternal");

    const char = store.get("character.v2") as {
      class?: string;
      specChoice?: string | null;
      level?: number;
    };
    expect(char.class).toBe("survivor");
    expect(char.specChoice).toBe("eternal");
    expect(char.level).toBe(1);
  });
});
