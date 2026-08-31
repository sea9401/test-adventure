"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Inset } from "@/components/ui/Inset";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  subscribeGameDialogPresenter,
  type PresentedGameDialog,
} from "./gameDialog";

export function GameDialogHost() {
  const [dialog, setDialog] = useState<PresentedGameDialog | null>(null);

  useEffect(() => subscribeGameDialogPresenter(setDialog), []);

  return dialog ? (
    <OpenGameDialog dialog={dialog} onClear={() => setDialog(null)} />
  ) : null;
}

function OpenGameDialog({
  dialog,
  onClear,
}: {
  dialog: PresentedGameDialog;
  onClear: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const complete = useCallback(
    (confirmed: boolean) => {
      onClear();
      dialog.complete(confirmed);
    },
    [dialog, onClear],
  );
  const dismiss = useCallback(
    () => complete(dialog.kind === "alert"),
    [complete, dialog.kind],
  );

  useEscapeKey(dismiss);
  useModalA11y(panelRef);

  const confirmVariant =
    dialog.tone === "danger"
      ? "danger"
      : dialog.tone === "warning"
        ? "warning"
        : "primary";

  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) dismiss();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-dialog-title"
        aria-describedby="game-dialog-message"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-md px-5 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:p-5`}
      >
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          {dialog.kind === "alert" ? "알림" : "작업 확인"}
        </p>
        <h2
          id="game-dialog-title"
          className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100"
        >
          {dialog.title}
        </h2>
        <Inset
          as="p"
          padding="none"
          id="game-dialog-message"
          className="mt-4 whitespace-pre-line p-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200"
        >
          {dialog.message}
        </Inset>
        <div
          className={`mt-5 grid gap-2 ${dialog.kind === "confirm" ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {dialog.kind === "confirm" ? (
            <Button size="md" onClick={() => complete(false)}>
              {dialog.cancelLabel}
            </Button>
          ) : null}
          <Button
            size="md"
            variant={confirmVariant}
            onClick={() => complete(true)}
          >
            {dialog.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
