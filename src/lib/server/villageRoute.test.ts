// 정착지(마을) 라우트 통합 테스트 — build → produce → harvest → upgrade 5개 POST + GET 목록.
// v2 정착지는 codebase 에서 유일하게 테스트 없던 API 층(cleanup-audit). 여기서 메운다.
//
// 전략: @/lib/server/v2Settlement(DB I/O 경계) 만 STATEFUL in-memory 로 모킹하고, 순수 엔진
// (@/adventure/data/v2/settlement) 은 REAL 그대로 — 수확량·업그레이드 비용 수학이 진짜로 돈다.
//   - 마을 저장: outpostId → VillageRow Map (lock/upsert/read 가 같은 store 를 본다).
//   - 길드 재화: guildId → SettlementResources (lock/upsert/read 공유).
//   - 소유 가드: guildOwningOutpost 는 owners Map(outpostId → guildId) 로 점령 흉내.
//   - 시간: vi.setSystemTime 으로 Date.now() 제어 → 생산 완료/미완료를 결정화.
// db.transaction 은 더미 tx({}) 로 콜백을 그냥 실행(쿼리는 전부 모킹 헬퍼가 가로챔).
// huntRoute.test / enhanceRoute.test 의 vi.hoisted + vi.mock 패턴을 그대로 따른다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// terrainTraitOf 는 원천 모듈(outposts)에서 직접 import — v2Settlement 는 통째로 모킹되므로
// 그쪽 re-export 는 못 쓴다. normalizeVillageOwner 는 순수·짧아 모킹 안에서 직접 구현.
import { terrainTraitOf as realTerrainTraitOf } from "@/adventure/data/v2/outposts";
import {
  PRODUCTION_BASE_YIELD,
  PRODUCTION_DURATION_MS,
  SLOTS_BY_TIER,
  TRAIT_BONUS_PCT,
  UPGRADE_COST,
} from "@/adventure/data/v2/settlement";

// ── 공유 인메모리 스토어(호이스팅) ───────────────────────────────────────────
const { villages, resourcesByGuild, owners, guildState } = vi.hoisted(() => ({
  // outpostId → VillageRow (mock 모듈과 테스트가 같은 Map 참조)
  villages: new Map<string, unknown>(),
  // guildId → SettlementResources
  resourcesByGuild: new Map<number, Record<string, number>>(),
  // outpostId → 점령 중인 guildId (없으면 미점령)
  owners: new Map<string, number>(),
  // 현재 유저의 길드(getGuildId 계약). null = 길드 미가입 → guildOwningOutpost 가 null 반환.
  guildState: { current: null as number | null },
}));

const ME_USER = "u-settler";
const MY_GUILD = 42;

// 내 길드가 점령했다고 가정하는 거점들 — 지형 특성별 1개씩(REAL terrainTraitOf 기준).
const PLAIN_OUTPOST = "outpost_plain_fort"; // fort → plain (보너스 없음)
const FARM_OUTPOST = "village_wheatfield"; // village → farmland (작물 +30%)
const MINE_OUTPOST = "village_oremouth"; // override → mine (광물 +30%)

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => ME_USER as string | null),
}));

// GET 라우트는 getGuildId 를 직접 호출(guildOwningOutpost 미경유) → 별도 모킹.
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => MY_GUILD as number | null),
}));

// db.transaction 은 더미 tx 로 콜백만 실행(모든 쿼리는 v2Settlement 모킹이 대신함).
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) },
}));

