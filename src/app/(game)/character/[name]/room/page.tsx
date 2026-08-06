"use client";

import { useParams, useRouter } from "next/navigation";
import { V2HousingView } from "@/adventure/v2/V2HousingView";

export default function PlayerHousingPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const raw = Array.isArray(params.name) ? params.name[0] : params.name;
  let name = raw ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {
    // Next 16 의 raw 동적 세그먼트가 이미 디코드됐거나 잘못된 경우 원문을 사용한다.
  }
  return <V2HousingView playerName={name} onBack={() => router.back()} />;
}
