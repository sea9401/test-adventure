import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasCompletedOnboarding } from "@/lib/server/profile";
import { CreateCharacterPageContents } from "./CreateCharacterPageContents";

// 캐릭터 생성 페이지. 신규 유저는 카카오 로그인 직후(callbackUrl=/create) 또는 대문의
// "시작하기"로 들어온다. 이름·외형 → 속성 선택 후 게임(/)으로 진입.
// server component 로 두고 client boundary 는 CreateCharacterPageContents 가 명시
// (SaveProvider/STARTER_SAVES 의 client hook chain 이 server build graph 로 끌려오는 것 회피).
export default async function CreatePage() {
  const session = await auth();
  // 비로그인은 미들웨어가 이미 /sign-in 으로 보내지만 방어적으로 한 번 더.
  if (!session?.user) redirect("/sign-in");
  // 이미 캐릭터를 만든 유저(복귀 로그인 등)는 생성 화면 대신 게임으로. callbackUrl=/create 로
  // 들어온 기존 유저가 속성 단계를 다시 보고 덮어쓰는 것을 막는다. OnboardingGate 와 동일
  // 기준(hasCompletedOnboarding)이라 / ↔ /create 핑퐁 없음.
  if (await hasCompletedOnboarding(session.user.id)) redirect("/");
  return <CreateCharacterPageContents />;
}
