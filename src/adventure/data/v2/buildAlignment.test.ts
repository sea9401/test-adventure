import { describe, expect, it } from "vitest";
import { deriveBuildAlignmentAdvisory } from "./buildAlignment";

describe("deriveBuildAlignmentAdvisory", () => {
  it("혈성기사처럼 물리 성장 중인 캐릭터는 장비 포함 마법 공격력이 높다는 뜻을 분명히 안내한다", () => {
    const advisory = deriveBuildAlignmentAdvisory({
      atk: 100,
      magicAtk: 500,
      grown: { str: 60, dex: 40, vit: 30 },
      jobBonus: { str: 9, vit: 6, spi: 5 },
    });

    expect(advisory).toMatchObject({
      focus: "magic",
      issues: ["growth", "job"],
    });
    expect(advisory?.message).toContain(
      "장비를 포함한 최종 마법 공격력이 물리 공격력보다 높지만",
    );
    expect(advisory?.message).toContain(
      "성장 능력치와 현재 직업 보너스는 물리 공격 쪽에 치우쳐 있습니다",
    );
    expect(advisory?.message).toContain("물리 빌드라면 무기·장비를");
  });

  it("마법 공격축에 물리 성장과 직업 보너스가 겹치면 두 문제를 안내한다", () => {
    expect(
      deriveBuildAlignmentAdvisory({
        atk: 100,
        magicAtk: 500,
        grown: { str: 0, dex: 100, vit: 0, int: 0, spi: 0, luk: 104 },
        jobBonus: { dex: 12, str: 5 },
      }),
    ).toMatchObject({ focus: "magic", issues: ["growth", "job"] });
  });

  it("마법 공격축과 INT·SPI 성장 및 직업이 맞으면 안내하지 않는다", () => {
    expect(
      deriveBuildAlignmentAdvisory({
        atk: 100,
        magicAtk: 500,
        grown: { str: 0, dex: 0, vit: 30, int: 80, spi: 40, luk: 20 },
        jobBonus: { int: 14, spi: 4 },
      }),
    ).toBeNull();
  });

  it("물리 공격축에 마법 성장과 직업 보너스가 치우친 경우도 안내한다", () => {
    expect(
      deriveBuildAlignmentAdvisory({
        atk: 500,
        magicAtk: 100,
        grown: { str: 0, dex: 0, vit: 10, int: 80, spi: 40, luk: 50 },
        jobBonus: { int: 14, spi: 4 },
      }),
    ).toMatchObject({ focus: "physical", issues: ["growth", "job"] });
  });

  it("LUK·VIT 성장만으로는 어느 공격축에도 불일치 판정을 내리지 않는다", () => {
    expect(
      deriveBuildAlignmentAdvisory({
        atk: 100,
        magicAtk: 500,
        grown: { str: 0, dex: 0, vit: 100, int: 0, spi: 0, luk: 100 },
        jobBonus: { vit: 10, luk: 5 },
      }),
    ).toBeNull();
  });

  it("주 공격축은 반대 공격력의 1.25배부터 판정한다", () => {
    const input = {
      grown: { str: 0, dex: 100, vit: 0, int: 0, spi: 0, luk: 0 },
      jobBonus: {},
    };
    expect(
      deriveBuildAlignmentAdvisory({ ...input, atk: 100, magicAtk: 124 }),
    ).toBeNull();
    expect(
      deriveBuildAlignmentAdvisory({ ...input, atk: 100, magicAtk: 125 }),
    ).toMatchObject({ focus: "magic", issues: ["growth"] });
  });
});
