import { notFound } from "next/navigation";
import { MuseunCoinPaymentsAdmin } from "@/admin/MuseunCoinPaymentsAdmin";
import { isCurrentUserAdmin } from "@/lib/server/isAdmin";

export const metadata = {
  title: "결제 운영 — 무슨무슨게임",
  robots: { index: false, follow: false },
};

export default async function MuseunCoinPaymentsAdminPage() {
  if (!(await isCurrentUserAdmin())) notFound();
  return <MuseunCoinPaymentsAdmin />;
}
