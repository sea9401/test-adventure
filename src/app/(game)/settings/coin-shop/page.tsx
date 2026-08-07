import { notFound } from "next/navigation";
import { MuseunCoinShopView } from "@/adventure/v2/MuseunCoinShopView";
import { ensureUser } from "@/lib/server/ensureUser";
import { canAccessMuseunCoinShop } from "@/lib/server/museunCoinShopAccess";

export const metadata = {
  title: "무슨 코인 상점 — 무슨무슨게임",
  robots: { index: false, follow: false },
};

export default async function MuseunCoinShopPage() {
  const userId = await ensureUser();
  if (!userId || !(await canAccessMuseunCoinShop(userId))) notFound();
  return <MuseunCoinShopView />;
}
