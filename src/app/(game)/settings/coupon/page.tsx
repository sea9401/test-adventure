import { permanentRedirect } from "next/navigation";

export const metadata = {
  title: "쿠폰 등록 — 무슨무슨게임",
  robots: { index: false, follow: false },
};

export default function CouponPage() {
  permanentRedirect("/settings/events?tab=coupon");
}
