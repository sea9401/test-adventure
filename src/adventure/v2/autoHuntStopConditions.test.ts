import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_HUNT_STOP_CONFIG,
  getAutoHuntStopReason,
  normalizeAutoHuntStopConfig,
} from "@/adventure/v2/autoHuntStopConditions";

const snapshot = {
  hpCharges: 101,
  mpCharges: 101,
  hasMp: true,
  rareMapFound: false,
  level: 99,
};

describe("getAutoHuntStopReason", () => {
  it("stops when either used recovery charge reaches the configured threshold", () => {
    const config = {
      ...DEFAULT_AUTO_HUNT_STOP_CONFIG,
      potionEnabled: true,
      potionThreshold: 100,
    };

    expect(
      getAutoHuntStopReason(config, { ...snapshot, hpCharges: 100 }),
    ).toBe("potion");
    expect(
      getAutoHuntStopReason(config, { ...snapshot, mpCharges: 100 }),
    ).toBe("potion");
  });

  it("ignores MP charges for a character without MP", () => {
    const config = {
      ...DEFAULT_AUTO_HUNT_STOP_CONFIG,
      potionEnabled: true,
      potionThreshold: 100,
    };

    expect(
      getAutoHuntStopReason(config, {
        ...snapshot,
        mpCharges: 0,
        hasMp: false,
      }),
    ).toBeNull();
  });

  it("stops on a rare exploration map discovery or level 100", () => {
    expect(
      getAutoHuntStopReason(
        { ...DEFAULT_AUTO_HUNT_STOP_CONFIG, rareMapEnabled: true },
        { ...snapshot, rareMapFound: true },
      ),
    ).toBe("rare_map");
    expect(
      getAutoHuntStopReason(
        { ...DEFAULT_AUTO_HUNT_STOP_CONFIG, level100Enabled: true },
        { ...snapshot, level: 100 },
      ),
    ).toBe("level_100");
  });
});

describe("normalizeAutoHuntStopConfig", () => {
  it("uses safe defaults for malformed persisted values", () => {
    expect(
      normalizeAutoHuntStopConfig({
        potionEnabled: "yes",
        potionThreshold: -10,
        rareMapEnabled: true,
        level100Enabled: null,
      }),
    ).toEqual({
      potionEnabled: false,
      potionThreshold: 0,
      rareMapEnabled: true,
      level100Enabled: false,
    });
  });
});
