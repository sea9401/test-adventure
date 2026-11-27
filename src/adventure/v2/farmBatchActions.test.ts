import { describe, expect, it, vi } from "vitest";
import {
  farmBatchOutcomeText,
  farmReplantOutcomeText,
  runFarmHarvestAndReplant,
  runFarmPlotBatch,
} from "./farmBatchActions";

describe("runFarmPlotBatch", () => {
  it("여러 밭 심기는 요청 1번으로 서버에 묶어 보낸다", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const onSuccess = vi.fn();
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({
        ok: true,
        result: { planted: 3, stoppedError: null },
      });
    });

    const result = await runFarmPlotBatch({
      action: "plant",
      plotIds: ["plot-3", "plot-1", "plot-2"],
      cropId: "wheat",
      request,
      onSuccess,
    });

    expect(requests).toEqual([
      {
        url: "/api/v2/farm/plant",
        body: { plotIds: ["plot-3", "plot-1", "plot-2"], cropId: "wheat" },
      },
    ]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ completed: 3, error: null, seedsReturned: 0, farmingXpGained: 0 });
  });

  it("24칸 심기도 요청 제한을 한 번만 쓴다", async () => {
    const plotIds = Array.from({ length: 24 }, (_, i) => `plot-${i + 1}`);
    const request = vi.fn(async () =>
      Response.json({ ok: true, result: { planted: 24, stoppedError: null } }),
    );

    const result = await runFarmPlotBatch({
      action: "plant",
      plotIds,
      cropId: "wheat",
      request,
      onSuccess: vi.fn(),
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.completed).toBe(24);
  });

  it("서버가 일부만 심고 멈추면 심은 칸 수와 사유를 돌려준다", async () => {
    const onSuccess = vi.fn();
    const request = vi.fn(async () =>
      Response.json({ ok: true, result: { planted: 1, stoppedError: "no_seed" } }),
    );

    const result = await runFarmPlotBatch({
      action: "plant",
      plotIds: ["plot-1", "plot-2", "plot-3"],
      cropId: "wheat",
      request,
      onSuccess,
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      completed: 1,
      error: "no_seed",
      seedsReturned: 0, farmingXpGained: 0,
    });
  });

  it("한 칸도 못 심으면 오류만 돌려준다", async () => {
    const onSuccess = vi.fn();
    const request = vi.fn(async () =>
      Response.json({ ok: false, error: "no_seed" }, { status: 409 }),
    );

    const result = await runFarmPlotBatch({
      action: "plant",
      plotIds: ["plot-1", "plot-2"],
      cropId: "wheat",
      request,
      onSuccess,
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result).toEqual({
      completed: 0,
      error: "no_seed",
      seedsReturned: 0, farmingXpGained: 0,
    });
  });

  it("수확은 중간 요청이 실패하면 이후 밭을 처리하지 않는다", async () => {
    const requestedPlotIds: string[] = [];
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { plotId: string };
      requestedPlotIds.push(body.plotId);
      if (body.plotId === "plot-2") {
        return Response.json(
          { ok: false, error: "not_ready" },
          { status: 409 },
        );
      }
      return Response.json({ ok: true });
    });

    const result = await runFarmPlotBatch({
      action: "harvest",
      plotIds: ["plot-1", "plot-2", "plot-3"],
      request,
      onSuccess: vi.fn(),
    });

    expect(requestedPlotIds).toEqual(["plot-1", "plot-2"]);
    expect(result).toEqual({
      completed: 1,
      error: "not_ready",
      seedsReturned: 0, farmingXpGained: 0,
    });
  });

  it("여러 밭 수확 응답의 농사 XP를 합산한다", async () => {
    const xpByPlot = { "plot-1": 30, "plot-2": 45, "plot-3": 60 };
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { plotId: keyof typeof xpByPlot };
      return Response.json({
        ok: true,
        result: { farmingXpGained: xpByPlot[body.plotId], seedReturned: 1 },
      });
    });

    const result = await runFarmPlotBatch({
      action: "harvest",
      plotIds: ["plot-1", "plot-2", "plot-3"],
      request,
      onSuccess: vi.fn(),
    });

    expect(result).toEqual({
      completed: 3,
      error: null,
      farmingXpGained: 135,
      seedsReturned: 3,
    });
  });
});

