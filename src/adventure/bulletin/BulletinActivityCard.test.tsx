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

  it("Lv.10에서는 Lv.11 진행도와 Lv.15 칭호를 안내한다", () => {
    const html = renderToStaticMarkup(
      <BulletinActivityCard
        activity={deriveBulletinActivity({
          creditedPosts: 0,
          creditedComments: 460,
          receivedLikes: 0,
        })}
      />,
    );

    expect(html).toContain("460 / 585점");
    expect(html).toContain("다음 칭호 · Lv.15 ‘광장 원로’");
  });

  it("Lv.15에서는 Lv.20 칭호를 안내한다", () => {
    const html = renderToStaticMarkup(
      <BulletinActivityCard
        activity={deriveBulletinActivity({
          creditedPosts: 0,
          creditedComments: 1_285,
          receivedLikes: 0,
        })}
      />,
    );

    expect(html).toContain("다음 칭호 · Lv.20 ‘광장의 전설’");
  });

  it("Lv.20에서는 최고 레벨과 모든 칭호 해금을 안내한다", () => {
    const html = renderToStaticMarkup(
      <BulletinActivityCard
        activity={deriveBulletinActivity({
          creditedPosts: 0,
          creditedComments: 2_610,
          receivedLikes: 0,
        })}
      />,
    );

    expect(html).toContain("최고 레벨");
    expect(html).toContain("게시판 칭호 보상을 모두 해금했습니다.");
  });
});