// 핵심: DB I/O 헬퍼만 STATEFUL 모킹. 순수 헬퍼(normalize/terrain)는 REAL 을 위임.
vi.mock("@/lib/server/v2Settlement", () => {
  type Row = {
    outpostId: string;
    guildId: number;
    tier: "village" | "city" | "metropolis";
    name: string | null;
    jobs: Record<string, { kind: string; startedAt: number }>;
  };
  const clone = <T,>(v: T): T => structuredClone(v);
  return {
    // 소유 가드 — 실제 guildOwningOutpost 계약 재현: ① 유저가 길드 없으면(getGuildId→null) null,
    //   ② 길드는 있으나 이 거점을 그 길드가 점령 중이 아니면 null, ③ 점령 중이면 그 guildId.
    //   (라우트는 세 경우 모두 null → 403 not_owner 로 묶지만, no-guild 분기를 명시 구동한다.)
    guildOwningOutpost: vi.fn(
      async (_tx: unknown, _userId: string, outpostId: string) => {
        const mine = guildState.current;
        if (mine == null) return null; // 길드 미가입
        const occ = (owners as Map<string, number>).get(outpostId);
        return occ != null && occ === mine ? mine : null;
      },
    ),
    // 마을 lock+read — 없으면 null. 호출자가 변형 후 upsert 하므로 deep clone 으로 격리.
    lockVillage: vi.fn(async (_tx: unknown, outpostId: string) => {
      const row = (villages as Map<string, Row>).get(outpostId);
      return row ? clone(row) : null;
    }),
    upsertVillage: vi.fn(async (_tx: unknown, row: Row) => {
      (villages as Map<string, Row>).set(row.outpostId, clone(row));
    }),
    readVillagesOfGuild: vi.fn(async (_tx: unknown, guildId: number) =>
      [...(villages as Map<string, Row>).values()]
        .filter((v) => v.guildId === guildId)
        .map(clone),
    ),
    // 길드 재화 — lock/read 는 같은 obj 사본, upsert 는 저장.
    lockGuildSettlement: vi.fn(async (_tx: unknown, guildId: number) =>
      clone((resourcesByGuild as Map<number, object>).get(guildId) ?? {}),
    ),
    readGuildSettlement: vi.fn(async (_tx: unknown, guildId: number) =>
      clone((resourcesByGuild as Map<number, object>).get(guildId) ?? {}),
    ),
    upsertGuildSettlement: vi.fn(
      async (_tx: unknown, guildId: number, res: Record<string, number>) => {
        (resourcesByGuild as Map<number, object>).set(guildId, clone(res));
      },
    ),
    // 점령 이관 정규화 — REAL 로직과 동일(다른 길드면 소유 갱신 + 작물 비움). 순수·짧아 인라인.
    normalizeVillageOwner: (village: Row, guildId: number): Row =>
      village.guildId === guildId
        ? village
        : { ...village, guildId, jobs: {} },
    // 지형 특성은 REAL(outposts) 위임 → 보너스 수학이 진짜로 돈다.
    terrainTraitOf: (...args: Parameters<typeof realTerrainTraitOf>) =>
      realTerrainTraitOf(...args),
  };
});

// 라우트 핸들러 — 모킹 등록 후 import.
import { GET } from "@/app/api/v2/outpost/village/route";
import { POST as buildPOST } from "@/app/api/v2/outpost/village/build/route";
import { POST as producePOST } from "@/app/api/v2/outpost/village/produce/route";
import { POST as harvestPOST } from "@/app/api/v2/outpost/village/harvest/route";
import { POST as upgradePOST } from "@/app/api/v2/outpost/village/upgrade/route";
import { ensureUser } from "@/lib/server/ensureUser";

// ── 헬퍼 ────────────────────────────────────────────────────────────────────
const T0 = 1_700_000_000_000; // 고정 기준 시각

