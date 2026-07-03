// 정착지(마을) 라우트 통합 테스트 — build → unlock-slot → upgrade + GET.
// [PR-3] 슬롯 생산(produce/harvest) 폐지 — 슬롯은 자리표시, crop/ore 는 사냥 드랍→기부+업글.
//   해당 라우트·테스트 삭제. 칸 해금은 종류 선택 없음(자리표시 칸).
//
// 전략: DB I/O 경계(@/lib/server/v2Settlement·v2GuildResources)만 STATEFUL in-memory 로 모킹하고,
// 순수 엔진(@/adventure/data/v2/settlement)은 REAL 그대로 — 비용·해금 수학이 진짜로 돈다.
//   - 마을 저장: outpostId → VillageRow Map. 길드 정착지 재화: guildId → SettlementResources.
//   - 길드 금고 골드: guildId → number(칸 해금 비용 풀). 소유 가드: owners Map.
// db.transaction 은 더미 tx({}) 로 콜백을 그냥 실행(쿼리는 전부 모킹 헬퍼가 가로챔).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { terrainTraitOf as realTerrainTraitOf } from "@/adventure/data/v2/outposts";
import {
  MAX_SLOTS_BY_TIER,
  SLOT_UNLOCK_GOLD_BASE,
  SLOT_UNLOCK_GOLD_STEP,
  slotUnlockGoldCost,
  VILLAGE_BUILD_GOLD_COST,
  UPGRADE_COST,
  GUILD_SMITHY_UPGRADES,
  TRAINING_GROUND_UPGRADES,
} from "@/adventure/data/v2/settlement";

// ── 공유 인메모리 스토어(호이스팅) ───────────────────────────────────────────
const {
  villages,
  resourcesByGuild,
  guildGold,
  owners,
  buildingMemory,
  guildState,
} = vi.hoisted(() => ({
    villages: new Map<string, unknown>(),
    resourcesByGuild: new Map<number, Record<string, number>>(),
    guildGold: new Map<number, number>(), // 길드 금고 골드(칸 해금 비용)
    owners: new Map<string, number>(),
    buildingMemory: new Map<string, number>(),
    // getGuildId 계약 + 관리 게이트(isGuildMasterOrVice) 모킹값.
    guildState: { current: null as number | null, canManage: true },
  }));

const ME_USER = "u-settler";
const MY_GUILD = 42;

// 내 길드가 점령했다고 가정하는 거점들 — 지형 특성별 1개씩(REAL terrainTraitOf 기준).
const PLAIN_OUTPOST = "outpost_plain_fort"; // fort → plain
const FARM_OUTPOST = "village_wheatfield"; // village → farmland

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

vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => {}),
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
    buildings: Record<string, string | { id: string; level: number }>;
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
    rememberGuildSettlementBuildingLevel: vi.fn(
      async (
        _tx: unknown,
        guildId: number,
        buildingId: string,
        level: number,
      ) => {
        const key = `${guildId}:${buildingId}`;
        const prev = (buildingMemory as Map<string, number>).get(key) ?? 0;
        (buildingMemory as Map<string, number>).set(
          key,
          Math.max(prev, Math.max(1, Math.floor(Number(level) || 1))),
        );
      },
    ),
    readGuildSettlementBuildingLevel: vi.fn(
      async (_tx: unknown, guildId: number, buildingId: string) =>
        (buildingMemory as Map<string, number>).get(`${guildId}:${buildingId}`) ??
        null,
    ),
    // 점령 이관 정규화 — REAL 과 동일(다른 길드면 소유 갱신 + 작물 비움, 판/슬롯 종류는 유지).
    normalizeVillageOwner: (village: Row, guildId: number): Row =>
      village.guildId === guildId
        ? village
        : { ...village, guildId, jobs: {} },
    normalizeVillageToOwner: (
      village: Row,
      owner: { kind: "guild"; guildId: number } | { kind: "solo"; userId: string },
    ): Row =>
      owner.kind === "guild"
        ? { ...village, guildId: owner.guildId, jobs: {} }
        : { ...village, guildId: 0, jobs: {} },
    resolveTileVillageManageOwner: vi.fn(),
    terrainTraitOf: (...args: Parameters<typeof realTerrainTraitOf>) =>
      realTerrainTraitOf(...args),
  };
});

