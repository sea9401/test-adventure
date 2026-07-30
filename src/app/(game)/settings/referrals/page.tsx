import { permanentRedirect } from "next/navigation";

export const metadata = {
  title: "게임 홍보 — 무슨무슨게임",
  robots: { index: false, follow: false },
};

export default function ReferralsPage() {
  permanentRedirect("/settings/events");
}
