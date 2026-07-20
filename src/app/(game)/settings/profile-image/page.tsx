import { V2CosmeticsView } from "@/adventure/v2/V2CosmeticsView";

export const metadata = {
  title: "프로필 이미지 — 무슨무슨게임",
  robots: { index: false, follow: false },
};

export default function ProfileImagePage() {
  return <V2CosmeticsView initialTab="profile_image" />;
}
