import { describe, expect, it, vi } from "vitest";
import { runLifeCollectAll } from "./lifeCollectAll";

type Handler = (body: Record<string, unknown>) => { status?: number; json: Record<string, unknown> };

function fakeRequest(handlers: Record<string, Handler>) {
  const calls: string[] = [];
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const key = `${method} ${String(input)}${body.action ? `#${String(body.action)}` : ""}`;
    calls.push(key);
    const handler = handlers[key];
    if (!handler) return Response.json({ ok: false, error: "unexpected" }, { status: 500 });
    const { status = 200, json } = handler(body);
    return Response.json(json, { status });
  });
  return { calls, request };
}

const NOW = 1_800_000_000_000;
const readyMining = {
  ok: true,
  serverNow: NOW,
  activeAutoActivity: "mining",
  autoSession: { sessionId: "s1", planId: "extended", sourceId: "iron", sourceName: "철 광맥", spotId: "iron_quarry", startedAt: NOW - 7_200_000, readyAt: NOW - 1 },
};
const idleFarm = { ok: true, now: NOW, farm: { plots: [{ id: "p1", cropId: null, readyAt: null }] } };

describe("runLifeCollectAll", () => {
  it("자동 채집을 정산하고 다시 시작한 뒤 밭과 목장을 차례로 처리한다", async () => {
    const started: Array<Record<string, unknown>> = [];
    const { calls, request } = fakeRequest({
      "GET /api/v2/mining/status": () => ({ json: readyMining }),
      "POST /api/v2/mining/auto#claim": () => ({ json: { ok: true, materialName: "철광석", materialsGained: 430 } }),
      "POST /api/v2/mining/auto#start": (body) => {
        started.push(body);
        return { json: { ok: true } };
      },
      "GET /api/v2/farm": () => ({
        json: {
          ok: true,
          now: NOW,
          farm: {
            plots: [
              { id: "p1", cropId: "wheat", readyAt: NOW - 5 },
              { id: "p2", cropId: "corn", readyAt: NOW + 60_000 },
              { id: "p3", cropId: null, readyAt: null },
            ],
          },
        },
      }),
      "POST /api/v2/farm/harvest": () => ({ json: { ok: true, result: { farmingXpGained: 20, seedReturned: 0 } } }),
      "POST /api/v2/farm/plant": () => ({ json: { ok: true, result: { planted: 1, stoppedError: null } } }),
      "POST /api/v2/farm/ranch/collect": () => ({ json: { ok: true } }),
      "POST /api/v2/farm/ranch/feed": () => ({ json: { ok: true } }),
    });

    const lines = await runLifeCollectAll(request);

    expect(calls).toEqual([
      "GET /api/v2/mining/status",
      "POST /api/v2/mining/auto#claim",
      "POST /api/v2/mining/auto#start",
      "GET /api/v2/farm",
      "POST /api/v2/farm/harvest",
      "POST /api/v2/farm/plant",
      "POST /api/v2/farm/ranch/collect",
      "POST /api/v2/farm/ranch/feed",
    ]);
    expect(started).toEqual([{ action: "start", spotId: "iron_quarry", planId: "extended" }]);
    expect(lines).toEqual([
      { area: "gathering", tone: "ok", text: "자동 채광: 철광석 +430. 철 광맥에서 다시 시작했습니다." },
      { area: "farm", tone: "ok", text: "밭: 1칸을 수확하고 1칸에 다시 심었습니다. 농사 XP +20." },
      { area: "ranch", tone: "ok", text: "목장: 산물을 수거하고 사료를 채웠습니다." },
    ]);
  });

  it("자동 벌목이 돌고 있으면 벌목 상태를 읽고, 아직 진행 중이면 건드리지 않는다", async () => {
    const { calls, request } = fakeRequest({
      "GET /api/v2/mining/status": () => ({ json: { ok: true, serverNow: NOW, activeAutoActivity: "woodcutting", autoSession: null } }),
      "GET /api/v2/woodcutting/status": () => ({
        json: { ok: true, serverNow: NOW, activeAutoActivity: "woodcutting", autoSession: { ...readyMining.autoSession, sourceName: "소나무", spotId: "pine_grove", readyAt: NOW + 600_000 } },
      }),
      "GET /api/v2/farm": () => ({ json: idleFarm }),
      "POST /api/v2/farm/ranch/collect": () => ({ status: 409, json: { ok: false, error: "nothing_to_collect" } }),
      "POST /api/v2/farm/ranch/feed": () => ({ status: 409, json: { ok: false, error: "feed_capacity" } }),
    });

    const lines = await runLifeCollectAll(request);

    expect(calls).not.toContain("POST /api/v2/woodcutting/auto#claim");
    expect(lines).toEqual([
      { area: "gathering", tone: "info", text: "자동 벌목: 아직 진행 중입니다." },
      { area: "farm", tone: "info", text: "밭: 수확할 칸이 없습니다." },
      { area: "ranch", tone: "info", text: "목장: 수거하거나 채울 것이 없습니다." },
    ]);
  });

  it("다시 시작에 사람 확인이 필요하면 정산만 하고 알린다", async () => {
    const { request } = fakeRequest({
      "GET /api/v2/mining/status": () => ({ json: readyMining }),
      "POST /api/v2/mining/auto#claim": () => ({ json: { ok: true, materialName: "철광석", materialsGained: 12 } }),
      "POST /api/v2/mining/auto#start": () => ({ status: 403, json: { ok: false, error: "human_verification_required" } }),
      "GET /api/v2/farm": () => ({ json: idleFarm }),
      "POST /api/v2/farm/ranch/collect": () => ({ json: { ok: true } }),
      "POST /api/v2/farm/ranch/feed": () => ({ status: 409, json: { ok: false, error: "feed_capacity" } }),
    });
    const lines = await runLifeCollectAll(request);
    expect(lines[0]).toEqual({
      area: "gathering",
      tone: "info",
      text: "자동 채광: 철광석 +12. 다시 시작하려면 채광 화면에서 사람 확인을 해 주세요.",
    });
    expect(lines[2]).toEqual({ area: "ranch", tone: "ok", text: "목장: 산물을 수거했습니다." });
  });

  it("자동 채집이 없고 요청이 실패해도 나머지를 이어서 처리한다", async () => {
    const { request } = fakeRequest({
      "GET /api/v2/mining/status": () => ({ json: { ok: true, serverNow: NOW, activeAutoActivity: null, autoSession: null } }),
      "GET /api/v2/farm": () => ({ status: 500, json: { ok: false } }),
      "POST /api/v2/farm/ranch/collect": () => ({ status: 400, json: { ok: false, error: "ranch_locked" } }),
      "POST /api/v2/farm/ranch/feed": () => ({ status: 400, json: { ok: false, error: "ranch_locked" } }),
    });
    const lines = await runLifeCollectAll(request);
    expect(lines).toEqual([
      { area: "gathering", tone: "info", text: "자동 채집: 진행 중인 작업이 없습니다." },
      { area: "farm", tone: "error", text: "밭: 농장 정보를 불러오지 못했습니다." },
      { area: "ranch", tone: "info", text: "목장: 수거하거나 채울 것이 없습니다." },
    ]);
  });

  it("정산과 수확에서 얻은 명장 산물을 결과 줄에 적는다", async () => {
    const lifeMajor = (name: string, count: number) => ({
      masteryXpGained: 0,
      masterProduct: { materialId: "x", name, count },
    });
    const { request } = fakeRequest({
      "GET /api/v2/mining/status": () => ({ json: readyMining }),
      "POST /api/v2/mining/auto#claim": () => ({
        json: { ok: true, materialName: "철광석", materialsGained: 430, lifeMajor: lifeMajor("명장 합금", 3) },
      }),
      "POST /api/v2/mining/auto#start": () => ({ json: { ok: true } }),
      "GET /api/v2/farm": () => ({
        json: { ok: true, now: NOW, farm: { plots: [{ id: "p1", cropId: "wheat", readyAt: NOW - 5 }] } },
      }),
      "POST /api/v2/farm/harvest": () => ({
        json: { ok: true, lifeMajor: lifeMajor("명장 작물", 1), result: { farmingXpGained: 20, seedReturned: 0 } },
      }),
      "POST /api/v2/farm/plant": () => ({ json: { ok: true, result: { planted: 1, stoppedError: null } } }),
      "POST /api/v2/farm/ranch/collect": () => ({ json: { ok: true } }),
      "POST /api/v2/farm/ranch/feed": () => ({ json: { ok: true } }),
    });

    const lines = await runLifeCollectAll(request);

    expect(lines[0].text).toBe("자동 채광: 철광석 +430 · 명장 합금 +3. 철 광맥에서 다시 시작했습니다.");
    expect(lines[1].text).toBe("밭: 1칸을 수확하고 1칸에 다시 심었습니다. 농사 XP +20. 명장 작물 +1.");
  });

  describe("예약한 다음 작업이 이어졌을 때", () => {
    const farmAndRanch = {
      "GET /api/v2/farm": () => ({ json: idleFarm }),
      "POST /api/v2/farm/ranch/collect": () => ({ json: { ok: true } }),
      "POST /api/v2/farm/ranch/feed": () => ({ json: { ok: true } }),
    };
    const chainedWoodcutting = (readyAt: number) => ({
      activity: "woodcutting",
      session: { sessionId: "s2", planId: "extended", sourceId: "pine", sourceName: "소나무", spotId: "pine_grove", startedAt: NOW - 3_600_000, readyAt },
    });

    it("예약 작업이 아직 도는 중이면 방금 끝난 작업을 다음 작업으로 다시 예약한다", async () => {
      const reserved: Array<Record<string, unknown>> = [];
      const { calls, request } = fakeRequest({
        ...farmAndRanch,
        "GET /api/v2/mining/status": () => ({ json: readyMining }),
        "POST /api/v2/mining/auto#claim": () => ({
          json: { ok: true, serverNow: NOW, materialName: "철광석", materialsGained: 430, chainedAuto: chainedWoodcutting(NOW + 3_600_000) },
        }),
        "POST /api/v2/mining/auto#reserve": (body) => {
          reserved.push(body);
          return { json: { ok: true } };
        },
      });

      const lines = await runLifeCollectAll(request);

      expect(calls.slice(0, 3)).toEqual([
        "GET /api/v2/mining/status",
        "POST /api/v2/mining/auto#claim",
        "POST /api/v2/mining/auto#reserve",
      ]);
      expect(reserved).toEqual([{ action: "reserve", spotId: "iron_quarry", planId: "extended" }]);
      expect(lines[0]).toEqual({
        area: "gathering",
        tone: "ok",
        text: "자동 채광: 철광석 +430. 예약한 벌목이 이어서 진행 중이고, 채광을 다음 작업으로 다시 예약했습니다.",
      });
    });

    it("예약 작업까지 끝나 있으면 둘 다 정산하고 같은 순서로 다시 건다", async () => {
      const sent: string[] = [];
      const { calls, request } = fakeRequest({
        ...farmAndRanch,
        "GET /api/v2/mining/status": () => ({ json: readyMining }),
        "POST /api/v2/mining/auto#claim": () => ({
          json: { ok: true, serverNow: NOW, materialName: "철광석", materialsGained: 430, chainedAuto: chainedWoodcutting(NOW - 10) },
        }),
        "POST /api/v2/woodcutting/auto#claim": () => ({
          json: { ok: true, serverNow: NOW, materialName: "소나무 원목", materialsGained: 300, chainedAuto: null },
        }),
        "POST /api/v2/mining/auto#start": (body) => {
          sent.push(`start:${String(body.spotId)}:${String(body.planId)}`);
          return { json: { ok: true } };
        },
        "POST /api/v2/woodcutting/auto#reserve": (body) => {
          sent.push(`reserve:${String(body.spotId)}:${String(body.planId)}`);
          return { json: { ok: true } };
        },
      });

      const lines = await runLifeCollectAll(request);

      expect(calls.slice(0, 5)).toEqual([
        "GET /api/v2/mining/status",
        "POST /api/v2/mining/auto#claim",
        "POST /api/v2/woodcutting/auto#claim",
        "POST /api/v2/mining/auto#start",
        "POST /api/v2/woodcutting/auto#reserve",
      ]);
      expect(sent).toEqual(["start:iron_quarry:extended", "reserve:pine_grove:extended"]);
      expect(lines[0]).toEqual({
        area: "gathering",
        tone: "ok",
        text: "자동 채광: 철광석 +430. 예약한 벌목: 소나무 원목 +300. 두 작업을 다시 걸었습니다.",
      });
    });

    it("다시 예약하지 못하면 처음 작업만 다시 시작했다고 알린다", async () => {
      const { request } = fakeRequest({
        ...farmAndRanch,
        "GET /api/v2/mining/status": () => ({ json: readyMining }),
        "POST /api/v2/mining/auto#claim": () => ({
          json: { ok: true, serverNow: NOW, materialName: "철광석", materialsGained: 430, chainedAuto: chainedWoodcutting(NOW - 10) },
        }),
        "POST /api/v2/woodcutting/auto#claim": () => ({
          json: { ok: true, serverNow: NOW, materialName: "소나무 원목", materialsGained: 300 },
        }),
        "POST /api/v2/mining/auto#start": () => ({ json: { ok: true } }),
        "POST /api/v2/woodcutting/auto#reserve": () => ({ status: 403, json: { ok: false, error: "support_required" } }),
      });

      const lines = await runLifeCollectAll(request);

      expect(lines[0].text).toBe(
        "자동 채광: 철광석 +430. 예약한 벌목: 소나무 원목 +300. 채광만 다시 시작했습니다.",
      );
    });
  });
});
