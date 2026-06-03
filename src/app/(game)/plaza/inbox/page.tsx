"use client";

import { useRouter } from "next/navigation";
import { V2InboxView } from "@/adventure/v2/V2InboxView";

// /plaza/inbox — 우편함. 받은 쪽지 + 마켓 정산·보상 확인·수령.
export default function InboxPage() {
  const router = useRouter();
  return <V2InboxView onBack={() => router.push("/plaza")} />;
}
