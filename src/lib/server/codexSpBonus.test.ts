import { describe, expect, it, vi } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { FISH_IDS } from "@/adventure/data/v2/fish";
import { emptyFishCodex, registerFishSpecimen } from "@/adventure/v2/fishingCodex";
const { readSave, readSaves } = vi.hoisted(() => ({
  readSave: vi.fn(),
  readSaves: vi.fn(),
}));

vi.mock("./savesKv", () => ({ readSave, readSaves }));

import { codexSpBonusFromRaw, readCodexSpBonus } from "./codexSpBonus";

describe("codexSpBonusFromRaw", () => {
  it("장비 도감 SP 보너스를 total 에 포함한다", () => {
    const registeredIds = Object.keys(V2_EQUIPMENT).slice(0, 15);
    const bonus = codexSpBonusFromRaw({}, { registeredIds });

    expect(bonus.fishSp).toBe(0);
    expect(bonus.equipmentSp).toBe(2);
    expect(bonus.total).toBe(2);
  });

  it("장비 raw 를 넘기지 않으면 어보 도감 total 만 계산한다", () => {
    const bonus = codexSpBonusFromRaw({});

    expect(bonus.equipmentSp).toBe(0);
    expect(bonus.total).toBe(0);
  });

  it("직접 포획 여부와 무관하게 현재 보유한 어보 등록권만 SP로 계산한다", () => {
    let codex = emptyFishCodex();
    for (const fishId of FISH_IDS.slice(0, 5)) {
      codex = registerFishSpecimen(codex, fishId).codex;
    }

    const bonus = codexSpBonusFromRaw(codex);

    expect(bonus.fishSp).toBe(1);
    expect(bonus.total).toBe(1);
  });
});

describe("readCodexSpBonus", () => {
  it("어보·장비 도감 입력을 한 번의 multi-key read로 가져온다", async () => {
    readSaves.mockResolvedValueOnce({
      "fishing-codex.v1": { fish: {} },
      "equipment-codex.v1": {
        registeredIds: Object.keys(V2_EQUIPMENT).slice(0, 15),
      },
    });
    const bonus = await readCodexSpBonus({} as never, "u-1");

    expect(bonus.equipmentSp).toBe(2);
    expect(readSaves).toHaveBeenCalledTimes(1);
    expect(readSave).not.toHaveBeenCalled();
  });
});
