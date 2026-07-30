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
  const initialTab = params.tab === "coupon" ? "coupon" : "promotion";

  return <V2EventsView initialTab={initialTab} />;
}