describe("farmBatchOutcomeText", () => {
  it("완료한 일괄 작업의 종류와 칸 수를 요약한다", () => {
    expect(farmBatchOutcomeText("harvest", 3, null)).toBe(
      "3칸을 모두 수확했습니다.",
    );
    expect(farmBatchOutcomeText("harvest", 3, null, undefined, 135)).toBe(
      "3칸을 모두 수확했습니다. 농사 XP +135.",
    );
    expect(farmBatchOutcomeText("plant", 2, null, "밀")).toBe(
      "밀 2칸에 심었습니다.",
    );
    expect(farmBatchOutcomeText("fertilize", 1, null)).toBe(
      "유기질 거름을 1칸에 뿌렸습니다.",
    );
  });

  it("부분 완료와 첫 요청 실패를 구분한다", () => {
    expect(farmBatchOutcomeText("plant", 1, "no_seed", "밀")).toBe(
      "1칸 처리 후 일괄 작업이 중단되었습니다.",
    );
    expect(farmBatchOutcomeText("plant", 0, "no_seed", "밀")).toBe(
      "no_seed",
    );
  });
});

it("일괄 수확 알림에 반환한 씨앗 합계를 표시한다", () => {
  expect(farmBatchOutcomeText("harvest", 3, null, undefined, 135, 2)).toContain("씨앗 2개 반환");
});

describe("runFarmHarvestAndReplant", () => {
  function fakeRequest(options: { failHarvestAt?: string; plantable?: Record<string, number> } = {}) {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url: String(input), body });
      if (String(input).endsWith("/harvest")) {
        if (body.plotId === options.failHarvestAt) {
          return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
        }
        return Response.json({ ok: true, result: { farmingXpGained: 10, seedReturned: 1 } });
      }
      const plotIds = body.plotIds as string[];
      const limit = options.plantable?.[String(body.cropId)] ?? plotIds.length;
      return Response.json({
        ok: true,
        result: {
          planted: Math.min(limit, plotIds.length),
          stoppedError: limit < plotIds.length ? "not_enough_seeds" : null,
        },
      });
    });
    return { calls, request };
  }

  const plots = [
    { plotId: "p1", cropId: "wheat" },
    { plotId: "p2", cropId: "corn" },
    { plotId: "p3", cropId: "wheat" },
  ];

  it("모두 수확한 뒤 작물별로 묶어 같은 작물을 다시 심는다", async () => {
    const { calls, request } = fakeRequest();
    const onSuccess = vi.fn();
    const result = await runFarmHarvestAndReplant({ plots, request, onSuccess });

    expect(calls.map((call) => [call.url, call.body])).toEqual([
      ["/api/v2/farm/harvest", { plotId: "p1" }],
      ["/api/v2/farm/harvest", { plotId: "p2" }],
      ["/api/v2/farm/harvest", { plotId: "p3" }],
      ["/api/v2/farm/plant", { plotIds: ["p1", "p3"], cropId: "wheat" }],
      ["/api/v2/farm/plant", { plotIds: ["p2"], cropId: "corn" }],
    ]);
    expect(result).toEqual({
      harvested: 3,
      planted: 3,
      error: null,
      farmingXpGained: 30,
      seedsReturned: 3,
    });
    expect(onSuccess).toHaveBeenCalledTimes(5);
  });

  it("수확이 중간에 멈추면 수확한 칸만 다시 심고 사유를 돌려준다", async () => {
    const { calls, request } = fakeRequest({ failHarvestAt: "p3" });
    const result = await runFarmHarvestAndReplant({ plots, request, onSuccess: vi.fn() });
    expect(calls.at(-2)).toEqual({ url: "/api/v2/farm/plant", body: { plotIds: ["p1"], cropId: "wheat" } });
    expect(calls.at(-1)).toEqual({ url: "/api/v2/farm/plant", body: { plotIds: ["p2"], cropId: "corn" } });
    expect(result).toMatchObject({ harvested: 2, planted: 2, error: "rate_limited" });
  });

  it("씨앗이 모자라면 심은 칸 수만 세고 사유를 남긴다", async () => {
    const { request } = fakeRequest({ plantable: { wheat: 1 } });
    const result = await runFarmHarvestAndReplant({ plots, request, onSuccess: vi.fn() });
    expect(result).toMatchObject({ harvested: 3, planted: 2, error: "not_enough_seeds" });
  });

  it("결과를 한 문장으로 적는다", () => {
    expect(farmReplantOutcomeText({ harvested: 12, planted: 12, farmingXpGained: 340, seedsReturned: 2 })).toBe(
      "12칸을 수확하고 12칸에 다시 심었습니다. 씨앗 2개 반환. 농사 XP +340.",
    );
    expect(farmReplantOutcomeText({ harvested: 12, planted: 9, farmingXpGained: 0, seedsReturned: 0 })).toBe(
      "12칸을 수확하고 9칸에 다시 심었습니다. 씨앗이 모자라 3칸은 비어 있습니다.",
    );
  });
});