function jreq(body: unknown): Request {
  return new Request("http://t/api/v2/outpost/village/x", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

type AnyJson = Record<string, unknown>;

function setOwner(outpostId: string, guildId: number | null) {
  if (guildId == null) owners.delete(outpostId);
  else owners.set(outpostId, guildId);
}

// 점령됐고 이미 건설(name 부여)된 마을을 직접 시드(produce/harvest/upgrade 단축 시작점).
function seedBuiltVillage(
  outpostId: string,
  over?: Partial<{
    guildId: number;
    tier: "village" | "city" | "metropolis";
    name: string | null;
    jobs: Record<string, { kind: string; startedAt: number }>;
  }>,
) {
  const guildId = over?.guildId ?? MY_GUILD;
  setOwner(outpostId, guildId);
  // name: null 을 명시 전달(미명명 시드)할 수 있게 "in" 으로 구분 — ?? 는 null 을 흡수해버림.
  const name: string | null = over && "name" in over ? over.name ?? null : "내마을";
  villages.set(outpostId, {
    outpostId,
    guildId,
    tier: over?.tier ?? "village",
    name,
    jobs: over?.jobs ?? {},
  });
}

beforeEach(() => {
  villages.clear();
  resourcesByGuild.clear();
  owners.clear();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.mocked(ensureUser).mockResolvedValue(ME_USER);
  guildState.current = MY_GUILD; // 기본 = 유저가 내 길드 소속
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── GET (목록 + 재화) ───────────────────────────────────────────────────────
describe("GET /api/v2/outpost/village", () => {
  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(((await res.json()) as AnyJson).error).toBe("unauthorized");
  });

  it("happy — ok:true + serverNow + 내 길드 마을/재화 스냅샷", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      name: "밀밭",
      jobs: { "0": { kind: "crop", startedAt: T0 - 1000 } },
    });
    resourcesByGuild.set(MY_GUILD, { crop: 7 });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      villages: Array<{
        outpostId: string;
        name: string;
        trait: string;
        slotCount: number;
        slots: Array<{ slot: number; kind: string; ready: boolean }>;
      }>;
      resources: Record<string, number>;
      serverNow: number;
    };
    expect(json.ok).toBe(true);
    expect(json.serverNow).toBe(T0);
    expect(json.villages).toHaveLength(1);
    const v = json.villages[0];
    expect(v.outpostId).toBe(FARM_OUTPOST);
    expect(v.name).toBe("밀밭");
    expect(v.trait).toBe("farmland"); // REAL terrainTraitOf
    expect(v.slotCount).toBe(SLOTS_BY_TIER.village); // 1
    expect(v.slots[0].kind).toBe("crop");
    expect(v.slots[0].slot).toBe(0);
    expect(json.resources).toEqual({ crop: 7 });
  });

  it("길드 없음 — 빈 목록/빈 재화", async () => {
    const { getGuildId } = await import("@/lib/server/v2EnsureSoloGuild");
    vi.mocked(getGuildId).mockResolvedValueOnce(null);
    const res = await GET();
    const json = (await res.json()) as AnyJson;
    expect(json.ok).toBe(true);
    expect(json.villages).toEqual([]);
    expect(json.resources).toEqual({});
  });
});

