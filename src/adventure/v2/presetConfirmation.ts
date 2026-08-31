import {
  confirmGameAction,
  type ConfirmGameAction,
} from "@/components/ui/gameDialog";

type PresetConfirmationArgs = {
  name: string;
  onConfirm: () => void | Promise<void>;
  confirm?: ConfirmGameAction;
};

export async function confirmPresetOverwrite({
  name,
  onConfirm,
  confirm = confirmGameAction,
}: PresetConfirmationArgs): Promise<boolean> {
  const confirmed = await confirm({
    title: "프리셋 덮어쓰기",
    message: `'${name}' 프리셋을 현재 세팅으로 덮어쓸까요?\n기존에 저장된 구성은 복구할 수 없습니다.`,
    confirmLabel: "덮어쓰기",
    cancelLabel: "취소",
    tone: "warning",
  });
  if (!confirmed) return false;
  await onConfirm();
  return true;
}

export async function confirmPresetDelete({
  name,
  onConfirm,
  confirm = confirmGameAction,
}: PresetConfirmationArgs): Promise<boolean> {
  const confirmed = await confirm({
    title: "프리셋 삭제",
    message: `'${name}' 프리셋을 삭제할까요?\n삭제한 프리셋은 복구할 수 없습니다.`,
    confirmLabel: "삭제",
    cancelLabel: "취소",
    tone: "danger",
  });
  if (!confirmed) return false;
  await onConfirm();
  return true;
}