describe("명장 작물 합산", () => {
  const product = (count: number) => ({
    masteryXpGained: 0,
    masterProduct: { materialId: "v2_master_crop", name: "명장 작물", count },
  });

  it("여러 밭 수확에서 얻은 명장 작물을 합친다", async () => {
    const responses = [product(1), { masteryXpGained: 0, masterProduct: null }, product(1)];
    const request = vi.fn(async () =>
      Response.json({ ok: true, lifeMajor: responses.shift(), result: { farmingXpGained: 5 } }),
    );

    const result = await runFarmPlotBatch({
      action: "harvest",
      plotIds: ["p1", "p2", "p3"],
      request,
      onSuccess: vi.fn(),
    });

    expect(result.masterProduct).toEqual({ name: "명장 작물", count: 2 });
  });

  it("수확하고 다시 심기 결과에도 합계를 넘긴다", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/harvest")
        ? Response.json({ ok: true, lifeMajor: product(1), result: { farmingXpGained: 5 } })
        : Response.json({ ok: true, result: { planted: 2, stoppedError: null } }),
    );

    const outcome = await runFarmHarvestAndReplant({
      plots: [
        { plotId: "p1", cropId: "wheat" },
        { plotId: "p2", cropId: "wheat" },
      ],
      request,
      onSuccess: vi.fn(),
    });

    expect(outcome.masterProduct).toEqual({ name: "명장 작물", count: 2 });
    expect(farmReplantOutcomeText(outcome)).toBe(
      "2칸을 수확하고 2칸에 다시 심었습니다. 농사 XP +10. 명장 작물 +2.",
    );
  });

  it("일괄 수확 문장 끝에 명장 작물을 적는다", () => {
    expect(
      farmBatchOutcomeText("harvest", 3, null, undefined, 135, 0, { name: "명장 작물", count: 1 }),
    ).toBe("3칸을 모두 수확했습니다. 농사 XP +135. 명장 작물 +1.");
  });
});

describe("식당 효과로 붙은 농사 경험치 표시(건의 #882)", () => {
  it("일괄 수확은 칸마다 붙은 식당 효과분을 더해 돌려준다", async () => {
    const bonuses = [1, 0, 2];
    let index = 0;
    const request = vi.fn(async () =>
      Response.json({
        ok: true,
        result: { farmingXpGained: 10 },
        diningXpBonus: { menuName: "일꾼 도시락", xp: bonuses[index++] },
      }),
    );
    const result = await runFarmPlotBatch({
      action: "harvest",
      plotIds: ["plot-1", "plot-2", "plot-3"],
      request,
      onSuccess: vi.fn(),
    });
    expect(result.diningXpBonus).toEqual({ menuName: "일꾼 도시락", xp: 3 });
  });

  it("수확 문구의 경험치 뒤에 식당 효과분을 적는다", () => {
    const diningXpBonus = { menuName: "일꾼 도시락", xp: 12 };
    expect(
      farmBatchOutcomeText("harvest", 3, null, undefined, 135, 0, null, diningXpBonus),
    ).toBe("3칸을 모두 수확했습니다. 농사 XP +135 (일꾼 도시락 +12).");
    expect(
      farmReplantOutcomeText({
        harvested: 3,
        planted: 3,
        farmingXpGained: 135,
        seedsReturned: 0,
        diningXpBonus,
      }),
    ).toBe("3칸을 수확하고 3칸에 다시 심었습니다. 농사 XP +135 (일꾼 도시락 +12).");
  });
});
