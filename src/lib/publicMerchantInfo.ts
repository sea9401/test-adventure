export const PUBLIC_MERCHANT_LEGAL_NAME = "무슨게임";
export const PUBLIC_MERCHANT_REGISTRATION_NUMBER = "781-52-01091";

export type PublicMerchantInfo = {
  legalName: string;
  registrationNumber: string;
  representative: string;
  address: string;
  contact: string;
  mailOrderSalesNumber: string | null;
};

type PublicMerchantEnv = Record<string, string | undefined>;

/** 결제 심사와 전자상거래 고지에 필요한 공개 사업자 정보만 반환한다. */
export function readPublicMerchantInfo(
  env: PublicMerchantEnv = process.env,
): PublicMerchantInfo | null {
  const representative = env.PUBLIC_MERCHANT_REPRESENTATIVE?.trim() ?? "";
  const address = env.PUBLIC_MERCHANT_ADDRESS?.trim() ?? "";
  const contact = env.PUBLIC_MERCHANT_CONTACT?.trim() ?? "";

  if (!representative || !address || !contact) return null;

  return {
    legalName: PUBLIC_MERCHANT_LEGAL_NAME,
    registrationNumber: PUBLIC_MERCHANT_REGISTRATION_NUMBER,
    representative,
    address,
    contact,
    mailOrderSalesNumber:
      env.PUBLIC_MERCHANT_MAIL_ORDER_SALES_NUMBER?.trim() || null,
  };
}
