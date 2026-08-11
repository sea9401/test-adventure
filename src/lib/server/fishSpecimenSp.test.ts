import { describe, expect, it } from "vitest";
import { FISH_IDS } from "@/adventure/data/v2/fish";
import {
  emptyFishCodex,
  registerFishSpecimen,
} from "@/adventure/v2/fishingCodex";
import { fishSpecimenExtractionProjection } from "./fishSpecimenSp";

function registeredCodex(count: number) {
  let codex = emptyFishCodex();
  for (const fishId of FISH_IDS.slice(0, count)) {
    codex = registerFishSpecimen(codex, fishId).codex;
  }
  return codex;
}

describe("표본 추출 SP 예측", () => {
  it("마일스톤 아래로 내려가면 어보와 전체 SP를 각각 1 줄인다", () => {
    expect(
      fishSpecimenExtractionProjection({
        codex: registeredCodex(5),
        fishId: FISH_IDS[0],
        totalSpBefore: 30,
        equippedSpUsed: 29,
      }),
    ).toMatchObject({
      fishSpBefore: 1,
      fishSpAfter: 0,
      totalSpBefore: 30,
      totalSpAfter: 29,
      spLoss: 1,
      equippedSpUsed: 29,
      overBudget: false,
    });
  });

  it("추출 뒤 현재 장착 스킬이 한도를 넘으면 차단 대상으로 판정한다", () => {
    expect(
      fishSpecimenExtractionProjection({
        codex: registeredCodex(5),
        fishId: FISH_IDS[0],
        totalSpBefore: 30,
        equippedSpUsed: 30,
      }),
    ).toMatchObject({ totalSpAfter: 29, spLoss: 1, overBudget: true });
  });

  it("마일스톤 사이의 등록권 추출은 전체 SP를 줄이지 않는다", () => {
    expect(
      fishSpecimenExtractionProjection({
        codex: registeredCodex(6),
        fishId: FISH_IDS[0],
        totalSpBefore: 30,
        equippedSpUsed: 30,
      }),
    ).toMatchObject({
      fishSpBefore: 1,
      fishSpAfter: 1,
      totalSpAfter: 30,
      spLoss: 0,
      overBudget: false,
    });
  });
});
