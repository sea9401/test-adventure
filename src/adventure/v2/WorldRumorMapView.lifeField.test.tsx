// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIFE_FIELD_ENVIRONMENTS,
  lifeFieldEnvironmentForecast,
  lifeFieldEnvironmentSnapshot,
} from "@/adventure/data/v2/lifeFieldEnvironment";
import { WorldRumorMapView } from "./WorldRumorMapView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("생활 지도 현장 환경", () => {
  it("full 응답에서 선택 지역을 파생해 environment GET을 추가로 보내지 않는다", async () => {
    const now = Date.UTC(2026, 8, 10);
    const current = lifeFieldEnvironmentSnapshot("fishing", "village_pier", now);
    const next = lifeFieldEnvironmentForecast("fishing", "village_pier", now);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v2/life-fields") {
        return Response.json({
          ok: true,
          serverNow: now,
          features: {
            environmentEnabled: true,
            discoveriesEnabled: true,
            discoveryRewardsEnabled: true,
            feedEnabled: true,
            milestonesEnabled: true,
          },
          environments: {
            fishing: { village_pier: { current, next } },
          },
          summary: { basic: { discovered: 0, total: 0 }, rare: { discovered: 0, total: 0 }, entries: [] },
          daily: {},
          traces: {},
        });
      }
      if (url === "/api/v2/me/inventory") {
        return Response.json({ ok: true, materials: {} });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    render(<WorldRumorMapView />);

    expect(
      await screen.findByText(
        `오늘의 현장 · ${LIFE_FIELD_ENVIRONMENTS[current.environment.id].label}`,
      ),
    ).toBeTruthy();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/v2/life-fields",
      "/api/v2/me/inventory",
    ]);
  });
});
