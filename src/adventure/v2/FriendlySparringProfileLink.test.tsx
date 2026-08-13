import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FriendlySparringProfileLink } from "./FriendlySparringProfileLink";

describe("FriendlySparringProfileLink", () => {
  it("다른 유저의 서버 권위 닉네임으로 친선전 링크를 만든다", () => {
    const html = renderToStaticMarkup(
      <FriendlySparringProfileLink name="대표 닉네임" isSelf={false} />,
    );
    expect(html).toContain("이 모험가와 친선전");
    expect(html).toContain(
      "target=%EB%8C%80%ED%91%9C%20%EB%8B%89%EB%84%A4%EC%9E%84",
    );
  });

  it("자기 자신의 공개 프로필에는 친선전 링크를 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <FriendlySparringProfileLink name="나" isSelf />,
    );
    expect(html).toBe("");
  });
});
