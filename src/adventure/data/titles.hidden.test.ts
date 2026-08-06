import { describe, expect, it } from "vitest";
import {
  BEGGAR_TITLE_ID,
  SHATTERED_DREAM_TITLE_ID,
  TINY_CATCH_TITLE_ID,
  TITLES,
} from "@/adventure/data/titles";

describe("히든 업적 칭호", () => {
  it.each([
    BEGGAR_TITLE_ID,
    TINY_CATCH_TITLE_ID,
    SHATTERED_DREAM_TITLE_ID,
  ])("%s는 획득 전 도감에 노출되지 않는다", (titleId) => {
    expect(TITLES[titleId]).toMatchObject({ id: titleId, hidden: true });
  });
});
