import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicMerchantInfo } from "@/lib/publicMerchantInfo";
import {
  MUSEUN_COIN_PRODUCT_IMAGES,
  MuseunCoinProductContent,
} from "./page";

const merchantInfo: PublicMerchantInfo = {
  legalName: "무슨게임",
  registrationNumber: "781-52-01091",
  representative: "홍길동",
  address: "서울특별시 테스트구 테스트로 1",
  contact: "02-0000-0000",
  mailOrderSalesNumber: null,
};

describe("public Museun Coin product page", () => {
  it("shows every real package with a distinct image and price", () => {
    const html = renderToStaticMarkup(
      <MuseunCoinProductContent merchantInfo={merchantInfo} />,
    );

    expect(new Set(Object.values(MUSEUN_COIN_PRODUCT_IMAGES)).size).toBe(4);
    for (const [coins, price] of [
      ["1,000", "10,000"],
      ["2,000", "20,000"],
      ["3,000", "30,000"],
      ["5,000", "50,000"],
    ]) {
      expect(html).toContain(`무슨 코인 ${coins}개`);
      expect(html).toContain(`${price}원`);
    }
    for (const imagePath of Object.values(MUSEUN_COIN_PRODUCT_IMAGES)) {
      expect(html).toContain(`src="${imagePath}"`);
    }
  });

  it("explains delivery, account restrictions, refunds, and seller identity", () => {
    const html = renderToStaticMarkup(
      <MuseunCoinProductContent merchantInfo={merchantInfo} />,
    );

    expect(html).toContain("결제 승인 직후 계정에 즉시 지급");
    expect(html).toContain("현금 환전이나 계정 간 이전은 지원하지 않습니다");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain("상호 무슨게임");
    expect(html).toContain("사업자등록번호 781-52-01091");
    expect(html).toContain("대표자 홍길동");
  });
});
