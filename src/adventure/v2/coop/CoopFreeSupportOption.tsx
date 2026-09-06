"use client";

export function CoopFreeSupportOption({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (allowed: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-emerald-600"
        />
        무료 토벌 지원 허용
      </label>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">
        지원자는 스태미나 소모 없이 공격하며, 해당 공격의 기여도와 처치 확정타
        보상은 없습니다. 기존 일반 공격으로 얻은 보상 자격은 유지됩니다.
      </p>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">
        지원 공격으로 보스가 처치되면 토벌이 종료됩니다. 소환자가 진행 중에도
        변경할 수 있습니다.
      </p>
    </div>
  );
}
