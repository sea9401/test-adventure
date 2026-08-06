import { describe, expect, it } from "vitest";
import {
  BEGGAR_TITLE_ID,
  GM_TITLE_ID,
  SHATTERED_DREAM_TITLE_ID,
  TINY_CATCH_TITLE_ID,
  TITLES,
} from "@/adventure/data/titles";

describe("히든 업적 칭호", () => {
  it.each([
    BEGGAR_TITLE_ID,
    GM_TITLE_ID,
    TINY_CATCH_TITLE_ID,
    SHATTERED_DREAM_TITLE_ID,
  ])("%s는 획득 전 도감에 노출되지 않는다", (titleId) => {
    expect(TITLES[titleId]).toMatchObject({ id: titleId, hidden: true });
  });

  it("GM 칭호는 어드민 계정 전용이다", () => {
    expect(TITLES[GM_TITLE_ID]).toMatchObject({
      id: GM_TITLE_ID,
      name: "GM",
      hidden: true,
      adminOnly: true,
    });
  });
});