// ── build (건설/명명) ───────────────────────────────────────────────────────
describe("POST /api/v2/outpost/village/build", () => {
  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await buildPOST(jreq({ outpostId: PLAIN_OUTPOST, name: "x" }));
    expect(res.status).toBe(401);
  });

  it("invalid json → 400 invalid_json", async () => {
    const res = await buildPOST(jreq("{not json"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as AnyJson).error).toBe("invalid_json");
  });

  it("빈 이름/긴 이름 → 400 invalid_name", async () => {
    setOwner(PLAIN_OUTPOST, MY_GUILD);
    const r1 = await buildPOST(jreq({ outpostId: PLAIN_OUTPOST, name: "  " }));
    expect(r1.status).toBe(400);
    expect(((await r1.json()) as AnyJson).error).toBe("invalid_name");
    const r2 = await buildPOST(
      jreq({ outpostId: PLAIN_OUTPOST, name: "a".repeat(17) }),
    );
    expect(r2.status).toBe(400);
  });

  it("내 길드 미점령 → 403 not_owner", async () => {
    setOwner(PLAIN_OUTPOST, 999); // 남의 길드
    const res = await buildPOST(jreq({ outpostId: PLAIN_OUTPOST, name: "마을" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_owner");
  });

  it("happy — 빈 공터에 새 마을 건설(name 부여, tier=village)", async () => {
    setOwner(PLAIN_OUTPOST, MY_GUILD);
    const res = await buildPOST(jreq({ outpostId: PLAIN_OUTPOST, name: " 새터  " }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson;
    expect(json.ok).toBe(true);
    expect(json.name).toBe("새터"); // trim 적용
    expect(json.tier).toBe("village");
    const stored = villages.get(PLAIN_OUTPOST) as { name: string; tier: string };
    expect(stored.name).toBe("새터");
    expect(stored.tier).toBe("village");
  });

  it("이미 이름 있는 마을 → 409 already_built", async () => {
    seedBuiltVillage(PLAIN_OUTPOST, { name: "기존" });
    const res = await buildPOST(jreq({ outpostId: PLAIN_OUTPOST, name: "새이름" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("already_built");
  });
});

// ── produce (생산 시작) ─────────────────────────────────────────────────────
describe("POST /api/v2/outpost/village/produce", () => {
  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, kind: "crop" }),
    );
    expect(res.status).toBe(401);
  });

  it("길드 미가입(getGuildId→null) → 403 not_owner", async () => {
    guildState.current = null; // 유저가 어떤 길드에도 없음 → 점령돼 있어도 차단
    seedBuiltVillage(FARM_OUTPOST);
    const res = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, kind: "crop" }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_owner");
  });

  it("invalid json → 400", async () => {
    const res = await producePOST(jreq("nope"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as AnyJson).error).toBe("invalid_json");
  });

  it("잘못된 slot(음수/비정수) → 400 invalid", async () => {
    seedBuiltVillage(FARM_OUTPOST);
    const r1 = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: -1, kind: "crop" }),
    );
    expect(r1.status).toBe(400);
    const r2 = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 1.5, kind: "crop" }),
    );
    expect(r2.status).toBe(400);
    expect(((await r2.json()) as AnyJson).error).toBe("invalid");
  });

  it("PRODUCTION_KINDS 밖 kind → 400 invalid", async () => {
    seedBuiltVillage(FARM_OUTPOST);
    const res = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, kind: "gold" }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as AnyJson).error).toBe("invalid");
  });

  it("미점령 → 403 not_owner", async () => {
    // village row 는 있지만 점령은 남의 길드 → guildOwningOutpost null.
    villages.set(FARM_OUTPOST, {
      outpostId: FARM_OUTPOST,
      guildId: 999,
      tier: "village",
      name: "남의것",
      jobs: {},
    });
    setOwner(FARM_OUTPOST, 999);
    const res = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, kind: "crop" }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_owner");
  });

  it("건설 안 됨(마을 없음 또는 name null) → 409 not_built", async () => {
    // 점령은 됐지만 village row 없음.
    setOwner(FARM_OUTPOST, MY_GUILD);
    const r1 = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, kind: "crop" }),
    );
    expect(r1.status).toBe(409);
    expect(((await r1.json()) as AnyJson).error).toBe("not_built");

    // village row 는 있지만 name == null(미명명) → 역시 not_built.
    seedBuiltVillage(FARM_OUTPOST, { name: null });
    const r2 = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, kind: "crop" }),
    );
    expect(r2.status).toBe(409);
    expect(((await r2.json()) as AnyJson).error).toBe("not_built");
  });

  it("happy — 빈 슬롯에 생산 시작(jobs 갱신, startedAt=now)", async () => {
    seedBuiltVillage(FARM_OUTPOST);
    const res = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, kind: "crop" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      jobs: Record<string, { kind: string; startedAt: number }>;
    };
    expect(json.ok).toBe(true);
    expect(json.jobs["0"]).toEqual({ kind: "crop", startedAt: T0 });
    const stored = villages.get(FARM_OUTPOST) as {
      jobs: Record<string, { kind: string; startedAt: number }>;
    };
    expect(stored.jobs["0"].startedAt).toBe(T0);
  });

  it("이미 찬 슬롯 → 409 slot_busy", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      jobs: { "0": { kind: "crop", startedAt: T0 } },
    });
    const res = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, kind: "ore" }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("slot_busy");
  });

  it("단계 슬롯 범위 밖(village tier slot 1) → 400 slot_out_of_range", async () => {
    // village = 슬롯 1개(인덱스 0만). slot 1 은 범위 밖 → 엔진 slot_out_of_range → 400.
    seedBuiltVillage(FARM_OUTPOST, { tier: "village" });
    const res = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 1, kind: "crop" }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as AnyJson).error).toBe("slot_out_of_range");
  });
});

