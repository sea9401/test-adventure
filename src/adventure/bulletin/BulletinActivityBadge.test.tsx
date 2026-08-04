import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { deriveBulletinActivity } from "@/lib/bulletinActivity";
import {
  BulletinActivityBadge,
  bulletinActivityBadgeClass,
} from "./BulletinActivityBadge";

describe("BulletinActivityBadge", () => {
  it("레벨 1~10에 서로 다른 색상을 적용한다", () => {
    const classes = Array.from({ length: 10 }, (_, index) =>
      bulletinActivityBadgeClass(index + 1),
    );

    expect(new Set(classes).size).toBe(10);
    expect(classes[0]).toContain("emerald");
    expect(classes[9]).toContain("amber");
  });

  it("범위를 벗어난 레벨은 양 끝 색상으로 안전하게 제한한다", () => {
    expect(bulletinActivityBadgeClass(0)).toBe(
      bulletinActivityBadgeClass(1),
    );
    expect(bulletinActivityBadgeClass(99)).toBe(
      bulletinActivityBadgeClass(10),
    );
  });

  it("상세 배지에는 레벨과 등급명을 함께 표시한다", () => {
    const html = renderToStaticMarkup(
      <BulletinActivityBadge
        activity={deriveBulletinActivity({
          creditedPosts: 25,
          creditedComments: 10,
          receivedLikes: 0,
        })}
        showTitle
      />,
    );

    expect(html).toContain("Lv.5 단골");
    expect(html).toContain("border-blue-300");
  });
});
