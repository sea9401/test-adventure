import {
  PUBLIC_MERCHANT_LEGAL_NAME,
  PUBLIC_MERCHANT_REGISTRATION_NUMBER,
  type PublicMerchantInfo,
} from "@/lib/publicMerchantInfo";

export function MerchantDisclosure({
  merchantInfo,
  className = "",
}: {
  merchantInfo: PublicMerchantInfo | null;
  className?: string;
}) {
  return (
    <section
      aria-label="사업자 정보"
      className={`text-xs leading-6 text-zinc-500 dark:text-zinc-400 ${className}`}
    >
      <dl className="flex flex-wrap justify-center gap-x-4 gap-y-1 sm:justify-start">
        <div>
          <dt className="sr-only">상호</dt>
          <dd>상호 {merchantInfo?.legalName ?? PUBLIC_MERCHANT_LEGAL_NAME}</dd>
        </div>
        <div>
          <dt className="sr-only">사업자등록번호</dt>
          <dd>
            사업자등록번호{" "}
            {merchantInfo?.registrationNumber ??
              PUBLIC_MERCHANT_REGISTRATION_NUMBER}
          </dd>
        </div>
        {merchantInfo && (
          <>
            <div>
              <dt className="sr-only">대표자</dt>
              <dd>대표자 {merchantInfo.representative}</dd>
            </div>
            <div className="basis-full sm:basis-auto">
              <dt className="sr-only">사업장 주소</dt>
              <dd>사업장 주소 {merchantInfo.address}</dd>
            </div>
            <div>
              <dt className="sr-only">고객센터</dt>
              <dd>고객센터 {merchantInfo.contact}</dd>
            </div>
            {merchantInfo.mailOrderSalesNumber && (
              <div>
                <dt className="sr-only">통신판매업 신고번호</dt>
                <dd>
                  통신판매업 신고번호 {merchantInfo.mailOrderSalesNumber}
                </dd>
              </div>
            )}
          </>
        )}
      </dl>
    </section>
  );
}
