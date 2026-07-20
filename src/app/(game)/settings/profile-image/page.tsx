import { V2ProfileImageView } from "@/adventure/v2/V2ProfileImageView";

export const metadata = {
  title: "프로필 이미지 — 무슨무슨게임",
  robots: { index: false, follow: false },
};

export default function ProfileImagePage() {
  return <V2ProfileImageView />;
}
