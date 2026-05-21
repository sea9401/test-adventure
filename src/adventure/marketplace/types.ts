// 거래소 클라이언트 internal 타입. 서버 응답 wire shape 와 다른 점: 변형 키 필드가
// 서버는 historically `grade` 인데 클라 내부는 `variantKey` 로 통일됨 (LOW #23). api.ts
// 의 fetchListings/buyListing/claimInbox 가 wire→internal 매핑을 수행.

import type { EquipVariantKey } from "@/adventure/inventory/vaultOps";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";

export type ItemKind = "equip" | "material" | "recipe" | "skill_book";

export type Listing = {
  id: number;
  sellerId: string;
  sellerName: string;
  isMine: boolean;
  itemKind: ItemKind;
  itemId: string;
  itemName: string;
  // 장비 변형 키 — equip 만 의미. vault/도감/거래소 공통 규약.
  // 서버는 marketplace_listings.grade 컬럼에 같은 값 저장. wire 변환은 api.ts.
  variantKey: EquipVariantKey;
  quantity: number;
  price: number;
  createdAt: string;
  // 인스턴스 매물(강화/부여 별빛 무구·고리) — 있으면 강화/부여/롤 표시에 사용. 서버 GET 이 surface.
  instance?: EquipmentInstance;
};

export type ListResponse = {
  items: Listing[];
  nextCursor: string | null;
};

export type SortMode = "recent" | "price_asc" | "price_desc";
