import { notFound } from "next/navigation";
import { MapPreview } from "./MapPreview";

// dev/프리뷰 전용 — 로그인·DB 없이 MapView(권역 게이트 배너 등)를 시나리오별로 확인.
// production 에선 라우트 자체가 404 → 운영(msmsge.com)엔 절대 노출 안 됨.
// (미들웨어 PUBLIC_PATHS 의 /dev 도 production 에선 빠져 이중 차단.)
export default function MapPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MapPreview />;
}
