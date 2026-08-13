import { describe, expect, it } from "vitest";
import { evaluateRuntimeObjectives } from "./opsServiceObjectives";

function snapshot({ p95, requests, errors }: { p95: number; requests: number; errors: number }) {
  return {
    enabled: true,
    current: {
      features: {
        combat: {
          requests,
          errors,
          durationMs: { p95 },
        },
      },
    },
    history: [],
  };
}

describe("operations service objectives", () => {
  it("API p95와 오류율이 목표를 넘으면 위반으로 표시한다", () => {
    const objectives = evaluateRuntimeObjectives(
      snapshot({ p95: 1_500, requests: 100, errors: 2 }),
    );

    expect(objectives).toContainEqual(
      expect.objectContaining({
        key: "api-p95",
        status: "breached",
        observed: 1_500,
      }),
    );
    expect(objectives).toContainEqual(
      expect.objectContaining({
        key: "api-error-rate",
        status: "breached",
        observed: 2,
      }),
    );
  });

  it("요청 표본이 있으면 목표 이내 지표를 정상으로 표시한다", () => {
    const objectives = evaluateRuntimeObjectives(
      snapshot({ p95: 500, requests: 1_000, errors: 3 }),
    );

    expect(objectives.find((row) => row.key === "api-p95")).toMatchObject({
      status: "healthy",
      observed: 500,
    });
    expect(
      objectives.find((row) => row.key === "api-error-rate"),
    ).toMatchObject({ status: "healthy", observed: 0.3 });
  });

  it("프로파일러나 외부 신호가 없으면 건강하다고 추정하지 않는다", () => {
    const objectives = evaluateRuntimeObjectives(null);

    expect(objectives).toHaveLength(5);
    expect(objectives.every((row) => row.status === "unknown")).toBe(true);
    expect(objectives.map((row) => row.key)).toEqual([
      "public-availability",
      "api-p95",
      "api-error-rate",
      "backup-freshness",
      "critical-cron-freshness",
    ]);
  });
});
