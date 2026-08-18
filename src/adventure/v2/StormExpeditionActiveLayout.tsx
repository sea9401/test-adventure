import type { ReactNode } from "react";

export function StormExpeditionActiveLayout({
  currentAction,
  routePlanner,
  support,
}: {
  currentAction: ReactNode;
  routePlanner: ReactNode;
  support: ReactNode;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)] md:items-start">
      <div
        data-testid="storm-expedition-current-action"
        className="order-1 md:col-start-2 md:row-start-1"
      >
        {currentAction}
      </div>
      <div
        data-testid="storm-expedition-route-planner"
        className="order-2 space-y-4 md:col-start-1 md:row-span-2 md:row-start-1"
      >
        {routePlanner}
      </div>
      <div
        data-testid="storm-expedition-support"
        className="order-3 md:col-start-2 md:row-start-2"
      >
        {support}
      </div>
    </div>
  );
}
