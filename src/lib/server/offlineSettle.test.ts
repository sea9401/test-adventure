// 오프라인 정산(코어루프) 통합 — huntCooldown.test.ts 와 같은 in-memory savesKv +
// coreLoopConfig importOriginal(flag만 on). offline-settle 가 runOneHunt 를 재사용해 누적
// 판수를 정산하고, lastBattleAt 을 realNow 로 전진(멱등)하는지 검증.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexMasteryGameplayEvent } from "@/lib/server/codexMasteryGameplay";

const { store, forceRareMap, recordCodexMasteryGameplayBatch } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  forceRareMap: { value: false },
  recordCodexMasteryGameplayBatch: vi.fn(
    async (
      _executor: unknown,
      _userId: string,
      _events: readonly CodexMasteryGameplayEvent[],
      _now: Date,
    ) => [],
  ),
}));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  // HUNT_COOLDOWN_MODE 도 덮는다(오프라인 정산은 쿨다운 모드 전용 — actual 은 false 계산).
  return { ...actual, V2_CORE_LOOP_V2: true, HUNT_COOLDOWN_MODE: true };
});
vi.mock("@/adventure/data/v2/rareMaps", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/adventure/data/v2/rareMaps")>();
  return {
    ...actual,
    rollRareMapDrop: (...args: Parameters<typeof actual.rollRareMapDrop>) =>
      forceRareMap.value ? "worn_map" : actual.rollRareMapDrop(...args),
  };
});

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => null),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: vi.fn(async () => {}),
  resolveUserDisplayName: vi.fn(async () => "이름 없는 모험가"),
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

import { POST } from "@/app/api/v2/me/offline-settle/route";

function settleRequest() {
  return new Request("http://test/api/v2/me/offline-settle", {
    method: "POST",
    headers: { "x-real-ip": "203.0.113.30" },
  });
}
import { HUNT_COOLDOWN_MS } from "@/adventure/data/v2/coreLoopConfig";
import { proficiencyPerKillAtDepth } from "@/adventure/data/v2/proficiency";
import { resetUserRateLimitForTests } from "@/lib/server/userRateLimit";
import { requiredExpToNext } from "@/lib/leveling";

function seedStrongWarrior(lastBattleAt: number, offlineSession = true) {
  store.clear();
  store.set("character.v2", {
    class: "warrior",
    level: 30,
    exp: 0,
    gold: 1000,
    hp: 999999,
    frontierDepth: 2,
    lastHuntDepth: 1, // 레거시 입구 깊이 → 대표 깊이 2로 정규화
    lastBattleAt,
    // 오프라인 사냥 세션 활성(시작=lastBattleAt) — 정산은 세션 켜진 동안만. 창=시작+2h.
    ...(offlineSession ? { offlineHuntStartedAt: lastBattleAt } : {}),
    atRiskGold: 0,
  });
  store.set("equipment.v2", {
    owned: [{ iid: "w1", id: "v2_cave_greatsword" }],
    equipped: { weapon: "w1" },
  });
  store.set("proficiency.v2", {
    groups: { warrior: { tier: 1, points: 0, cumLevel: 30 } },
    grown: { str: 50, vit: 50 },
  });
  store.set("skills.v2", { learned: [], equipped: [] });
  store.set("inventory.v2", { hpCharges: 0, mpCharges: 0 });
  store.set("adventure-log.v2", { monsters: {}, battleLosses: 0 });
}

function char() {
  return store.get("character.v2") as {
    gold: number;
    exp: number;
    lastBattleAt?: number;
  };
}

function setOfflineStopConfig(config: Record<string, unknown>) {
  store.set("character.v2", {
    ...(store.get("character.v2") as Record<string, unknown>),
    offlineHuntStopConfig: config,
  });
}

