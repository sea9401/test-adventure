"use client";

import { useRouter } from "next/navigation";
import { V2LifeRecordView } from "@/adventure/v2/V2LifeRecordView";

// /character/life — 농사·벌목·채광·낚시·요리와 장인 기록을 한 화면에서 확인한다.
export default function CharacterLifePage() {
  const router = useRouter();
  return <V2LifeRecordView onBack={() => router.push("/character")} />;
}
