import { describe, expect, it } from "vitest";
import { friendlySparringHref } from "./friendlySparringLink";

describe("friendlySparringHref", () => {
  it("닉네임을 친선전 딥링크에 한 번만 안전하게 인코딩한다", () => {
    expect(friendlySparringHref("검 은&별")).toBe(
      "/battle/sparring?mode=friendly&target=%EA%B2%80%20%EC%9D%80%26%EB%B3%84",
    );
  });
});