// 라우트 핸들러 — 모킹 등록 후 import.
import { GET } from "@/app/api/v2/outpost/village/route";
import { POST as buildPOST } from "@/app/api/v2/outpost/village/build/route";
import { POST as discardBuildingPOST } from "@/app/api/v2/outpost/village/building/discard/route";
import { POST as placeBuildingPOST } from "@/app/api/v2/outpost/village/building/place/route";
import { POST as upgradeBuildingPOST } from "@/app/api/v2/outpost/village/building/upgrade/route";
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

function getReq(path = "/api/v2/outpost/village"): Request {
  return new Request(`http://t${path}`);
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
    buildings: Record<string, string | { id: string; level: number }>;
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
    buildings: over?.buildings ?? {},
    jobs: over?.jobs ?? {},
  });
}

beforeEach(() => {
  villages.clear();
  resourcesByGuild.clear();
  guildGold.clear();
  owners.clear();
  buildingMemory.clear();
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
    const res = await GET(getReq());
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

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      villages: Array<{
        outpostId: string;
        name: string;
        trait: string;
        unlockedSlots: number;
        maxSlots: number;
        buildings: Record<string, string>;
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
    expect(v.maxSlots).toBe(MAX_SLOTS_BY_TIER.village); // 1 (이 단계 해금 상한)
    expect(v.buildings).toEqual({});
    // [PR-3] 슬롯 생산 폐지 — slots/slotKinds 미노출.
    expect(json.resources).toEqual({ crop: 7 });
    expect(json.gold).toBe(123_456);
  });

  it("길드 없음 — 빈 목록/빈 재화/0 골드", async () => {
    const { getGuildId } = await import("@/lib/server/v2EnsureSoloGuild");
    vi.mocked(getGuildId).mockResolvedValueOnce(null);
    const res = await GET(getReq());
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
      buildings: Record<string, string>;
    };
    expect(stored.name).toBe("새터");
    expect(stored.tier).toBe("village");
    expect(stored.unlockedSlots).toBe(0); // 건설 직후 빈 판(첫 칸도 골드로 해금)
    expect(stored.slotKinds).toEqual({});
    expect(stored.buildings).toEqual({});
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

// ── unlock-slot (길드 골드로 칸 해금 · [PR-3] 종류 선택 없음) ─────────────────
describe("POST /api/v2/outpost/village/unlock-slot", () => {
  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(401);
  });

  it("미점령 → 403 not_owner", async () => {
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_owner");
  });

  it("마스터/부마스터 아님 → 403 not_authorized", async () => {
    guildState.canManage = false;
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 0 });
    guildGold.set(MY_GUILD, 9_999_999_999);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_authorized");
  });

  it("미건설(이름 없음) → 409 not_built", async () => {
    seedBuiltVillage(FARM_OUTPOST, { name: null, unlockedSlots: 0 });
    guildGold.set(MY_GUILD, 9_999_999_999);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("not_built");
  });

  it("골드 부족(첫 칸) → 409 insufficient_gold", async () => {
    // 첫 칸부터 유료(5천만) — 골드 부족이면 막힌다.
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 0 });
    guildGold.set(MY_GUILD, SLOT_UNLOCK_GOLD_BASE - 1);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("insufficient_gold");
    expect((villages.get(FARM_OUTPOST) as { unlockedSlots: number }).unlockedSlots).toBe(0);
  });

  it("happy — 첫 칸 해금(+1·5천만 차감, 종류 선택 없음)", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 0 });
    guildGold.set(MY_GUILD, SLOT_UNLOCK_GOLD_BASE); // 첫 칸 5천만
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      unlockedSlots: number;
      gold: number;
    };
    expect(json.unlockedSlots).toBe(1);
    expect(json.gold).toBe(0); // 5천만 차감
    expect(guildGold.get(MY_GUILD)).toBe(0);
  });

  it("둘째 칸 시도 — 1슬롯 정책으로 409 at_max", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 1 });
    const second = SLOT_UNLOCK_GOLD_BASE + SLOT_UNLOCK_GOLD_STEP; // 1억
    guildGold.set(MY_GUILD, second + 7);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("at_max");
    expect(guildGold.get(MY_GUILD)).toBe(second + 7);
  });

  it("판 가득(마을 1칸) → 409 at_max", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 1 });
    guildGold.set(MY_GUILD, 9_999_999_999);
    const res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("at_max");
  });

  it("비용 곡선 — 첫 칸 base(5천만), 둘째 다이얼은 보존", async () => {
    expect(slotUnlockGoldCost(0)).toBe(SLOT_UNLOCK_GOLD_BASE);
    expect(slotUnlockGoldCost(1)).toBe(SLOT_UNLOCK_GOLD_BASE + SLOT_UNLOCK_GOLD_STEP);
  });
});

