import { notFound } from "next/navigation";

// 모든 /dev/* 프리뷰 라우트 일괄 가드 — production 빌드에선 통째로 404.
// (각 page.tsx 의 개별 가드 + auth.config 의 /dev public 제외와 함께 삼중 차단.)
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <>{children}</>;
}
