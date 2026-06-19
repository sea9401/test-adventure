// 정착지(마을) 라우트 통합 테스트 — build → unlock-slot → produce → harvest → upgrade + GET.
// v2 정착지는 codebase 에서 유일하게 테스트 없던 API 층(cleanup-audit). 여기서 메운다.
//
// 전략: DB I/O 경계(@/lib/server/v2Settlement·v2GuildResources)만 STATEFUL in-memory 로 모킹하고,
// 순수 엔진(@/adventure/data/v2/settlement)은 REAL 그대로 — 수확량·비용·해금 수학이 진짜로 돈다.
//   - 마을 저장: outpostId → VillageRow Map. 길드 생산재화: guildId → SettlementResources.
//   - 길드 금고 골드: guildId → number(칸 해금 비용 풀). 소유 가드: owners Map.
//   - 시간: vi.setSystemTime 으로 Date.now() 제어 → 생산 완료/미완료 결정화.
// db.transaction 은 더미 tx({}) 로 콜백을 그냥 실행(쿼리는 전부 모킹 헬퍼가 가로챔).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { terrainTraitOf as realTerrainTraitOf } from "@/adventure/data/v2/outposts";
import {
  PRODUCTION_BASE_YIELD,
  PRODUCTION_DURATION_MS,
  MAX_SLOTS_BY_TIER,
  SLOT_UNLOCK_GOLD_BASE,
  slotUnlockGoldCost,
  VILLAGE_BUILD_GOLD_COST,
  TRAIT_BONUS_PCT,
  UPGRADE_COST,
} from "@/adventure/data/v2/settlement";

// ── 공유 인메모리 스토어(호이스팅) ───────────────────────────────────────────
const { villages, resourcesByGuild, guildGold, owners, guildState } = vi.hoisted(
  () => ({
    villages: new Map<string, unknown>(),
    resourcesByGuild: new Map<number, Record<string, number>>(),
    guildGold: new Map<number, number>(), // 길드 금고 골드(칸 해금 비용)
    owners: new Map<string, number>(),
    // getGuildId 계약 + 관리 게이트(isGuildMasterOrVice) 모킹값.
    guildState: { current: null as number | null, canManage: true },
  }),
);

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

// 관리 게이트(build/rename/unlock-slot/upgrade) — 마스터/부마스터 여부. 기본 true(통과).
vi.mock("@/lib/server/guildAdmin", () => ({
  isGuildMasterOrVice: vi.fn(async () => guildState.canManage),
}));

// db.transaction 은 더미 tx 로 콜백만 실행(모든 쿼리는 모킹 헬퍼가 대신함).
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) },
}));

// 길드 금고 골드 풀 — 칸 해금 비용이 빠지는 곳.
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: vi.fn(async (_tx: unknown, guildId: number) => ({
    gold: guildGold.get(guildId) ?? 0,
  })),
  readGuildResources: vi.fn(async (_tx: unknown, guildId: number) => ({
    gold: guildGold.get(guildId) ?? 0,
  })),
  upsertGuildResources: vi.fn(
    async (_tx: unknown, guildId: number, res: { gold: number }) => {
      guildGold.set(guildId, Math.max(0, res.gold));
    },
  ),
}));

