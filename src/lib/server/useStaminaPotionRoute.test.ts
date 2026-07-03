// 스태미나 포션 사용 라우트 통합 테스트 — POST /api/v2/me/use-stamina-potion.
// savesKv(lock/upsert)를 stateful 모킹하고 실제 스태미나 로직을 통과시켜 ① 포션 0 거부
// ② 사용 시 1 차감 + 스태미나 회복(최대치 초과 비축 허용)을 검증.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
const k = (u: string, key: string) => `${u}::${key}`;

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "u1"),
}));
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: unknown, u: string, key: string, fb: unknown) =>
      store.has(k(u, key)) ? store.get(k(u, key)) : fb,
  ),
  upsertSave: vi.fn(
    async (_tx: unknown, u: string, key: string, v: unknown) => {
      store.set(k(u, key), v);
    },
  ),
}));

import { POST } from "@/app/api/v2/me/use-stamina-potion/route";
import { MAX_STAMINA, staminaOverchargeCap } from "@/adventure/v2/stamina";
import {
  STAMINA_POTIONS_KEY,
  STAMINA_POTION_RESTORE,
} from "@/adventure/v2/staminaPotions";
import { ensureUser } from "@/lib/server/ensureUser";

const char = () => store.get(k("u1", "character.v2")) as {
  stamina: { current: number };
};
const potCount = () =>
  (store.get(k("u1", STAMINA_POTIONS_KEY)) as { count: number }).count;

// body { count } 를 담은 POST Request. 인자 없으면 본문 없음 → 라우트가 count=1 폴백.
const req = (body?: unknown) =>
  new Request("http://localhost/api/v2/me/use-stamina-potion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("POST /api/v2/me/use-stamina-potion", () => {
  beforeEach(() => {
    store.clear();
    vi.mocked(ensureUser).mockResolvedValue("u1");
  });

  it("미인증 → 401", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("포션 0 → 400 no_potion, 스태미나 불변", async () => {
    const t = Date.now();
    store.set(k("u1", "character.v2"), {
      stamina: { current: 100, lastUpdatedAt: t },
    });
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 0 });
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("no_potion");
    expect(char().stamina.current).toBe(100);
  });

  it("사용 → 200, 포션 1 차감 + 스태미나 +RESTORE", async () => {
    const t = Date.now();
    store.set(k("u1", "character.v2"), {
      stamina: { current: 100, lastUpdatedAt: t },
    });
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 2 });
    const res = await POST(req());
    const j = (await res.json()) as { count: number; stamina: number };
    expect(res.status).toBe(200);
    expect(j.count).toBe(1);
    expect(j.stamina).toBe(100 + STAMINA_POTION_RESTORE);
    expect(potCount()).toBe(1);
    expect(char().stamina.current).toBe(100 + STAMINA_POTION_RESTORE);
  });

  it("count 지정 → N개 한 번에 차감 + N×RESTORE 회복", async () => {
    const t = Date.now();
    store.set(k("u1", "character.v2"), {
      stamina: { current: 100, lastUpdatedAt: t },
    });
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 5 });
    const res = await POST(req({ count: 3 }));
    const j = (await res.json()) as { count: number; used: number };
    expect(res.status).toBe(200);
    expect(j.used).toBe(3);
    expect(j.count).toBe(2);
    expect(potCount()).toBe(2);
    expect(char().stamina.current).toBe(100 + STAMINA_POTION_RESTORE * 3);
  });

  it("만피 근처에서 다량 사용 → 최대치 초과 비축(상한 내)", async () => {
    const t = Date.now();
    // 만피(5000)에서 포션 10개 사용 → 5000 + 200*10 = 7000 (상한 15000 내, 허용).
    store.set(k("u1", "character.v2"), {
      stamina: { current: MAX_STAMINA, lastUpdatedAt: t },
    });
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 10 });
    const res = await POST(req({ count: 10 }));
    const j = (await res.json()) as { stamina: number; used: number };
    expect(res.status).toBe(200);
    expect(j.used).toBe(10);
    expect(j.stamina).toBe(MAX_STAMINA + STAMINA_POTION_RESTORE * 10);
    expect(char().stamina.current).toBe(MAX_STAMINA + STAMINA_POTION_RESTORE * 10);
  });

  it("비축 상한 초과 사용 → 필요한 개수까지만 차감하고 상한으로 클램프", async () => {
    const t = Date.now();
    const cap = staminaOverchargeCap(MAX_STAMINA); // 고정 10000 (max 5000 < 상한)
    // 상한 근처(cap-100)에서 10개 요청 → 1개만 써도 cap 도달, 9개는 보존.
    store.set(k("u1", "character.v2"), {
      stamina: { current: cap - 100, lastUpdatedAt: t },
    });
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 10 });
    const res = await POST(req({ count: 10 }));
    const j = (await res.json()) as {
      stamina: number;
      used: number;
      count: number;
    };
    expect(res.status).toBe(200);
    expect(j.used).toBe(1);
    expect(j.count).toBe(9);
    expect(j.stamina).toBe(cap);
    expect(char().stamina.current).toBe(cap);
    expect(potCount()).toBe(9);
  });

  it("이미 비축 상한이면 사용 거부 + 포션 불변", async () => {
    const t = Date.now();
    const cap = staminaOverchargeCap(MAX_STAMINA);
    store.set(k("u1", "character.v2"), {
      stamina: { current: cap, lastUpdatedAt: t },
    });
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 3 });
    const res = await POST(req({ count: 3 }));
    const j = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(j.error).toBe("stamina_cap");
    expect(char().stamina.current).toBe(cap);
    expect(potCount()).toBe(3);
  });

  it("이미 상한 초과(레거시) → 사용 거부 + 기존 스태미나 보존", async () => {
    const t = Date.now();
    const cap = staminaOverchargeCap(MAX_STAMINA);
    const over = cap + 5000; // 상한보다 높은 레거시 비축분
    store.set(k("u1", "character.v2"), {
      stamina: { current: over, lastUpdatedAt: t },
    });
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 3 });
    const res = await POST(req({ count: 3 }));
    const j = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(j.error).toBe("stamina_cap");
    expect(char().stamina.current).toBe(over); // min(cap,…) 단독이면 cap 으로 깎였을 것
    expect(potCount()).toBe(3);
  });

  it("count 가 보유 초과 → 보유 수로 클램프", async () => {
    const t = Date.now();
    store.set(k("u1", "character.v2"), {
      stamina: { current: 0, lastUpdatedAt: t },
    });
    store.set(k("u1", STAMINA_POTIONS_KEY), { count: 2 });
    const res = await POST(req({ count: 10 }));
    const j = (await res.json()) as { used: number; count: number };
    expect(j.used).toBe(2);
    expect(j.count).toBe(0);
    expect(potCount()).toBe(0);
  });
});
