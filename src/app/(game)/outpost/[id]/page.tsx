import { redirect } from "next/navigation";

// /outpost/[id] — 지도/전쟁 거점 제거 후 남은 옛 링크는 길드로 보낸다.
export default function OutpostPage() {
  redirect("/guild");
}
