import { LandingContent } from "../../sign-in/LandingContent";

// 대문(랜딩) 프리뷰 — 로그인·DB 없이 비주얼 QA. 운영 빌드에선 404(dev layout 가드).
// 통계는 mock 으로 주입(실페이지 /sign-in 은 auth + DB 카운트).
export default function LandingPreview() {
  return <LandingContent total={1284} online={37} />;
}
