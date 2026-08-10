import { describe, expect, it } from "vitest";
import {
  buildLifeFieldCodexPayload,
  buildLifeFieldEnvironmentPayload,
  parseLifeFieldView,
} from "./lifeFieldView";

const features = {
  environmentEnabled: true,
  discoveriesEnabled: true,
  discoveryRewardsEnabled: true,
  feedEnabled: true,
  milestonesEnabled: true,
};

describe("parseLifeFieldView", () => {
  it.each([
    ["https://game.test/api/v2/life-fields", { kind: "full" }],
    ["https://game.test/api/v2/life-fields?view=codex", { kind: "codex" }],
    [
      "https://game.test/api/v2/life-fields?view=environment&activity=fishing&spotId=village_pier",
      { kind: "environment", activity: "fishing", spotId: "village_pier" },
    ],
  ])("%s를 유효한 조회 범위로 파싱한다", (url, expected) => {
    expect(parseLifeFieldView(url)).toEqual(expected);
  });

  it.each([
    "https://game.test/api/v2/life-fields?view=all",
    "https://game.test/api/v2/life-fields?view=environment&activity=fishing",
    "https://game.test/api/v2/life-fields?view=environment&activity=unknown&spotId=village_pier",
    "https://game.test/api/v2/life-fields?view=environment&activity=fishing&spotId=pine_grove",
  ])("잘못된 범위 %s를 거부한다", (url) => {
    expect(parseLifeFieldView(url)).toBeNull();
  });
});

describe("scoped life field payloads", () => {
  it("환경 응답에는 한 지역 환경과 해당 활동 흔적만 넣는다", () => {
    const trace = {
      discoveryId: "fishing_migrating_school",
      activity: "fishing",
      sourceId: "village_pier",
      environmentId: "fishing_active_school",
      foundAt: 1_786_330_800_000,
      progress: 1,
    } as const;
    const payload = buildLifeFieldEnvironmentPayload({
      now: Date.parse("2026-08-10T12:00:00+09:00"),
      features,
      activity: "fishing",
      spotId: "village_pier",
      trace,
    });

    expect(Object.keys(payload)).toEqual([
      "ok",
      "serverNow",
      "features",
      "environment",
      "trace",
    ]);
    expect(payload.environment?.current.spotId).toBe("village_pier");
    expect(payload.environment?.next.spotId).toBe("village_pier");
    expect(payload.trace).toEqual(trace);
    expect(payload).not.toHaveProperty("summary");
    expect(payload).not.toHaveProperty("daily");
  });

  it("도감 응답에는 진행도만 넣고 지역 환경을 만들지 않는다", () => {
    const progress = {
      summary: {
        basic: { discovered: 2, total: 6 },
        rare: { discovered: 1, total: 3 },
        entries: [],
      },
      daily: { fishing: { evaluated: 1 } },
      state: { traces: {} },
    };

    const payload = buildLifeFieldCodexPayload({
      now: 1_786_330_800_000,
      features,
      progress: progress as never,
    });

    expect(Object.keys(payload)).toEqual([
      "ok",
      "serverNow",
      "features",
      "summary",
      "daily",
      "traces",
    ]);
    expect(payload.summary).toBe(progress.summary);
    expect(payload).not.toHaveProperty("environments");
  });
});