// 핵심: 마을/생산재화 DB I/O 헬퍼만 STATEFUL 모킹. 순수 헬퍼(normalize/terrain)는 REAL 위임.
vi.mock("@/lib/server/v2Settlement", () => {
  type Row = {
    outpostId: string;
    guildId: number;
    tier: "village" | "city" | "metropolis";
    name: string | null;
    productionKind: string | null;
    unlockedSlots: number;
    slotKinds: Record<string, string>;
    jobs: Record<string, { kind: string; startedAt: number }>;
  };
  const clone = <T,>(v: T): T => structuredClone(v);
  return {
    guildOwningOutpost: vi.fn(
      async (_tx: unknown, _userId: string, outpostId: string) => {
        const mine = guildState.current;
        if (mine == null) return null; // 길드 미가입
        const occ = (owners as Map<string, number>).get(outpostId);
        return occ != null && occ === mine ? mine : null;
      },
    ),
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
    // 점령 이관 정규화 — REAL 과 동일(다른 길드면 소유 갱신 + 작물 비움, 판/슬롯 종류는 유지).
    normalizeVillageOwner: (village: Row, guildId: number): Row =>
      village.guildId === guildId
        ? village
        : { ...village, guildId, jobs: {} },
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
import { POST as unlockPOST } from "@/app/api/v2/outpost/village/unlock-slot/route";
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

// 점령됐고 이미 건설(이름)된 마을을 직접 시드. 해금 칸은 기본 종류(kind, 기본 crop)로 slotKinds 채움.
function seedBuiltVillage(
  outpostId: string,
  over?: Partial<{
    guildId: number;
    tier: "village" | "city" | "metropolis";
    name: string | null;
    unlockedSlots: number;
    kind: string; // 해금 칸을 채울 기본 종류
    slotKinds: Record<string, string>; // 명시 종류맵(우선)
    jobs: Record<string, { kind: string; startedAt: number }>;
  }>,
) {
  const guildId = over?.guildId ?? MY_GUILD;
  setOwner(outpostId, guildId);
  // name: null 을 명시 전달(미건설 시드)할 수 있게 "in" 으로 구분 — ?? 는 null 흡수.
  const name: string | null = over && "name" in over ? over.name ?? null : "내마을";
  const unlockedSlots = over?.unlockedSlots ?? 1;
  const fillKind = over?.kind ?? "crop";
  const slotKinds =
    over?.slotKinds ??
    Object.fromEntries(
      Array.from({ length: unlockedSlots }, (_, i) => [String(i), fillKind]),
    );
  villages.set(outpostId, {
    outpostId,
    guildId,
    tier: over?.tier ?? "village",
    name,
    productionKind: null, // 레거시 — 신규 모델은 slotKinds 가 종류 결정
    unlockedSlots,
    slotKinds,
    jobs: over?.jobs ?? {},
  });
}

beforeEach(() => {
  villages.clear();
  resourcesByGuild.clear();
  guildGold.clear();
  owners.clear();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.mocked(ensureUser).mockResolvedValue(ME_USER);
  guildState.current = MY_GUILD; // 기본 = 유저가 내 길드 소속
  guildState.canManage = true; // 기본 = 마스터/부마스터(관리 가능)
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── GET (목록 + 재화 + 골드) ─────────────────────────────────────────────────
describe("GET /api/v2/outpost/village", () => {
  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(((await res.json()) as AnyJson).error).toBe("unauthorized");
  });

  it("happy — ok:true + serverNow + 마을(판/칸 종류) + 재화 + 길드 골드", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      name: "밀밭",
      unlockedSlots: 1,
      kind: "crop",
      jobs: { "0": { kind: "crop", startedAt: T0 - 1000 } },
    });
    resourcesByGuild.set(MY_GUILD, { crop: 7 });
    guildGold.set(MY_GUILD, 123_456);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      villages: Array<{
        outpostId: string;
        name: string;
        trait: string;
        unlockedSlots: number;
        maxSlots: number;
        gridCols: number;
        slotKinds: Record<string, string>;
        slots: Array<{ slot: number; kind: string; ready: boolean }>;
      }>;
      resources: Record<string, number>;
      gold: number;
      serverNow: number;
    };
    expect(json.ok).toBe(true);
    expect(json.serverNow).toBe(T0);
    expect(json.villages).toHaveLength(1);
    const v = json.villages[0];
    expect(v.outpostId).toBe(FARM_OUTPOST);
    expect(v.name).toBe("밀밭");
    expect(v.trait).toBe("farmland"); // REAL terrainTraitOf
    expect(v.unlockedSlots).toBe(1);
    expect(v.maxSlots).toBe(MAX_SLOTS_BY_TIER.village); // 4 (2×2)
    expect(v.gridCols).toBe(2);
    expect(v.slotKinds).toEqual({ "0": "crop" });
    expect(v.slots[0].kind).toBe("crop");
    expect(json.resources).toEqual({ crop: 7 });
    expect(json.gold).toBe(123_456);
  });

  it("길드 없음 — 빈 목록/빈 재화/0 골드", async () => {
    const { getGuildId } = await import("@/lib/server/v2EnsureSoloGuild");
    vi.mocked(getGuildId).mockResolvedValueOnce(null);
    const res = await GET();
    const json = (await res.json()) as AnyJson;
    expect(json.ok).toBe(true);
    expect(json.villages).toEqual([]);
    expect(json.resources).toEqual({});
    expect(json.gold).toBe(0);
  });
});

