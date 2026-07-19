import { notFound } from "next/navigation";
import { MuseunCoinShopView } from "@/adventure/v2/MuseunCoinShopView";
import { isCurrentUserAdmin } from "@/lib/server/isAdmin";

export const metadata = {
  title: "무슨 코인 상점 — 무슨무슨게임",
  robots: { index: false, follow: false },
};

export default async function MuseunCoinShopPage() {
  if (!(await isCurrentUserAdmin())) notFound();
  return <MuseunCoinShopView />;
}
