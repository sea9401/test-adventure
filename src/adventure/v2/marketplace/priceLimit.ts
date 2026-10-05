// 거래소 가격·입찰 상한. 서버 검증(marketplaceV2.ts)과 화면 입력 검증이 같은 값을 쓴다.
// DB 컬럼은 bigint라 2^31 제약이 없고, 5% 입찰 증분이 정수로 정확하도록 안전 정수보다 충분히 낮게 둔다.
export const MARKETPLACE_V2_PRICE_MAX = 9_999_999_999;
export const MARKETPLACE_V2_PRICE_MAX_LABEL = MARKETPLACE_V2_PRICE_MAX.toLocaleString("ko-KR");
