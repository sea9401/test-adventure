"use client";

import { V2ShopView } from "@/adventure/v2/V2ShopView";

// 상점 UI 프리뷰 — 구매 표(정렬 가능) 레이아웃 QA. 구매 목록은 정적 카탈로그(SHOP_IDS_BY_SLOT)
// 라 로그인/DB 없이도 렌더된다(골드·보유수는 0). 헤더 클릭 정렬 동작 확인용.
export default function ShopPreview() {
  return (
    <div className="mx-auto max-w-2xl p-2">
      <div className="m-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV</strong> · 상점 — 구매 표 레이아웃/정렬 QA. 헤더(아이템/가격/위력·무게)
        클릭으로 정렬. 골드 0이라 구매 버튼은 비활성.
      </div>
      <V2ShopView onBack={() => {}} />
    </div>
  );
}
