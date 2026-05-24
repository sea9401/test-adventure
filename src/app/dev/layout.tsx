import { notFound } from "next/navigation";

// 모든 /dev/* 프리뷰 라우트 일괄 가드.
// production 빌드에선 통째로 404. 다만 staging(IS_STAGING=true)은 통과 — 게이트로
// 외부 차단되고 운영자 검증용. 라이브 prod(IS_STAGING 미설정)는 그대로 404.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  return <>{children}</>;
}
