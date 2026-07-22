import { redirect } from "next/navigation";
import { V2AdventureHome } from "@/adventure/v2/V2AdventureHome";
import { auth } from "@/auth";

// / — 모험 탭 home. 캐릭터 상태 + 안내/공지.
export default async function AdventurePage() {
  // 검색 로봇과 비로그인 방문자에게 빈 게임 셸을 200으로 내리지 않고 공개 대문으로
  // 서버 리다이렉트한다. 로그인 사용자의 게임 진입 경로는 그대로 유지된다.
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  return <V2AdventureHome />;
}
