import { describe, expect, it } from "vitest";
import { TITLES } from "@/adventure/data/titles";
import { DEEP_STAGE_TITLE_IDS, DEEP_STAGE_TITLE_STAGES } from "./dungeonDeepStage";

describe("심층 단계 칭호", () => {
  it("던전별 10·20·30단계 칭호가 칭호 목록에 있다", () => {
    const names: string[] = [];
    for (const [dungeon, label] of [["storm", "폭풍 원정"], ["sanctuary", "태초의 성소"]] as const) {
      for (const stage of DEEP_STAGE_TITLE_STAGES) {
        const title = TITLES[DEEP_STAGE_TITLE_IDS[dungeon][stage]];
        expect(title?.condition).toBe(`${label} 심층 ${stage}단계 완주`);
        names.push(title.name);
      }
    }
    expect(names).toEqual([
      "폭풍 심층 항해자",
      "폭풍 심층 정복자",
      "폭풍의 끝을 본 자",
      "성소 심층 순례자",
      "성소 심층 수호자",
      "태초의 끝을 본 자",
    ]);
  });
});