// ── build (이름만 정해 건설) ──────────────────────────────────────────────────
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

  it("마스터/부마스터 아님 → 403 not_authorized", async () => {
    guildState.canManage = false;
    setOwner(PLAIN_OUTPOST, MY_GUILD);
    const res = await buildPOST(jreq({ outpostId: PLAIN_OUTPOST, name: "마을" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_authorized");
  });

  it("내 길드 미점령 → 403 not_owner", async () => {
    setOwner(PLAIN_OUTPOST, 999); // 남의 길드
    const res = await buildPOST(jreq({ outpostId: PLAIN_OUTPOST, name: "마을" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_owner");
  });

  it("길드 골드 부족 → 409 insufficient_gold (건설 안 됨)", async () => {
    setOwner(PLAIN_OUTPOST, MY_GUILD);
    guildGold.set(MY_GUILD, VILLAGE_BUILD_GOLD_COST - 1);
    const res = await buildPOST(jreq({ outpostId: PLAIN_OUTPOST, name: "마을" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("insufficient_gold");
    expect(villages.get(PLAIN_OUTPOST)).toBeUndefined();
  });

  it("happy — 빈 공터에 새 마을 건설(이름만·1천만 골드 차감·빈 판)", async () => {
    setOwner(PLAIN_OUTPOST, MY_GUILD);
    guildGold.set(MY_GUILD, 25_000_000);
    const res = await buildPOST(jreq({ outpostId: PLAIN_OUTPOST, name: " 새터  " }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson;
    expect(json.ok).toBe(true);
    expect(json.name).toBe("새터"); // trim 적용
    expect(json.tier).toBe("village");
    const stored = villages.get(PLAIN_OUTPOST) as {
      name: string;
      tier: string;
      unlockedSlots: number;
      slotKinds: Record<string, string>;
    };
    expect(stored.name).toBe("새터");
    expect(stored.tier).toBe("village");
    expect(stored.unlockedSlots).toBe(0); // 건설 직후 빈 판(첫 칸은 무료로 해금)
    expect(stored.slotKinds).toEqual({});
    // 건설 비용 1천만 차감.
    expect(guildGold.get(MY_GUILD)).toBe(25_000_000 - VILLAGE_BUILD_GOLD_COST);
  });

  it("이름 없는 옛 row → 이름만 채워 건설(판/슬롯 보존)", async () => {
    seedBuiltVillage(PLAIN_OUTPOST, { name: null, unlockedSlots: 0 });
    const res = await buildPOST(jreq({ outpostId: PLAIN_OUTPOST, name: "이름붙임" }));
    expect(res.status).toBe(200);
    const stored = villages.get(PLAIN_OUTPOST) as { name: string };
    expect(stored.name).toBe("이름붙임");
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
    const res = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(401);
  });

  it("길드 미가입(getGuildId→null) → 403 not_owner", async () => {
    guildState.current = null;
    seedBuiltVillage(FARM_OUTPOST);
    const res = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
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
    const r1 = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot: -1 }));
    expect(r1.status).toBe(400);
    const r2 = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot: 1.5 }));
    expect(r2.status).toBe(400);
    expect(((await r2.json()) as AnyJson).error).toBe("invalid");
  });

  it("미점령 → 403 not_owner", async () => {
    seedBuiltVillage(FARM_OUTPOST, { guildId: 999 }); // 남의 길드 점령
    const res = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_owner");
  });

  it("건설 안 됨(마을 없음 / 이름 없음) → 409 not_built", async () => {
    setOwner(FARM_OUTPOST, MY_GUILD);
    const r1 = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(r1.status).toBe(409);
    expect(((await r1.json()) as AnyJson).error).toBe("not_built");

    seedBuiltVillage(FARM_OUTPOST, { name: null });
    const r2 = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(r2.status).toBe(409);
    expect(((await r2.json()) as AnyJson).error).toBe("not_built");
  });

  it("happy — 빈 칸에 그 칸 종류로 생산 시작(startedAt=now)", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 1, kind: "crop" });
    const res = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      jobs: Record<string, { kind: string; startedAt: number }>;
    };
    expect(json.ok).toBe(true);
    expect(json.jobs["0"]).toEqual({ kind: "crop", startedAt: T0 });
  });

  it("칸마다 다른 종류 — slot 1(ore)은 ore 로 생산", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      unlockedSlots: 2,
      slotKinds: { "0": "crop", "1": "ore" },
    });
    const res = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot: 1 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      jobs: Record<string, { kind: string }>;
    };
    expect(json.jobs["1"].kind).toBe("ore");
  });

  it("이미 찬 칸 → 409 slot_busy", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      jobs: { "0": { kind: "crop", startedAt: T0 } },
    });
    const res = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("slot_busy");
  });

  it("해금 안 된 칸(1칸만 해금, slot 1) → 400 slot_out_of_range", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 1 });
    const res = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot: 1 }));
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
    setOwner(FARM_OUTPOST, MY_GUILD);
    const res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as AnyJson).error).toBe("no_village");
  });

  it("빈 칸 → 404 no_job", async () => {
    seedBuiltVillage(FARM_OUTPOST);
    const res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as AnyJson).error).toBe("no_job");
  });

  it("미완료 작업 → 409 not_ready (재화 불변)", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      jobs: { "0": { kind: "crop", startedAt: T0 } },
    });
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
    vi.setSystemTime(T0 + PRODUCTION_DURATION_MS.crop);
    const res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot: 0 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      harvested: { kind: string; amount: number };
      resources: Record<string, number>;
    };
    const expected = Math.round(
      PRODUCTION_BASE_YIELD.crop * (1 + TRAIT_BONUS_PCT / 100),
    );
    expect(expected).toBe(13);
    expect(json.harvested).toEqual({ kind: "crop", amount: 13 });
    expect(json.resources).toEqual({ crop: 13 });
    const stored = villages.get(FARM_OUTPOST) as { jobs: Record<string, unknown> };
    expect(stored.jobs["0"]).toBeUndefined();
    expect(resourcesByGuild.get(MY_GUILD)).toEqual({ crop: 13 });
  });

  it("평지(plain) 작물 → 보너스 없음(10), 기존 재화에 가산", async () => {
    seedBuiltVillage(PLAIN_OUTPOST, {
      jobs: { "0": { kind: "crop", startedAt: T0 } },
    });
    resourcesByGuild.set(MY_GUILD, { crop: 5 });
    vi.setSystemTime(T0 + PRODUCTION_DURATION_MS.crop);
    const res = await harvestPOST(jreq({ outpostId: PLAIN_OUTPOST, slot: 0 }));
    const json = (await res.json()) as AnyJson & { harvested: { amount: number } };
    expect(json.harvested.amount).toBe(PRODUCTION_BASE_YIELD.crop); // 10
    expect(resourcesByGuild.get(MY_GUILD)).toEqual({ crop: 15 });
  });

  it("광맥(mine) 광물 → +30%, round(6 × 1.3)=8", async () => {
    seedBuiltVillage(MINE_OUTPOST, {
      kind: "ore",
      jobs: { "0": { kind: "ore", startedAt: T0 } },
    });
    vi.setSystemTime(T0 + PRODUCTION_DURATION_MS.ore);
    const res = await harvestPOST(jreq({ outpostId: MINE_OUTPOST, slot: 0 }));
    const json = (await res.json()) as AnyJson & { harvested: { amount: number } };
    expect(json.harvested.amount).toBe(8);
  });
});

