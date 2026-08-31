export type GameDialogTone = "default" | "warning" | "danger";

export type GameConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: GameDialogTone;
};

export type GameAlertOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  tone?: GameDialogTone;
};

export type ConfirmGameAction = (
  input: string | GameConfirmOptions,
) => Promise<boolean>;

export type PresentedGameDialog = {
  kind: "confirm" | "alert";
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone: GameDialogTone;
  complete: (confirmed: boolean) => void;
};

type PendingGameDialog = Omit<PresentedGameDialog, "complete"> & {
  resolve: (confirmed: boolean) => void;
};

type GameDialogPresenter = (dialog: PresentedGameDialog) => void;

const queue: PendingGameDialog[] = [];
let presenter: GameDialogPresenter | null = null;
let active: PendingGameDialog | null = null;

function presentNext(): void {
  if (!presenter || active || queue.length === 0) return;
  const pending = queue.shift();
  if (!pending) return;
  active = pending;
  presenter({
    kind: pending.kind,
    title: pending.title,
    message: pending.message,
    confirmLabel: pending.confirmLabel,
    cancelLabel: pending.cancelLabel,
    tone: pending.tone,
    complete: (confirmed) => {
      if (active !== pending) return;
      active = null;
      pending.resolve(confirmed);
      presentNext();
    },
  });
}

function normalizeConfirm(
  input: string | GameConfirmOptions,
): Omit<PendingGameDialog, "resolve"> {
  const options = typeof input === "string" ? { message: input } : input;
  return {
    kind: "confirm",
    title: options.title?.trim() || "확인이 필요합니다",
    message: options.message,
    confirmLabel: options.confirmLabel?.trim() || "확인",
    cancelLabel: options.cancelLabel?.trim() || "취소",
    tone: options.tone ?? "warning",
  };
}

function normalizeAlert(
  input: string | GameAlertOptions,
): Omit<PendingGameDialog, "resolve"> {
  const options = typeof input === "string" ? { message: input } : input;
  return {
    kind: "alert",
    title: options.title?.trim() || "안내",
    message: options.message,
    confirmLabel: options.confirmLabel?.trim() || "확인",
    tone: options.tone ?? "default",
  };
}

function enqueue(
  dialog: Omit<PendingGameDialog, "resolve">,
): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ ...dialog, resolve });
    presentNext();
  });
}

export const confirmGameAction: ConfirmGameAction = (input) =>
  enqueue(normalizeConfirm(input));

export async function showGameAlert(
  input: string | GameAlertOptions,
): Promise<void> {
  await enqueue(normalizeAlert(input));
}

export function subscribeGameDialogPresenter(
  nextPresenter: GameDialogPresenter,
): () => void {
  presenter = nextPresenter;
  presentNext();
  return () => {
    if (presenter !== nextPresenter) return;
    presenter = null;
    if (active) {
      queue.unshift(active);
      active = null;
    }
  };
}
