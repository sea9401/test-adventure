// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIFE_FIELD_ENVIRONMENTS } from "@/adventure/data/v2/lifeFieldEnvironment";
import { LifeFieldEnvironmentCard } from "./LifeFieldPanels";

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: value === "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function environmentPayload() {
  const current = {
    activity: "fishing" as const,
    spotId: "village_pier",
    dayKey: "2026-09-10",
    startsAt: 0,
    endsAt: 70_000,
    environment: LIFE_FIELD_ENVIRONMENTS.fishing_active_school,
  };
  return {
    ok: true as const,
    serverNow: 10_000,
    features: {
      environmentEnabled: true,
      discoveriesEnabled: true,
      discoveryRewardsEnabled: true,
      feedEnabled: true,
      milestonesEnabled: true,
    },
    environment: {
      current,
      next: {
        ...current,
        startsAt: 70_001,
        endsAt: 130_000,
        environment: LIFE_FIELD_ENVIRONMENTS.fishing_calm_water,
      },
    },
    trace: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LifeFieldEnvironmentCard refresh", () => {
  it("hidden에서 만료된 조회를 미루고 visible 복귀 때 한 번만 실행한다", async () => {
    const fetcher = vi.fn(async () => Response.json(environmentPayload()));
    vi.stubGlobal("fetch", fetcher);
    render(<LifeFieldEnvironmentCard activity="fishing" spotId="village_pier" />);

    await act(async () => Promise.resolve());
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => setVisibility("hidden"));
    act(() => window.dispatchEvent(new Event("focus")));
    await act(async () => vi.advanceTimersByTimeAsync(61_000));
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      setVisibility("visible");
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
