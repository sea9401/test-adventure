import { describe, expect, it } from "vitest";
import { GM_TITLE_ID } from "@/adventure/data/titles";
import {
  accountOwnedTitleIds,
  accountOwnsTitle,
  titleIsAvailableToAccount,
} from "@/lib/server/titleAccess";

const logWithGm = {
  titles: {
    first_blood: { obtainedAt: 1 },
    [GM_TITLE_ID]: { obtainedAt: 2 },
  },
};

describe("account title access", () => {
  it("일반 계정에서는 저장 데이터에 GM이 있어도 숨기고 사용할 수 없다", () => {
    expect(accountOwnedTitleIds(logWithGm, false)).toEqual(["first_blood"]);
    expect(accountOwnsTitle(logWithGm, GM_TITLE_ID, false)).toBe(false);
    expect(titleIsAvailableToAccount(GM_TITLE_ID, false)).toBe(false);
  });

  it("어드민 계정에는 저장 없이 GM을 가상 보유로 제공한다", () => {
    expect(accountOwnedTitleIds({ titles: {} }, true)).toEqual([GM_TITLE_ID]);
    expect(accountOwnsTitle({ titles: {} }, GM_TITLE_ID, true)).toBe(true);
    expect(titleIsAvailableToAccount(GM_TITLE_ID, true)).toBe(true);
  });
});