// ── harvest (수확) ──────────────────────────────────────────────────────────
describe("POST /api/v2/outpost/village/harvest", () => {
  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(401);
  });

  it("미점령 → 403 not_owner", async () => {
    const res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(403);
  });

  it("마을 없음 → 404 no_village", async () => {
    setOwner(FARM_OUTPOST, MY_GUILD); // 점령은 됐지만 village row 없음
    const res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as AnyJson).error).toBe("no_village");
  });

  it("빈 슬롯 → 404 no_job", async () => {
    seedBuiltVillage(FARM_OUTPOST);
    const res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as AnyJson).error).toBe("no_job");
  });

  it("미완료 작업 → 409 not_ready (재화 불변)", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      jobs: { "0": { kind: "crop", startedAt: T0 } },
    });
    // crop duration(2h) 직전까지만 진행.
    vi.setSystemTime(T0 + PRODUCTION_DURATION_MS.crop - 1);
    const res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("not_ready");
    expect(resourcesByGuild.get(MY_GUILD)).toBeUndefined();
  });

  it("완료 작업(농지 작물) → 200, 재화 = base × 1.3 (TRAIT_BONUS_PCT)", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      jobs: { "0": { kind: "crop", startedAt: T0 } },
    });
    vi.setSystemTime(T0 + PRODUCTION_DURATION_MS.crop); // 정확히 완료 시점
    const res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      harvested: { kind: string; amount: number };
      resources: Record<string, number>;
    };
    // farmland + crop 일치 → +30%. round(10 × 1.3) = 13.
    const expected = Math.round(PRODUCTION_BASE_YIELD.crop * (1 + TRAIT_BONUS_PCT / 100));
    expect(expected).toBe(13);
    expect(json.harvested).toEqual({ kind: "crop", amount: 13 });
    expect(json.resources).toEqual({ crop: 13 });
    // 슬롯 비워짐(재큐 필요).
    const stored = villages.get(FARM_OUTPOST) as { jobs: Record<string, unknown> };
    expect(stored.jobs["0"]).toBeUndefined();
    // 재화 풀 누적.
    expect(resourcesByGuild.get(MY_GUILD)).toEqual({ crop: 13 });
  });

  it("평지(plain) 작물 → 보너스 없음, base 그대로(10), 기존 재화에 가산", async () => {
    seedBuiltVillage(PLAIN_OUTPOST, {
      jobs: { "0": { kind: "crop", startedAt: T0 } },
    });
    resourcesByGuild.set(MY_GUILD, { crop: 5 });
    vi.setSystemTime(T0 + PRODUCTION_DURATION_MS.crop);
    const res = await harvestPOST(jreq({ outpostId: PLAIN_OUTPOST, slot: 0 }));
    const json = (await res.json()) as AnyJson & {
      harvested: { amount: number };
    };
    expect(json.harvested.amount).toBe(PRODUCTION_BASE_YIELD.crop); // 10, 보너스 0
    expect(resourcesByGuild.get(MY_GUILD)).toEqual({ crop: 15 }); // 5 + 10
  });

  it("광맥(mine) 광물 → +30%, round(6 × 1.3)=8", async () => {
    seedBuiltVillage(MINE_OUTPOST, {
      jobs: { "0": { kind: "ore", startedAt: T0 } },
    });
    vi.setSystemTime(T0 + PRODUCTION_DURATION_MS.ore);
    const res = await harvestPOST(jreq({ outpostId: MINE_OUTPOST, slot: 0 }));
    const json = (await res.json()) as AnyJson & { harvested: { amount: number } };
    expect(json.harvested.amount).toBe(8); // round(6 * 1.3) = 7.8 → 8
  });
});

