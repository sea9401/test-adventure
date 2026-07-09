import { redirect } from "next/navigation";

// /battle/subjugation — 전쟁 토벌 제거 후 남은 옛 링크는 전투 홈으로 보낸다.
export default function SubjugationPage() {
  redirect("/battle");
}
