import { describe, expect, it } from "vitest";
import { deriveMonsterHuntCodex } from "./monsterHuntCodex";

describe("몬스터 처치 현황", () => {
  it("현재 사냥 가능 종과 과거 삭제 몬스터 기록을 구분한다", () => {
    const codex = deriveMonsterHuntCodex({
      monsters: {
        들개: { kills: 2 },
        모래도마뱀: { kills: 0 },
        "과거의 몬스터": { kills: 4 },
        "손상된 기록": { kills: "invalid" },
      },
    });

    expect(codex).toMatchObject({
      huntableSpecies: 65,
      currentKilled: 1,
      recordedSpecies: 2,
      legacyKilled: 1,
    });
    expect(codex.entries.find((entry) => entry.name === "들개")).toMatchObject({
      areas: ["들판"],
      defeated: true,
      kills: 2,
    });
    expect(
      codex.entries.find((entry) => entry.name === "모래도마뱀"),
    ).toMatchObject({ defeated: false, kills: 0 });
    expect(codex.entries.some((entry) => entry.name === "과거의 몬스터")).toBe(
      false,
    );
  });

  it("저장값이 없으면 현재 60종을 모두 미처치로 표시한다", () => {
    const codex = deriveMonsterHuntCodex(null);

    expect(codex.currentKilled).toBe(0);
    expect(codex.recordedSpecies).toBe(0);
    expect(codex.entries.every((entry) => !entry.defeated)).toBe(true);
  });
});
