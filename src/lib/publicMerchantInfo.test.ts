import { describe, expect, it } from "vitest";
import {
  PUBLIC_MERCHANT_LEGAL_NAME,
  PUBLIC_MERCHANT_REGISTRATION_NUMBER,
  readPublicMerchantInfo,
} from "./publicMerchantInfo";

describe("public merchant information", () => {
  it("keeps the legal business identity in one public source", () => {
    expect(PUBLIC_MERCHANT_LEGAL_NAME).toBe("무슨게임");
    expect(PUBLIC_MERCHANT_REGISTRATION_NUMBER).toBe("781-52-01091");
  });

  it("returns a complete disclosure when required public fields exist", () => {
    expect(
      readPublicMerchantInfo({
        PUBLIC_MERCHANT_REPRESENTATIVE: "홍길동",
        PUBLIC_MERCHANT_ADDRESS: "서울특별시 테스트구 테스트로 1",
        PUBLIC_MERCHANT_CONTACT: "02-0000-0000",
        PUBLIC_MERCHANT_MAIL_ORDER_SALES_NUMBER: "제2026-서울테스트-0001호",
      }),
    ).toEqual({
      legalName: "무슨게임",
      registrationNumber: "781-52-01091",
      representative: "홍길동",
      address: "서울특별시 테스트구 테스트로 1",
      contact: "02-0000-0000",
      mailOrderSalesNumber: "제2026-서울테스트-0001호",
    });
  });

  it("does not expose a partial disclosure", () => {
    expect(
      readPublicMerchantInfo({
        PUBLIC_MERCHANT_REPRESENTATIVE: "홍길동",
        PUBLIC_MERCHANT_ADDRESS: "서울특별시 테스트구 테스트로 1",
      }),
    ).toBeNull();
  });
});
