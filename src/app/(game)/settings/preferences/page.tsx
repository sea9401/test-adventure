import { V2PreferencesView } from "@/adventure/v2/V2PreferencesView";

export const metadata = {
  title: "환경 설정 — 무슨무슨게임",
  robots: { index: false, follow: false },
};

export default function PreferencesPage() {
  return <V2PreferencesView />;
}
