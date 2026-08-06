"use client";

import { useRouter } from "next/navigation";
import { AdventurerAssociationView } from "@/adventure/v2/association/AdventurerAssociationView";

export default function AdventurerAssociationPage() {
  const router = useRouter();
  return <AdventurerAssociationView onBack={() => router.push("/town")} />;
}