// ── unlock-slot (길드 골드로 칸 해금 + 종류 선택) ─────────────────────────────
describe("POST /api/v2/outpost/village/unlock-slot", () => {
  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST, kind: "crop" }));
    expect(res.status).toBe(401);
  });

  it("잘못된 종류 → 400 invalid_kind", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 0 });
    guildGold.set(MY_GUILD, SLOT_UNLOCK_GOLD_BASE);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST, kind: "gold" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as AnyJson).error).toBe("invalid_kind");
  });

  it("미점령 → 403 not_owner", async () => {
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST, kind: "crop" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_owner");
  });

  it("마스터/부마스터 아님 → 403 not_authorized", async () => {
    guildState.canManage = false;
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 0 });
    guildGold.set(MY_GUILD, 9_999_999_999);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST, kind: "crop" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_authorized");
  });

  it("미건설(이름 없음) → 409 not_built", async () => {
    seedBuiltVillage(FARM_OUTPOST, { name: null, unlockedSlots: 0 });
    guildGold.set(MY_GUILD, 9_999_999_999);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST, kind: "crop" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("not_built");
  });

  it("골드 부족(둘째 칸) → 409 insufficient_gold", async () => {
    // 첫 칸은 무료라 둘째 칸(unlockedSlots 1)에서 골드 게이트가 걸린다.
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 1 });
    guildGold.set(MY_GUILD, SLOT_UNLOCK_GOLD_BASE - 1);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST, kind: "crop" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("insufficient_gold");
    expect((villages.get(FARM_OUTPOST) as { unlockedSlots: number }).unlockedSlots).toBe(1);
  });

  it("happy — 첫 칸 무료 해금(+1) + 종류 고정, 골드 차감 없음", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 0 });
    guildGold.set(MY_GUILD, 0); // 골드 0 이어도 첫 칸은 무료
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST, kind: "ore" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      unlockedSlots: number;
      slotKinds: Record<string, string>;
      gold: number;
    };
    expect(json.unlockedSlots).toBe(1);
    expect(json.slotKinds).toEqual({ "0": "ore" });
    expect(json.gold).toBe(0); // 무료 → 차감 없음
    expect(guildGold.get(MY_GUILD)).toBe(0);
  });

  it("둘째 칸 — 길드 골드 5천만 차감", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      unlockedSlots: 1,
      slotKinds: { "0": "crop" },
    });
    guildGold.set(MY_GUILD, SLOT_UNLOCK_GOLD_BASE + 7);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST, kind: "fish" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      unlockedSlots: number;
      slotKinds: Record<string, string>;
      gold: number;
    };
    expect(json.unlockedSlots).toBe(2);
    expect(json.slotKinds).toEqual({ "0": "crop", "1": "fish" });
    expect(json.gold).toBe(7); // base 차감
    expect(guildGold.get(MY_GUILD)).toBe(7);
  });

  it("판 가득(마을 4칸) → 409 at_max", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 4 });
    guildGold.set(MY_GUILD, 9_999_999_999);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST, kind: "crop" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("at_max");
  });

  it("비용 곡선 — 첫 칸 무료, 둘째 base, 셋째 base+step", async () => {
    expect(slotUnlockGoldCost(0)).toBe(0);
    expect(slotUnlockGoldCost(1)).toBe(SLOT_UNLOCK_GOLD_BASE);
    expect(slotUnlockGoldCost(2)).toBeGreaterThan(SLOT_UNLOCK_GOLD_BASE);
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

  it("마스터/부마스터 아님 → 403 not_authorized", async () => {
    guildState.canManage = false;
    seedBuiltVillage(FARM_OUTPOST, { tier: "village", unlockedSlots: 4 });
    resourcesByGuild.set(MY_GUILD, { crop: 99999, ore: 99999, fish: 99999 });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_authorized");
  });

  it("칸 미해금(판 안 참) → 409 need_slots", async () => {
    seedBuiltVillage(FARM_OUTPOST, { tier: "village", unlockedSlots: 1 });
    resourcesByGuild.set(MY_GUILD, { crop: 99999, ore: 99999, fish: 99999 });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("need_slots");
    expect((villages.get(FARM_OUTPOST) as { tier: string }).tier).toBe("village");
  });

  it("재화 부족 → 409 insufficient (+ missing 목록)", async () => {
    seedBuiltVillage(FARM_OUTPOST, { tier: "village", unlockedSlots: 4 });
    // crop 만 충족, ore·fish 0 → 정확히 그 둘만 missing.
    resourcesByGuild.set(MY_GUILD, { crop: UPGRADE_COST.village!.crop! });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as AnyJson & { missing: string[] };
    expect(json.error).toBe("insufficient");
    expect([...json.missing].sort()).toEqual(["fish", "ore"]);
    expect((villages.get(FARM_OUTPOST) as { tier: string }).tier).toBe("village");
  });

  it("판 다 열림+재화 충분 → 200, village→city, 비용 차감, 해금 칸 유지", async () => {
    seedBuiltVillage(FARM_OUTPOST, { tier: "village", unlockedSlots: 4 });
    const cost = UPGRADE_COST.village!;
    resourcesByGuild.set(MY_GUILD, {
      crop: cost.crop! + 10,
      ore: cost.ore! + 20,
      fish: cost.fish! + 30,
    });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      tier: string;
      resources: Record<string, number>;
    };
    expect(json.tier).toBe("city");
    expect(json.resources).toEqual({ crop: 10, ore: 20, fish: 30 });
    const stored = villages.get(FARM_OUTPOST) as {
      tier: string;
      unlockedSlots: number;
    };
    expect(stored.tier).toBe("city");
    expect(stored.unlockedSlots).toBe(4); // 판 확장(2×2→3×3), 해금분 이어짐
    expect(MAX_SLOTS_BY_TIER.city).toBeGreaterThan(MAX_SLOTS_BY_TIER.village);
  });

  it("최종 단계(metropolis) → 409 max_tier", async () => {
    seedBuiltVillage(FARM_OUTPOST, { tier: "metropolis", unlockedSlots: 9 });
    resourcesByGuild.set(MY_GUILD, { crop: 99999, ore: 99999, fish: 99999 });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("max_tier");
  });
});

