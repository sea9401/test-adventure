import { notFound } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/server/isAdmin";
import { FiefdomPreviewClient } from "./FiefdomPreviewClient";

// 길드 영지(Fiefdom) 라이브 모드 운영자 전용 미리보기.
// /dev/fiefdom-live 와 동일한 컴포넌트를 띄우지만, /dev/* 는 production 빌드에서 통째로
// 404 라 EC2 에서 못 본다. 이 라우트는 ADMIN_EMAILS 화이트리스트로만 통과(비인가 404).
// 길드 영지 시스템 자체는 본토 wiring 분리(NEXT_PUBLIC_FIEFDOM_ENABLED=false)로 일반 유저
// 노출은 그대로 차단 — 이 게이트는 그 분리를 깨지 않고 운영자만 라이브 동작 확인용.
export const metadata = {
  title: "길드 영지 미리보기 — 무슨무슨게임",
  robots: { index: false, follow: false },
};

export default async function FiefdomPreviewPage() {
  if (!(await isCurrentUserAdmin())) notFound();
  return <FiefdomPreviewClient />;
}
