"use client";

import { WoodcuttingView } from "./WoodcuttingView";
import { useWoodcutting } from "./useWoodcutting";

export function WoodcuttingPanel({ onBack }: { onBack: () => void }) {
  const handlers = useWoodcutting();
  return <WoodcuttingView {...handlers} onBack={onBack} />;
}
