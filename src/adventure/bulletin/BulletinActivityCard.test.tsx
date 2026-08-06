import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { deriveBulletinActivity } from "@/lib/bulletinActivity";
import { BulletinActivityCard } from "./BulletinActivityCard";

describe("BulletinActivityCard", () => {
  it("다음 게시판 칭호 이정표를 안내한다", () => {
    const html = renderToStaticMarkup(
      <BulletinActivityCard
        activity={deriveBulletinActivity({
          creditedPosts: 25,
          creditedComments: 10,
          receivedLikes: 0,
        })}
      />,
    );

    expect(html).toContain("다음 칭호 · Lv.7 ‘광장의 조언자’");
  });

  it("최고 레벨에서는 모든 칭호 해금을 안내한다", () => {
    const html = renderToStaticMarkup(
      <BulletinActivityCard
        activity={deriveBulletinActivity({
          creditedPosts: 1_000,
          creditedComments: 1_000,
          receivedLikes: 1_000,
        })}
      />,
    );

    expect(html).toContain("게시판 칭호 보상을 모두 해금했습니다.");
  });
});
