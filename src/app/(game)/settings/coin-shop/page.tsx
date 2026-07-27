import { notFound } from "next/navigation";
import { MuseunCoinShopView } from "@/adventure/v2/MuseunCoinShopView";

export const metadata = {
  title: "무슨 코인 상점 — 무슨무슨게임",
  robots: { index: false, follow: false },
};

export default function MuseunCoinShopPage() {
  if (process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN !== "true") notFound();
  return <MuseunCoinShopView />;
}
