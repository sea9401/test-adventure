import { describe, expect, it } from "vitest";
import {
  applyGuildFacilitySupport,
  guildFacilitySupportAllocation,
} from "./guildFacilitySupport";

describe("guildFacilitySupport", () => {
  it("통나무와 철광석이 충분히 부족하면 100개씩 지원한다", () => {
    expect(
      guildFacilitySupportAllocation(
        { crop: 500, ore: 500 },
        { crop: 100, ore: 50 },
      ),
    ).toEqual({ crop: 100, ore: 100, total: 200 });
  });

  it("한쪽의 남는 몫을 다른 재료에 넘긴다", () => {
    expect(
      guildFacilitySupportAllocation(
        { crop: 500, ore: 500 },
        { crop: 460, ore: 100 },
      ),
    ).toEqual({ crop: 40, ore: 160, total: 200 });
  });

  it("한 재료만 필요하면 200개를 모두 지원한다", () => {
    expect(
      guildFacilitySupportAllocation({ ore: 500 }, { ore: 250 }),
    ).toEqual({ crop: 0, ore: 200, total: 200 });
  });

  it("합산 부족량이 200개보다 적으면 지원할 수 없다", () => {
    expect(
      guildFacilitySupportAllocation(
        { crop: 500, ore: 500 },
        { crop: 420, ore: 400 },
      ),
    ).toBeNull();
  });

  it("고급 목재와 광석은 지원 계산에 포함하지 않는다", () => {
    expect(
      guildFacilitySupportAllocation(
        { v2_birch_log: 600, v2_copper_ore: 600 },
        {},
      ),
    ).toBeNull();
  });

  it("계산한 지원량만 기존 공동 기부 진행도에 더한다", () => {
    expect(
      applyGuildFacilitySupport(
        { crop: 460, ore: 100, v2_birch_log: 25 },
        { crop: 40, ore: 160, total: 200 },
      ),
    ).toEqual({ crop: 500, ore: 260, v2_birch_log: 25 });
  });
});
