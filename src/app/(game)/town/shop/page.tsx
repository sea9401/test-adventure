import { redirect } from "next/navigation";

// 일반 상점은 인벤토리의 장비 정리 기능으로 통합되었다.
// 저장된 북마크와 옛 튜토리얼 링크는 인벤토리로 안전하게 보낸다.
export default function ShopPage() {
  redirect("/character/inventory");
}
