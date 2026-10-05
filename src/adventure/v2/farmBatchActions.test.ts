import { describe, expect, it, vi } from "vitest";
import {
  farmBatchOutcomeText,
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
