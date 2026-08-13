import { SURFACE_CARD } from "@/components/ui/surfaces";
import { Button } from "../../ui/Field";

export function ReviewOpPresetSection({
  disabled,
  applying,
  onApply,
}: {
  disabled: boolean;
  applying: boolean;
  onApply: () => void;
}) {
  return (
    <section className={`${SURFACE_CARD} p-3`}>
      <h2 className="text-sm font-semibold">심의용 OP 세팅</h2>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-600 dark:text-zinc-400">
        레벨과 전투 능력치, 숙련도, 재화, 회복약을 심의용 기준으로
        상향하고 최종 사냥터까지 개방합니다. 현재 직업·스킬·퀘스트와 장비는
        유지됩니다.
      </p>
      <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
        상향된 성장 수치와 진행도는 자동으로 되돌아가지 않습니다.
      </p>
      <Button
        variant="primary"
        className="mt-3"
        disabled={disabled || applying}
        onClick={onApply}
      >
        {applying ? "적용 중…" : "심의용 OP 세팅 적용"}
      </Button>
    </section>
  );
}