// ── END-TO-END (이 파일의 핵심) ──────────────────────────────────────────────
// build(이름) → 골드로 칸 해금(종류 선택) → 칸마다 다른 종류 생산 → 수확 → 단계 업그레이드.
describe("정착지 라이프사이클 end-to-end", () => {
  it("건설 → 칸 4개 해금(작물/광물/물고기/작물) → 칸별 생산·수확 → village→city 업그레이드", async () => {
    setOwner(FARM_OUTPOST, MY_GUILD);

    // 1) build — 이름만(길드 금고 골드 1천만 차감).
    guildGold.set(MY_GUILD, 1_000_000_000);
    let res = await buildPOST(jreq({ outpostId: FARM_OUTPOST, name: "황금밀밭" }));
    expect(res.status).toBe(200);
    expect((villages.get(FARM_OUTPOST) as { unlockedSlots: number }).unlockedSlots).toBe(0);
    let expectedGold = 1_000_000_000 - VILLAGE_BUILD_GOLD_COST;
    expect(guildGold.get(MY_GUILD)).toBe(expectedGold);

    // 2) 칸 4개를 한 칸씩 해금하며 종류를 고른다 — 첫 칸 무료, 이후 골드 누진.
    const slotPlan: Array<"crop" | "ore" | "fish"> = ["crop", "ore", "fish", "crop"];
    for (let i = 0; i < slotPlan.length; i++) {
      const cost = slotUnlockGoldCost(i); // i=0 → 0(무료)
      res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST, kind: slotPlan[i] }));
      expect(res.status).toBe(200);
      const j = (await res.json()) as { unlockedSlots: number; gold: number };
      expect(j.unlockedSlots).toBe(i + 1);
      expectedGold -= cost;
      expect(j.gold).toBe(expectedGold);
    }
    const built = villages.get(FARM_OUTPOST) as {
      unlockedSlots: number;
      slotKinds: Record<string, string>;
    };
    expect(built.unlockedSlots).toBe(4);
    expect(built.slotKinds).toEqual({ "0": "crop", "1": "ore", "2": "fish", "3": "crop" });

    // 3) 칸마다 그 종류로 생산 후 수확 — 농지라 작물만 +30%(13), 광물 6·물고기 12.
    for (const slot of [0, 1, 2]) {
      vi.setSystemTime(T0);
      res = await producePOST(jreq({ outpostId: FARM_OUTPOST, slot }));
      expect(res.status).toBe(200);
    }
    vi.setSystemTime(T0 + PRODUCTION_DURATION_MS.ore); // 최장(3h) 경과 → 셋 다 완료
    for (const slot of [0, 1, 2]) {
      res = await harvestPOST(jreq({ outpostId: FARM_OUTPOST, slot }));
      expect(res.status).toBe(200);
    }
    const cropYield = Math.round(
      PRODUCTION_BASE_YIELD.crop * (1 + TRAIT_BONUS_PCT / 100),
    ); // 13
    expect(resourcesByGuild.get(MY_GUILD)).toEqual({
      crop: cropYield,
      ore: PRODUCTION_BASE_YIELD.ore, // 6 (보너스 없음)
      fish: PRODUCTION_BASE_YIELD.fish, // 12 (보너스 없음)
    });

    // 4) 업그레이드 재화는 큰 비용 — 누적 검증은 위 생산이 충분하므로 풀을 임계로 세팅 후 승급.
    const cost = UPGRADE_COST.village!;
    resourcesByGuild.set(MY_GUILD, {
      crop: cost.crop! + 1,
      ore: cost.ore! + 2,
      fish: cost.fish! + 3,
    });
    res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(200);
    const up = (await res.json()) as { tier: string; resources: Record<string, number> };
    expect(up.tier).toBe("city");
    expect(up.resources).toEqual({ crop: 1, ore: 2, fish: 3 });

    // 5) GET — city·판 3×3(9칸)·해금 칸 4·칸 종류 유지.
    res = await GET();
    const after = (await res.json()) as {
      villages: Array<{
        outpostId: string;
        tier: string;
        unlockedSlots: number;
        maxSlots: number;
        slotKinds: Record<string, string>;
      }>;
    };
    const farm = after.villages.find((v) => v.outpostId === FARM_OUTPOST)!;
    expect(farm.tier).toBe("city");
    expect(farm.maxSlots).toBe(MAX_SLOTS_BY_TIER.city); // 9
    expect(farm.unlockedSlots).toBe(4);
    expect(farm.slotKinds["1"]).toBe("ore"); // 칸 종류 보존
  });
});
