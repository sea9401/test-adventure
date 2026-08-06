import { describe, expect, it } from "vitest";
import {
  isAnonymousMarketplaceMail,
  visibleInboxSenderName,
} from "./inboxPrivacy";

describe("inbox privacy", () => {
  it("거래소 구매 물품과 판매 대금에서는 상대 이름을 숨긴다", () => {
    expect(isAnonymousMarketplaceMail("purchase_item")).toBe(true);
    expect(isAnonymousMarketplaceMail("sale_proceeds")).toBe(true);
    expect(visibleInboxSenderName("purchase_item", "판매자")).toBeNull();
    expect(visibleInboxSenderName("sale_proceeds", "구매자")).toBeNull();
  });

  it("쪽지와 선물 등 직접 발송 우편은 보낸 사람을 유지한다", () => {
    expect(isAnonymousMarketplaceMail("user_message")).toBe(false);
    expect(visibleInboxSenderName("user_message", "모험가")).toBe("모험가");
    expect(visibleInboxSenderName("recipe_gift", null)).toBeNull();
  });
});
