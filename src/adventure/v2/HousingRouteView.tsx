"use client";

import { useRouter } from "next/navigation";
import { V2HousingView } from "./V2HousingView";

export function HousingRouteView({ playerName }: { playerName?: string }) {
  const router = useRouter();
  return (
    <V2HousingView
      playerName={playerName}
      onBack={playerName ? () => router.back() : () => router.push("/character")}
    />
  );
}