// ── building/place (건축물 배치) ───────────────────────────────────────────
describe("POST /api/v2/outpost/village/building/place", () => {
  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await placeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, buildingId: "guild_smithy" }),
    );
    expect(res.status).toBe(401);
  });

  it("마스터/부마스터 아님 → 403 not_authorized", async () => {
    guildState.canManage = false;
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 1 });
    const res = await placeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, buildingId: "guild_smithy" }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_authorized");
  });

  it("잠긴 슬롯 → 409 slot_locked", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 0 });
    const res = await placeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, buildingId: "guild_smithy" }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("slot_locked");
  });

  it("happy — 길드 대장간을 0번 건축물 슬롯에 배치", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 1 });
    const res = await placeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, buildingId: "guild_smithy" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      slot: number;
      buildingId: string;
      buildings: Record<string, { id: string; level: number }>;
    };
    expect(json.slot).toBe(0);
    expect(json.buildingId).toBe("guild_smithy");
    expect(json.buildings).toEqual({ "0": { id: "guild_smithy", level: 1 } });
    expect(
      (
        villages.get(FARM_OUTPOST) as {
          buildings: Record<string, { id: string; level: number }>;
        }
      ).buildings,
    ).toEqual({ "0": { id: "guild_smithy", level: 1 } });
  });

  it("이미 배치된 슬롯 → 409 already_occupied", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      unlockedSlots: 1,
      buildings: { "0": "guild_smithy" },
    });
    const res = await placeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, buildingId: "guild_smithy" }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("already_occupied");
  });

  it("훈련장을 배치할 수 있다", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 1 });
    const res = await placeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, buildingId: "training_ground" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      buildingId: string;
      buildings: Record<string, { id: string; level: number }>;
    };
    expect(json.buildingId).toBe("training_ground");
    expect(json.buildings).toEqual({
      "0": { id: "training_ground", level: 1 },
    });
  });

  it("아직 미개방 건물 id → 409 building_unavailable", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 1 });
    const res = await placeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, buildingId: "woodworks" }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("building_unavailable");
  });

  it("보관된 같은 길드 건축물 레벨이 있으면 재배치 때 복구한다", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 1 });
    buildingMemory.set(`${MY_GUILD}:guild_smithy`, 4);

    const res = await placeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0, buildingId: "guild_smithy" }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      building: { id: string; level: number };
    };
    expect(json.building).toEqual({ id: "guild_smithy", level: 4 });
    expect(
      (
        villages.get(FARM_OUTPOST) as {
          buildings: Record<string, { id: string; level: number }>;
        }
      ).buildings["0"],
    ).toEqual({ id: "guild_smithy", level: 4 });
  });
});

// ── building/discard (건축물 폐기) ──────────────────────────────────────────
describe("POST /api/v2/outpost/village/building/discard", () => {
  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await discardBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0 }),
    );
    expect(res.status).toBe(401);
  });

  it("마스터/부마스터 아님 → 403 not_authorized", async () => {
    guildState.canManage = false;
    seedBuiltVillage(FARM_OUTPOST, {
      unlockedSlots: 1,
      buildings: { "0": { id: "guild_smithy", level: 3 } },
    });
    const res = await discardBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0 }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_authorized");
  });

  it("건물이 없는 슬롯 → 409 building_required", async () => {
    seedBuiltVillage(FARM_OUTPOST, { unlockedSlots: 1 });
    const res = await discardBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0 }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("building_required");
  });

  it("happy — 슬롯을 비우고 같은 길드 건축물 최고 레벨을 보관한다", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      unlockedSlots: 1,
      buildings: { "0": { id: "guild_smithy", level: 3 } },
    });
    buildingMemory.set(`${MY_GUILD}:guild_smithy`, 4);

    const res = await discardBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0 }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      building: { id: string; level: number };
      buildings: Record<string, unknown>;
    };
    expect(json.building).toEqual({ id: "guild_smithy", level: 3 });
    expect(json.buildings).toEqual({});
    expect(
      (villages.get(FARM_OUTPOST) as { buildings: Record<string, unknown> })
        .buildings,
    ).toEqual({});
    expect(buildingMemory.get(`${MY_GUILD}:guild_smithy`)).toBe(4);
  });
});