describe("POST /api/v2/me/offline-settle — 오프라인 정산(코어루프 on)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetUserRateLimitForTests();
    forceRareMap.value = false;
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 확정 승리
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("누적 판수만큼 정산 + 골드/EXP 증가 + lastBattleAt realNow 전진", async () => {
    const now = Date.now();
    seedStrongWarrior(now - 60_000); // 60s 비움 → 12판
    const goldBefore = char().gold;

    const res = await POST(settleRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      battles: number;
      accrued: number;
      wins: number;
      totalGold: number;
      totalExp: number;
      totalProficiency: number;
      totalMastery: number;
      depth: number;
    };
    expect(json.ok).toBe(true);
    expect(json.accrued).toBe(12); // offlineBattlesAccrued(60s) — 응답에 누적치 노출
    expect(json.battles).toBe(12); // 60s / 5s
    expect(json.wins).toBe(12); // 강한 전사 → 전승
    expect(json.depth).toBe(2);
    expect(json.totalGold).toBeGreaterThan(0);
    expect(json.totalExp).toBeGreaterThan(0);
    expect(json.totalProficiency).toBe(12 * proficiencyPerKillAtDepth(2));
    expect(json.totalMastery).toBe(12);

    // 세이브 권위 — 골드/EXP/숙련도 실제 누적.
    expect(char().gold).toBe(goldBefore + json.totalGold);
    expect(char().exp).toBeGreaterThan(0);
    const prof = store.get("proficiency.v2") as {
      points: number;
      groups: { warrior?: { cumLevel?: number } };
      jobCumLevel?: Record<string, number>;
    };
    expect(prof.points).toBe(json.totalProficiency);
    expect(prof.groups.warrior?.cumLevel).toBe(30 + json.totalMastery);
    expect(prof.jobCumLevel?.warrior).toBe(json.totalMastery);
    // lastBattleAt 가 realNow(±) 로 전진.
    expect(char().lastBattleAt!).toBeGreaterThanOrEqual(now);
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledOnce();
    const masteryEvents = recordCodexMasteryGameplayBatch.mock.calls[0]?.[2];
    expect(masteryEvents).toHaveLength(24);
    expect(masteryEvents?.filter((event) => event.category === "monster"))
      .toHaveLength(12);
    expect(masteryEvents?.filter((event) => event.category === "job"))
      .toHaveLength(12);
  });

  it("멱등 — 정산 직후 재호출은 battles 0(누적 0)", async () => {
    seedStrongWarrior(Date.now() - 60_000);
    const first = await POST(settleRequest());
    expect(((await first.json()) as { battles: number }).battles).toBe(12);

    const second = await POST(settleRequest());
    const j2 = (await second.json()) as { battles: number };
    expect(j2.battles).toBe(0); // lastBattleAt 이 now 로 전진 → 누적 0
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledOnce();
  });

  it("충전약 잔량 조건에 도달한 첫 판에서 세션을 종료한다", async () => {
    seedStrongWarrior(Date.now() - 60_000);
    setOfflineStopConfig({ potionEnabled: true, potionThreshold: 0 });

    const res = await POST(settleRequest());
    const json = (await res.json()) as {
      battles: number;
      stopped: string | null;
      active: boolean;
      remainingBattles: number;
    };
    expect(json).toMatchObject({
      battles: 1,
      stopped: "potion",
      active: false,
      remainingBattles: 0,
    });
    expect(
      (store.get("character.v2") as Record<string, unknown>)
        .offlineHuntStopConfig,
    ).toBeNull();
    expect(
      (store.get("character.v2") as Record<string, unknown>)
        .offlineHuntStartedAt,
    ).toBeNull();
    expect(((await (await POST(settleRequest())).json()) as { battles: number }).battles).toBe(0);
  });

  it("희귀 탐사맵을 발견한 첫 판에서 세션을 종료한다", async () => {
    seedStrongWarrior(Date.now() - 60_000);
    setOfflineStopConfig({ rareMapEnabled: true });
    forceRareMap.value = true;

    const res = await POST(settleRequest());
    const json = (await res.json()) as {
      battles: number;
      stopped: string | null;
      active: boolean;
    };
    expect(json).toMatchObject({
      battles: 1,
      stopped: "rare_map",
      active: false,
    });
  });

  it("레벨 100에 도달한 첫 판에서 세션을 종료한다", async () => {
    seedStrongWarrior(Date.now() - 60_000);
    store.set("character.v2", {
      ...(store.get("character.v2") as Record<string, unknown>),
      level: 99,
      exp: requiredExpToNext(99)! - 1,
    });
    setOfflineStopConfig({ level100Enabled: true });

    const res = await POST(settleRequest());
    const json = (await res.json()) as {
      battles: number;
      stopped: string | null;
      active: boolean;
      finalLevel: number;
    };
    expect(json).toMatchObject({
      battles: 1,
      stopped: "level_100",
      active: false,
      finalLevel: 100,
    });
  });

  it("긴 정산은 50판 배치로 커넥션을 반납하고 다음 요청에서 이어간다", async () => {
    seedStrongWarrior(Date.now() - 60 * HUNT_COOLDOWN_MS);

    const first = await POST(settleRequest());
    const firstJson = (await first.json()) as {
      battles: number;
      accrued: number;
      remainingBattles: number;
    };
    expect(firstJson).toMatchObject({
      battles: 50,
      accrued: 60,
      remainingBattles: 10,
    });

    const second = await POST(settleRequest());
    const secondJson = (await second.json()) as {
      battles: number;
      accrued: number;
      remainingBattles: number;
    };
    expect(secondJson).toMatchObject({
      battles: 10,
      accrued: 10,
      remainingBattles: 0,
    });
  });

  it("누적 없음(방금 전투) = battles 0, 세이브 무변경", async () => {
    seedStrongWarrior(Date.now() - HUNT_COOLDOWN_MS + 1000); // 쿨다운 1판 미만
    const res = await POST(settleRequest());
    const json = (await res.json()) as { battles: number };
    expect(json.battles).toBe(0);
    expect(char().exp).toBe(0);
  });

  it("🔑세션 없음(오프라인 사냥 미시작) = battles 0 (opt-in) — 그냥 자리 비운다고 안 쌓임", async () => {
    seedStrongWarrior(Date.now() - 60_000, false); // 충분한 경과지만 세션 없음
    const res = await POST(settleRequest());
    const json = (await res.json()) as { battles: number; active?: boolean };
    expect(json.battles).toBe(0);
    expect(char().exp).toBe(0);
  });

  it("🔑창 끝 클램프 + 창 소진 시 세션 종료", async () => {
    const now = Date.now();
    seedStrongWarrior(now - 90_000); // lastBattleAt = 90초 전(12판분)
    // 세션은 2h+ 전 시작 → 창(시작+2h)이 이미 종료(now−30초). effectiveNow=창끝으로 클램프.
    const c = char() as Record<string, unknown>;
    c.offlineHuntStartedAt = now - 2 * 3600_000 - 30_000;
    store.set("character.v2", c);
    const res = await POST(settleRequest());
    const json = (await res.json()) as {
      battles: number;
      accrued: number;
      active: boolean;
    };
    // (창끝(now−30s) − lastBattleAt(now−90s)) / 5s = 12.
    expect(json.accrued).toBe(12);
    expect(json.active).toBe(false); // 창 소진 → 세션 종료
    expect(
      (char() as { offlineHuntStartedAt?: number | null }).offlineHuntStartedAt,
    ).toBeNull();
  });
});
