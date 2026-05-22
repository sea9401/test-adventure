import { notFound } from "next/navigation";
import { MapPreview } from "./MapPreview";

// dev/프리뷰 전용 — 로그인·DB 없이 MapView(권역 게이트 배너 등)를 시나리오별로 확인.
// production 에선 404(여기 가드 + /dev layout 가드 + auth.config /dev 제외 = 삼중 차단).
// ?scenario=N 딥링크 → 초기 시나리오 선택(curl 로 시나리오별 SSR 검증 가능).
export default async function MapPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { scenario } = await searchParams;
  const initialScenario = scenario ? Number.parseInt(scenario, 10) : 0;
  return <MapPreview initialScenario={initialScenario} />;
}