// ── building/upgrade (건축물 업그레이드) ─────────────────────────────────────
describe("POST /api/v2/outpost/village/building/upgrade", () => {
  it("대장간 Lv1 → Lv2 업그레이드 비용을 정착지 재화에서 차감", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      unlockedSlots: 1,
      buildings: { "0": { id: "guild_smithy", level: 1 } },
    });
    const cost = GUILD_SMITHY_UPGRADES[1].cost;
    resourcesByGuild.set(MY_GUILD, {
      crop: (cost.crop ?? 0) + 10,
      ore: (cost.ore ?? 0) + 20,
    });

    const res = await upgradeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0 }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      building: { id: string; level: number };
    };
    expect(json.building).toEqual({ id: "guild_smithy", level: 2 });
    expect(resourcesByGuild.get(MY_GUILD)).toEqual({ crop: 10, ore: 20 });
    expect(
      (
        villages.get(FARM_OUTPOST) as {
          buildings: Record<string, { id: string; level: number }>;
        }
      ).buildings["0"],
    ).toEqual({ id: "guild_smithy", level: 2 });
  });

  it("레거시 문자열 대장간도 Lv1로 해석해 업그레이드한다", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      unlockedSlots: 1,
      buildings: { "0": "guild_smithy" },
    });
    const cost = GUILD_SMITHY_UPGRADES[1].cost;
    resourcesByGuild.set(MY_GUILD, {
      crop: cost.crop ?? 0,
      ore: cost.ore ?? 0,
    });
    const res = await upgradeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0 }),
    );
    expect(res.status).toBe(200);
    expect(
      (
        villages.get(FARM_OUTPOST) as {
          buildings: Record<string, { id: string; level: number }>;
        }
      ).buildings["0"],
    ).toEqual({ id: "guild_smithy", level: 2 });
  });

  it("재화 부족 → 409 insufficient_resources", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      unlockedSlots: 1,
      buildings: { "0": { id: "guild_smithy", level: 1 } },
    });
    resourcesByGuild.set(MY_GUILD, { crop: 0, ore: 0 });
    const res = await upgradeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0 }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe(
      "insufficient_resources",
    );
  });

  it("대장간은 Lv5까지 장기 업그레이드된다", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      unlockedSlots: 1,
      buildings: { "0": { id: "guild_smithy", level: 4 } },
    });
    const cost = GUILD_SMITHY_UPGRADES[4].cost;
    resourcesByGuild.set(MY_GUILD, {
      crop: cost.crop ?? 0,
      ore: cost.ore ?? 0,
    });
    const res = await upgradeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0 }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      building: { id: string; level: number };
    };
    expect(json.building.level).toBe(5);
  });

  it("훈련장 Lv1 → Lv2 업그레이드 비용을 정착지 재화에서 차감", async () => {
    seedBuiltVillage(FARM_OUTPOST, {
      unlockedSlots: 1,
      buildings: { "0": { id: "training_ground", level: 1 } },
    });
    const cost = TRAINING_GROUND_UPGRADES[1].cost;
    resourcesByGuild.set(MY_GUILD, {
      crop: (cost.crop ?? 0) + 3,
      ore: (cost.ore ?? 0) + 7,
    });

    const res = await upgradeBuildingPOST(
      jreq({ outpostId: FARM_OUTPOST, slot: 0 }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      building: { id: string; level: number };
    };
    expect(json.building).toEqual({ id: "training_ground", level: 2 });
    expect(resourcesByGuild.get(MY_GUILD)).toEqual({ crop: 3, ore: 7 });
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
    seedBuiltVillage(FARM_OUTPOST, { tier: "village", unlockedSlots: 1 });
    resourcesByGuild.set(MY_GUILD, { crop: 99999, ore: 99999 });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as AnyJson).error).toBe("not_authorized");
  });

  it("칸 미해금(판 안 참) → 409 need_slots", async () => {
    seedBuiltVillage(FARM_OUTPOST, { tier: "village", unlockedSlots: 0 });
    resourcesByGuild.set(MY_GUILD, { crop: 99999, ore: 99999 });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("need_slots");
    expect((villages.get(FARM_OUTPOST) as { tier: string }).tier).toBe("village");
  });

  it("재화 부족 → 409 insufficient (+ missing 목록)", async () => {
    seedBuiltVillage(FARM_OUTPOST, { tier: "village", unlockedSlots: 1 });
    // crop 만 충족, ore 0 → ore 만 missing.
    resourcesByGuild.set(MY_GUILD, { crop: UPGRADE_COST.village!.crop! });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as AnyJson & { missing: string[] };
    expect(json.error).toBe("insufficient");
    expect([...json.missing].sort()).toEqual(["ore"]);
    expect((villages.get(FARM_OUTPOST) as { tier: string }).tier).toBe("village");
  });

  it("판 다 열림+재화 충분 → 200, village→city, 비용 차감, 해금 칸 유지", async () => {
    seedBuiltVillage(FARM_OUTPOST, { tier: "village", unlockedSlots: 1 });
    const cost = UPGRADE_COST.village!;
    resourcesByGuild.set(MY_GUILD, {
      crop: cost.crop! + 10,
      ore: cost.ore! + 20,
    });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as AnyJson & {
      tier: string;
      resources: Record<string, number>;
    };
    expect(json.tier).toBe("city");
    expect(json.resources).toEqual({ crop: 10, ore: 20 });
    const stored = villages.get(FARM_OUTPOST) as {
      tier: string;
      unlockedSlots: number;
    };
    expect(stored.tier).toBe("city");
    expect(stored.unlockedSlots).toBe(1);
    expect(MAX_SLOTS_BY_TIER.city).toBe(MAX_SLOTS_BY_TIER.village);
  });

  it("최종 단계(metropolis) → 409 max_tier", async () => {
    seedBuiltVillage(FARM_OUTPOST, { tier: "metropolis", unlockedSlots: 1 });
    resourcesByGuild.set(MY_GUILD, { crop: 99999, ore: 99999 });
    const res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as AnyJson).error).toBe("max_tier");
  });
});

