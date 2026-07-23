"use client";

import { CookingPot, PottedPlant } from "@phosphor-icons/react";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { CookingPanel } from "./CookingPanel";

export function KitchenPanel({
  onBack,
  onOpenFarm,
}: {
  onBack: () => void;
  onOpenFarm: () => void;
}) {
  return (
    <PageShell spacing="tight">
      <SubViewHeader
        title={
          <>
            <CookingPot size={20} weight="duotone" aria-hidden />
            주방
          </>
        }
        onBack={onBack}
        right={
          <button
            type="button"
            onClick={onOpenFarm}
            className="flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950"
          >
            <PottedPlant size={15} weight="duotone" aria-hidden />
            농장
          </button>
        }
      />
      <CookingPanel />
    </PageShell>
  );
}
