import { redirect } from "next/navigation";

// /map — 지도 플레이 제거 후 남은 옛 링크는 전투 홈으로 보낸다.
export default function MapPage() {
  redirect("/battle");
}
