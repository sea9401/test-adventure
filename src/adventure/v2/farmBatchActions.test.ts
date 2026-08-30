import { describe, expect, it, vi } from "vitest";
import {
  farmBatchOutcomeText,
  runFarmPlotBatch,
} from "./farmBatchActions";

describe("runFarmPlotBatch", () => {
  it("선택한 밭을 입력 순서대로 심고 모든 성공 응답을 전달한다", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const farmVersions: number[] = [];
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ ok: true, farmVersion: requests.length });
    });

    const result = await runFarmPlotBatch<{
      ok: boolean;
      farmVersion: number;
    }>({
      action: "plant",
      plotIds: ["plot-3", "plot-1", "plot-2"],
      cropId: "wheat",
      request,
      onSuccess: (data) => farmVersions.push(data.farmVersion),
    });

    expect(requests).toEqual([
      {
        url: "/api/v2/farm/plant",
        body: { plotId: "plot-3", cropId: "wheat" },
      },
      {
        url: "/api/v2/farm/plant",
        body: { plotId: "plot-1", cropId: "wheat" },
      },
      {
        url: "/api/v2/farm/plant",
        body: { plotId: "plot-2", cropId: "wheat" },
      },
    ]);
    expect(farmVersions).toEqual([1, 2, 3]);
    expect(result).toEqual({ completed: 3, error: null, farmingXpGained: 0 });
  });

  it("중간 요청이 실패하면 이후 밭을 처리하지 않는다", async () => {
    const requestedPlotIds: string[] = [];
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { plotId: string };
      requestedPlotIds.push(body.plotId);
      if (body.plotId === "plot-2") {
        return Response.json(
          { ok: false, error: "no_seed" },
          { status: 409 },
        );
      }
      return Response.json({ ok: true });
    });

    const result = await runFarmPlotBatch({
      action: "plant",
      plotIds: ["plot-1", "plot-2", "plot-3"],
      cropId: "wheat",
      request,
      onSuccess: vi.fn(),
    });

    expect(requestedPlotIds).toEqual(["plot-1", "plot-2"]);
    expect(result).toEqual({
      completed: 1,
      error: "no_seed",
      farmingXpGained: 0,
    });
  });

  it("여러 밭 수확 응답의 농사 XP를 합산한다", async () => {
    const xpByPlot = { "plot-1": 30, "plot-2": 45, "plot-3": 60 };
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { plotId: keyof typeof xpByPlot };
      return Response.json({
        ok: true,
        result: { farmingXpGained: xpByPlot[body.plotId] },
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
