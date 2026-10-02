import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 주 행동 버튼과 선택 탭은 화면 스타일이 바꾸는 의미 토큰을 써야 금빛에서도 금색이 된다.
//   손으로 보라·남색을 칠한 주 버튼이 다시 생기지 않게 정리한 파일을 고정한다.
const PRIMARY_BUTTON_FILES = [
  "src/adventure/v2/V2LoadoutPresetsPanel.tsx",
  "src/adventure/v2/V2CouponView.tsx",
  "src/adventure/v2/V2CharacterCard.tsx",
  "src/adventure/v2/V2ProfileImageView.tsx",
  "src/adventure/v2/GuildFoundCard.tsx",
  "src/adventure/v2/item-card/V2ItemCardPopover.tsx",
  "src/adventure/v2/guild/GuildAlchemyWorkshopPanel.tsx",
  "src/app/create/CreateCharacterFlow.tsx",
];

const HAND_PAINTED_PRIMARY =
  /bg-(?:violet|indigo)-600[^"`]*text-white[^"`]*hover:bg-(?:violet|indigo)-[5-7]00|text-white[^"`]*hover:bg-(?:violet|indigo)-[5-7]00/;

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("주 행동 색 토큰", () => {
  it.each(PRIMARY_BUTTON_FILES)("%s의 주 버튼은 의미 토큰을 쓴다", (path) => {
    const source = read(path);
    expect(source).not.toMatch(HAND_PAINTED_PRIMARY);
    expect(source).toContain("bg-primary");
  });

  it("홈 랭킹 미리보기의 선택 탭은 선택 토큰을 쓴다", () => {
    const source = read("src/adventure/v2/AdventureRankingPreview.tsx");
    expect(source).toContain("text-selected");
    expect(source).toContain("after:bg-selected-line");
    expect(source).not.toContain("after:bg-violet-600");
  });
});