// ── upgrade (단계 상승) ─────────────────────────────────────────────────────
describe("POST /api/v2/outpost/village/upgrade", () => {
  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(401);
  });

  it("미점령 → 403 not_owner", async () => {
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(403);
  });

  it("재화 부족 → 409 insufficient (+ missing 목록)", async () => {
    seedBuiltVillage(FARM_OUTPOST, { tier: "village" });
    resourcesByGuild.set(MY_GUILD, { crop: 50 }); // village→city 는 crop 100, ore 60 필요
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as AnyJson & { missing: string[] };
    expect(json.error).toBe("insufficient");
    // 정확히 부족한 두 종(crop·ore)만 — 순서 무관 완전 일치(arrayContaining 보다 엄격).
    expect([...json.missing].sort()).toEqual(["crop", "ore"]);
    // 단계 불변.
    expect((villages.get(FARM_OUTPOST) as { tier: string }).tier).toBe("village");
  });

  it("충분 → 200, tier village→city, 비용 차감, 슬롯 수 증가", async () => {
    seedBuiltVillage(FARM_OUTPOST, { tier: "village" });
    // 비용(100 crop + 60 ore) + 여유분.
    resourcesByGuild.set(MY_GUILD, { crop: 150, ore: 80, fish: 5 });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      tier: string;
      resources: Record<string, number>;
    };
    expect(json.tier).toBe("city");
    // 차감: crop 150-100=50, ore 80-60=20, fish 5(불변·비용 없음).
    expect(json.resources).toEqual({ crop: 50, ore: 20, fish: 5 });
    // 저장된 단계 갱신 + 슬롯 수 증가(village 1 → city 2).
    expect((villages.get(FARM_OUTPOST) as { tier: string }).tier).toBe("city");
    expect(SLOTS_BY_TIER.city).toBe(2);
    expect(SLOTS_BY_TIER.city).toBeGreaterThan(SLOTS_BY_TIER.village);
    // 재화 풀도 차감 반영.
    expect(resourcesByGuild.get(MY_GUILD)).toEqual({ crop: 50, ore: 20, fish: 5 });
  });

  it("최종 단계(metropolis) → 409 max_tier", async () => {
    seedBuiltVillage(FARM_OUTPOST, { tier: "metropolis" });
    resourcesByGuild.set(MY_GUILD, { crop: 9999, ore: 9999, fish: 9999 });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("max_tier");
  });
});