// ── END-TO-END (이 파일의 핵심) ──────────────────────────────────────────────
// build(이름) → 골드로 칸 1개 해금(종류 선택 없음·자리표시) → 재화 충족 시 village→city 업그레이드.
// [PR-3] 슬롯 생산 폐지 — crop/ore 풀은 사냥 드랍→기부로 채워진다(여기선 풀을 직접 세팅).
describe("정착지 라이프사이클 end-to-end", () => {
  it("건설 → 칸 1개 해금(자리표시) → village→city 업그레이드", async () => {
    setOwner(FARM_OUTPOST, MY_GUILD);

    // 1) build — 이름만(길드 금고 골드 1천만 차감).
    guildGold.set(MY_GUILD, 1_000_000_000);
    let res = await buildPOST(jreq({ outpostId: FARM_OUTPOST, name: "황금밀밭" }));
    expect(res.status).toBe(200);
    expect((villages.get(FARM_OUTPOST) as { unlockedSlots: number }).unlockedSlots).toBe(0);
    let expectedGold = 1_000_000_000 - VILLAGE_BUILD_GOLD_COST;
    expect(guildGold.get(MY_GUILD)).toBe(expectedGold);

    // 2) 마을 판 1칸을 해금 — 첫 칸 유료(5천만), 종류 선택 없음.
    const unlockCost = slotUnlockGoldCost(0);
    res = await unlockPOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(200);
    const unlocked = (await res.json()) as { unlockedSlots: number; gold: number };
    expect(unlocked.unlockedSlots).toBe(1);
    expectedGold -= unlockCost;
    expect(unlocked.gold).toBe(expectedGold);
    expect((villages.get(FARM_OUTPOST) as { unlockedSlots: number }).unlockedSlots).toBe(1);

    // 3) 업그레이드 재화(드랍→기부로 채워질 풀)를 임계로 세팅 후 village→city 승급.
    const cost = UPGRADE_COST.village!;
    resourcesByGuild.set(MY_GUILD, {
      crop: cost.crop! + 1,
      ore: cost.ore! + 2,
    });
    res = await upgradePOST(jreq({ outpostId: FARM_OUTPOST }));
    expect(res.status).toBe(200);
    const up = (await res.json()) as { tier: string; resources: Record<string, number> };
    expect(up.tier).toBe("city");
    expect(up.resources).toEqual({ crop: 1, ore: 2 });

    // 4) GET — city·해금 칸 1.
    res = await GET(getReq());
    const after = (await res.json()) as {
      villages: Array<{
        outpostId: string;
        tier: string;
        unlockedSlots: number;
        maxSlots: number;
      }>;
    };
    const farm = after.villages.find((v) => v.outpostId === FARM_OUTPOST)!;
    expect(farm.tier).toBe("city");
    expect(farm.maxSlots).toBe(MAX_SLOTS_BY_TIER.city); // 1
    expect(farm.unlockedSlots).toBe(1);
  });
});
