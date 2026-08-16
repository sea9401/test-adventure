import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  insertFeedEntry: vi.fn(async () => {}),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "cultivate-user"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx, _userId, key: string, fallback: unknown) =>
      mocks.store.has(key) ? mocks.store.get(key) : fallback,
  ),
  upsertSave: vi.fn(
    async (_tx, _userId, key: string, value: unknown) => {
      mocks.store.set(key, value);
    },
  ),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: mocks.insertFeedEntry,
}));

import { POST } from "./route";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";

function maxRequest() {
  return cultivationRequest({ mode: "max" });
}

function cultivationRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/me/cultivate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.clear();
  mocks.store.set("character.v2", { class: "warrior", level: 1 });
  mocks.store.set("proficiency.v2", {
    ...emptyProficiency(),
    points: 1_000,
  });
});

describe("POST /api/v2/me/cultivate — 특별 수행", () => {
  it("mode=max는 다음 비용을 낼 수 없을 때까지 한 트랜잭션에서 수행한다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mocks.store.set("proficiency.v2", {
      ...emptyProficiency(),
      points: 40,
    });

    const response = await POST(maxRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      performed: 2,
      spent: 40,
      points: 0,
      hasMore: false,
    });
    expect(mocks.store.get("proficiency.v2")).toMatchObject({ points: 0 });
  });

  it("본문 없는 기존 요청은 1회만 수행한다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, performed: 1, mult: 1 });
  });

  it("일괄 수행에서 발생한 각성 횟수만큼 소식을 기록한다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mocks.store.set("proficiency.v2", {
      ...emptyProficiency(),
      points: 136,
    });

    const response = await POST(maxRequest());
    const json = await response.json();

    expect(json).toMatchObject({ performed: 2, awakenings: 2 });
    expect(mocks.insertFeedEntry).toHaveBeenCalledTimes(2);
  });

  it("일괄 수행은 요청당 10,000회에서 멈추고 추가 수행 가능을 알린다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mocks.store.set("proficiency.v2", {
      ...emptyProficiency(),
      points: 2_000_000_000,
    });

    const response = await POST(maxRequest());
    const json = await response.json();

    expect(json).toMatchObject({ performed: 10_000, hasMore: true });
  });

  it("한 번의 수행 비용도 낼 수 없으면 기존 부족 오류를 반환한다", async () => {
    mocks.store.set("proficiency.v2", {
      ...emptyProficiency(),
      points: 7,
    });

    const response = await POST(maxRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "insufficient_proficiency",
      required: 8,
      have: 7,
    });
  });

  it("일반 수행은 새 한계 증가량만큼 대기 성장값을 현재 직업 프로필로 재분배한다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mocks.store.set("proficiency.v2", {
      ...emptyProficiency(),
      points: 1_000,
      growthRespecPoints: 10,
    });

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.redistributedGrowthPoints).toBe(4);
    expect(json.growthRespecPoints).toBe(6);
    expect(mocks.store.get("proficiency.v2")).toMatchObject({
      grown: { str: 2, dex: 1, vit: 1 },
      growthRespecPoints: 6,
    });
  });

  it("과거 방문한 성채기사의 수행 수치를 현재 직업과 무관하게 적용한다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mocks.store.set("character.v2", { class: "mage", level: 1 });
    mocks.store.set("proficiency.v2", {
      ...emptyProficiency(),
      points: 1_000,
      jobHistory: ["fortressknight"],
    });

    const response = await POST(
      cultivationRequest({ targetJobId: "fortressknight" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      targetJobId: "fortressknight",
      targetJobName: "성채기사",
      group: "warrior",
    });
    expect(mocks.store.get("proficiency.v2")).toMatchObject({
      points: 992,
      caps: { str: 2, vit: 4 },
      groups: { warrior: { cultivations: 1 } },
    });
  });

  it("전직 이력 도입 전 직업 숙련도도 수행 직업 방문 증거로 인정한다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mocks.store.set("character.v2", { class: "mage", level: 1 });
    mocks.store.set("proficiency.v2", {
      ...emptyProficiency(),
      points: 1_000,
      jobCumLevel: { fortressknight: 1 },
    });

    const response = await POST(
      cultivationRequest({ targetJobId: "fortressknight" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      targetJobId: "fortressknight",
    });
  });

  it("방문하지 않은 직업의 수행 수치는 거부하고 포인트를 보존한다", async () => {
    mocks.store.set("character.v2", { class: "mage", level: 1 });

    const response = await POST(
      cultivationRequest({ targetJobId: "fortressknight" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "unvisited_job",
    });
    expect(mocks.store.get("proficiency.v2")).toMatchObject({ points: 1_000 });
  });

  it("방문한 생활직은 수행 대상으로 선택할 수 없다", async () => {
    mocks.store.set("character.v2", { class: "mage", level: 1 });
    mocks.store.set("proficiency.v2", {
      ...emptyProficiency(),
      points: 1_000,
      jobHistory: ["fisher"],
    });

    const response = await POST(
      cultivationRequest({ targetJobId: "fisher" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "lifestyle_job" });
    expect(mocks.store.get("proficiency.v2")).toMatchObject({ points: 1_000 });
  });

  it("현재 생활직이어도 방문한 전투직 수행 수치를 선택할 수 있다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mocks.store.set("character.v2", {
      class: "survivor",
      specChoice: "fisher",
      level: 1,
    });
    mocks.store.set("proficiency.v2", {
      ...emptyProficiency(),
      points: 1_000,
      jobHistory: ["fortressknight", "fisher"],
    });

    const response = await POST(
      cultivationRequest({ targetJobId: "fortressknight" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      targetJobId: "fortressknight",
      group: "warrior",
    });
  });

  it("5배 각성만 서버 전체 전광판 소식으로 기록한다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.mult).toBe(5);
    expect(mocks.insertFeedEntry).toHaveBeenCalledWith(
      "cultivate-user",
      "cultivation_awakening",
      { cultivationMult: 5 },
    );
  });

  it("3배 대성공은 전체 전광판에 기록하지 않는다", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.02);

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.mult).toBe(3);
    expect(mocks.insertFeedEntry).not.toHaveBeenCalled();
  });

  it("생활직은 수행할 수 없고 숙달 포인트도 소모하지 않는다", async () => {
    mocks.store.set("character.v2", {
      class: "survivor",
      specChoice: "fisher",
      level: 1,
    });

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ ok: false, error: "lifestyle_job" });
    expect(mocks.store.get("proficiency.v2")).toMatchObject({ points: 1_000 });
    expect(mocks.insertFeedEntry).not.toHaveBeenCalled();
  });
});