// ── END-TO-END 라이프사이클 (이 파일의 핵심) ────────────────────────────────
// build → produce → (시간경과) → harvest → (반복으로 재화 적립) → upgrade.
// 재화 풀과 tier/슬롯을 매 단계 단언해 "생산 → 수확 → 업그레이드 재화 사이클"을 통째로 검증.
describe("정착지 라이프사이클 end-to-end (build→produce→harvest→upgrade)", () => {
  it("농지 마을: 작물/광물 생산을 반복 수확해 재화를 모아 village→city 업그레이드", async () => {
    setOwner(FARM_OUTPOST, MY_GUILD);

    // 1) build — 빈 공터에 마을 건설/명명.
    let res = await buildPOST(jreq({ outpostId: FARM_OUTPOST, name: "황금밀밭" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as AnyJson).toMatchObject({
      ok: true,
      name: "황금밀밭",
      tier: "village",
    });

    // village→city 비용 = crop 100, ore 60. 농지라 작물만 +30%(round 13/회), 광물은 plain 아님→
    // FARM_OUTPOST 는 farmland 라 ore 보너스 없음(base 6/회). 반복 수확으로 둘 다 모은다.
    const cropPerHarvest = Math.round(
      PRODUCTION_BASE_YIELD.crop * (1 + TRAIT_BONUS_PCT / 100),
    ); // 13
    const orePerHarvest = PRODUCTION_BASE_YIELD.ore; // 6 (farmland=ore 보너스 없음)
    const needCrop = UPGRADE_COST.village!.crop!; // 100
    const needOre = UPGRADE_COST.village!.ore!; // 60
    const cropRounds = Math.ceil(needCrop / cropPerHarvest); // ceil(100/13)=8 → 104
    const oreRounds = Math.ceil(needOre / orePerHarvest); // ceil(60/6)=10 → 60

    let clock = T0;

    // 슬롯 0 에서 작물을 cropRounds 회 produce→harvest 반복.
    for (let i = 0; i < cropRounds; i++) {
      vi.setSystemTime(clock);
      res = await producePOST(
        jreq({ outpostId: FARM_OUTPOST, slot: 0, kind: "crop" }),
      );
      expect(res.status).toBe(200);
      // 완료 시점까지 시계 전진.
      clock += PRODUCTION_DURATION_MS.crop;
      vi.setSystemTime(clock);
      res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
      expect(res.status).toBe(200);
      const j = (await res.json()) as { harvested: { amount: number } };
      expect(j.harvested.amount).toBe(cropPerHarvest);
    }
    expect((resourcesByGuild.get(MY_GUILD) ?? {}).crop).toBe(
      cropRounds * cropPerHarvest, // 8 × 13 = 104
    );

    // 같은 슬롯에서 광물도 oreRounds 회.
    for (let i = 0; i < oreRounds; i++) {
      vi.setSystemTime(clock);
      res = await producePOST(
        jreq({ outpostId: FARM_OUTPOST, slot: 0, kind: "ore" }),
      );
      expect(res.status).toBe(200);
      clock += PRODUCTION_DURATION_MS.ore;
      vi.setSystemTime(clock);
      res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
      expect(res.status).toBe(200);
    }
    const banked = resourcesByGuild.get(MY_GUILD)!;
    expect(banked.crop).toBe(104);
    expect(banked.ore).toBe(oreRounds * orePerHarvest); // 60
    expect(banked.crop).toBeGreaterThanOrEqual(needCrop);
    expect(banked.ore).toBeGreaterThanOrEqual(needOre);

    // 2) GET 으로 재화 스냅샷 확인(라우트 경로로도 동일하게 보이는지).
    res = await GET();
    const snap = (await res.json()) as {
      resources: Record<string, number>;
      villages: Array<{ tier: string; slotCount: number }>;
    };
    expect(snap.resources).toEqual({ crop: 104, ore: 60 });
    expect(snap.villages[0].tier).toBe("village");
    expect(snap.villages[0].slotCount).toBe(1);

    // 3) upgrade — 재화 차감 + tier village→city + 슬롯 1→2.
    res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(200);
    const up = (await res.json()) as {
      tier: string;
      resources: Record<string, number>;
    };
    expect(up.tier).toBe("city");
    expect(up.resources).toEqual({ crop: 104 - 100, ore: 60 - 60 }); // { crop:4, ore:0 }

    // 4) 업그레이드 후 GET — city·슬롯 2, 그리고 새 슬롯 1 에 동시 생산 가능.
    res = await GET();
    const after = (await res.json()) as {
      villages: Array<{ tier: string; slotCount: number }>;
    };
    expect(after.villages[0].tier).toBe("city");
    expect(after.villages[0].slotCount).toBe(SLOTS_BY_TIER.city); // 2

    // 도시는 슬롯 2개 — slot 1 에도 생산 시작 가능(village 였으면 slot_out_of_range).
    vi.setSystemTime(clock);
    res = await producePOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 1, kind: "fish" }),
    );
    expect(res.status).toBe(200);
  });
});
