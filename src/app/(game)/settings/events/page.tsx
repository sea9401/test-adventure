import { V2EventsView } from "@/adventure/v2/V2EventsView";

export const metadata = {
  title: "이벤트 — 무슨무슨게임",
  robots: { index: false, follow: false },
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string | string[];
  }>;
}) {
  const params = await searchParams;
  // 끝난 추석 이벤트 링크(?tab=chuseok)를 포함해 알 수 없는 탭은 출석 체크로 연다.
  const initialTab =
    params.tab === "coupon"
      ? "coupon"
      : params.tab === "promotion"
        ? "promotion"
        : "attendance";

  return <V2EventsView initialTab={initialTab} />;
}
